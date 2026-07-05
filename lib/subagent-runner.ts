import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Message } from "@earendil-works/pi-ai";

export interface SubagentRequest {
  cwd: string;
  prompt: string;
  provider?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface SubagentResult {
  exitCode: number;
  outputText: string;
  stderr: string;
}

export type SubagentRunner = (request: SubagentRequest) => Promise<SubagentResult>;

let runnerOverride: SubagentRunner | undefined;

export function setSubagentRunnerForTests(runner: SubagentRunner | undefined): void {
  runnerOverride = runner;
}

export function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }

  return { command: "pi", args };
}

export function getFinalOutput(messages: Message[]): string {
  const assistantTexts = messages
    .filter((message): message is Extract<Message, { role: "assistant" }> => message.role === "assistant")
    .flatMap((message) =>
      message.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text),
    );

  return assistantTexts.join("\n").trim();
}

export async function runSubagent(request: SubagentRequest): Promise<SubagentResult> {
  if (runnerOverride) {
    return runnerOverride(request);
  }

  const args: string[] = ["--mode", "json", "-p", "--no-session"];
  if (request.provider) {
    args.push("--provider", request.provider);
  }
  if (request.model) {
    args.push("--model", request.model);
  }
  args.push(request.prompt);

  let stderr = "";
  const messages: Message[] = [];

  const exitCode = await new Promise<number>((resolve) => {
    const invocation = getPiInvocation(args);
    const proc = spawn(invocation.command, invocation.args, {
      cwd: request.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";

    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: { type?: string; message?: Message };
      try {
        event = JSON.parse(line) as { type?: string; message?: Message };
      } catch {
        return;
      }

      if (event.type === "message_end" && event.message) {
        messages.push(event.message);
      }
    };

    proc.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (buffer.trim()) processLine(buffer);
      resolve(code ?? 0);
    });

    proc.on("error", (error) => {
      stderr += error.message;
      resolve(1);
    });

    if (request.signal) {
      const kill = () => {
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      };
      if (request.signal.aborted) kill();
      else request.signal.addEventListener("abort", kill, { once: true });
    }
  });

  if (exitCode !== 0 && !getFinalOutput(messages)) {
    const message = stderr.trim() || "Failed to run subagent. Ensure `pi` is available in PATH.";
    return { exitCode, outputText: "", stderr: message };
  }

  return {
    exitCode,
    outputText: getFinalOutput(messages),
    stderr,
  };
}

export function createEchoSubagentRunner(summaryText = "Delegated git summary."): SubagentRunner {
  return async () => ({
    exitCode: 0,
    outputText: summaryText,
    stderr: "",
  });
}
