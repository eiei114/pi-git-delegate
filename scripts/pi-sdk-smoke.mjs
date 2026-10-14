import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  behaviorAssertions, DELEGATED_SUMMARY, EXTENSION_LOAD_ERROR_PATTERN, SDK_VERSIONS,
  UNHANDLED_ERROR_PATTERN, VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";
import { scrubLocalPaths } from "./pi-sdk-smoke-artifacts.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const REPORT_PATH = resolve(ROOT, "docs/verification/pi-sdk-smoke.json");
const ARTIFACT_DIR = resolve(ROOT, "docs/verification/pi-sdk-smoke");
const PROBE_TIMEOUT_MS = 15_000;
// Allow for cold native-shell startup on hosted Windows while keeping a hard deadline.
const NATIVE_SHELL_TIMEOUT_MS = 30_000;
const CLEANUP_GRACE_MS = 1_000;
const OWNED_TREE_CLEANUP_MS = 700;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const PROVIDER = "pi-sdk-smoke";
const MODEL = "deterministic";
const COMMAND = "npm run smoke:pi";
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function createDeterministicCompletionServer() {
  const requests = [];
  let callNumber = 0;
  const server = createServer((request, response) => {
    if (!new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]).has(request.socket.remoteAddress)) {
      response.writeHead(403).end();
      return;
    }
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_OUTPUT_BYTES) chunks.push(chunk);
      else response.destroy();
    });
    request.on("end", () => {
      if (size > MAX_OUTPUT_BYTES) return;
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        response.writeHead(400).end();
        return;
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const userText = messages.filter((message) => message?.role === "user")
        .map((message) => typeof message.content === "string" ? message.content
          : Array.isArray(message.content) ? message.content.filter((part) => part?.type === "text").map((part) => part.text).join("\n")
            : "").join("\n");
      const hasToolResult = messages.some((message) => message?.role === "tool" || message?.role === "toolResult");
      const testPrompt = userText.match(/PI_SDK_SMOKE_(HAPPY|ERROR|RELOAD)/)?.[1] ?? null;
      const kind = testPrompt ? "feature-driver" : hasToolResult ? "feature-followup" : "subagent";
      const toolNames = Array.isArray(body.tools)
        ? body.tools.map((tool) => tool?.function?.name).filter((name) => typeof name === "string") : [];
      requests.push({ kind, test_prompt: testPrompt, tool_names: toolNames,
        loopback: true, model: typeof body.model === "string" ? body.model : null });

      let toolCalls = [];
      if (!hasToolResult && testPrompt === "HAPPY") {
        toolCalls = [
          { name: "git_diff_summary", args: { ref: "HEAD", provider: PROVIDER, model: MODEL } },
          { name: "git_log_summary", args: { range: "HEAD~1..HEAD", provider: PROVIDER, model: MODEL } },
          { name: "git_blame_summary", args: { path: "tracked.txt", ref: "HEAD", provider: PROVIDER, model: MODEL } },
        ];
      } else if (!hasToolResult && testPrompt === "ERROR") {
        toolCalls = [{ name: "git_blame_summary", args: {
          path: "missing-smoke-target.txt", ref: "HEAD", provider: PROVIDER, model: MODEL,
        } }];
      } else if (!hasToolResult && testPrompt === "RELOAD") {
        toolCalls = [{ name: "git_diff_summary", args: { ref: "HEAD", provider: PROVIDER, model: MODEL } }];
      }

      const id = `pi-sdk-smoke-${++callNumber}`;
      const choice = toolCalls.length > 0
        ? { index: 0, message: { role: "assistant", content: null,
          tool_calls: toolCalls.map((tool, index) => ({ id: `${id}-tool-${index}`, type: "function",
            function: { name: tool.name, arguments: JSON.stringify(tool.args) } })) }, finish_reason: "tool_calls" }
        : { index: 0, message: { role: "assistant", content: kind === "subagent"
          ? DELEGATED_SUMMARY : "The real Pi extension tool call completed." }, finish_reason: "stop" };
      const completion = { id, object: "chat.completion", created: 0, model: MODEL, choices: [choice],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
      if (body.stream === false) {
        response.writeHead(200, { "content-type": "application/json", connection: "close" });
        response.end(JSON.stringify(completion));
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "close" });
      const { message, finish_reason } = choice;
      const delta = toolCalls.length > 0
        ? { role: "assistant", tool_calls: message.tool_calls }
        : { role: "assistant", content: message.content };
      response.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 0, model: MODEL,
        choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 0, model: MODEL,
        choices: [{ index: 0, delta: {}, finish_reason }] })}\n\n`);
      response.end("data: [DONE]\n\n");
    });
  });
  return { server, requests };
}

function runGit(cwd, args, env) {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8", timeout: 5_000,
    maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr || result.error?.message || result.status}`);
  }
  return result.stdout.trim();
}

function createGitFixture(cwd, env) {
  mkdirSync(cwd, { recursive: true });
  runGit(cwd, ["init", "-q"], env);
  runGit(cwd, ["config", "user.name", "Pi SDK Smoke"], env);
  runGit(cwd, ["config", "user.email", "pi-sdk-smoke@example.invalid"], env);
  writeFileSync(join(cwd, "tracked.txt"), "alpha line\nunchanged line\n", "utf8");
  runGit(cwd, ["add", "tracked.txt"], env);
  runGit(cwd, ["commit", "-q", "-m", "fixture baseline"], env);
  writeFileSync(join(cwd, "tracked.txt"), "alpha line\nunchanged line\ncommitted beta\n", "utf8");
  runGit(cwd, ["add", "tracked.txt"], env);
  runGit(cwd, ["commit", "-q", "-m", "fixture feature commit"], env);
  writeFileSync(join(cwd, "tracked.txt"), "alpha line\nunchanged line\ncommitted beta\nworking tree delta\n", "utf8");
}

function killOwnedTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try { child.kill("SIGTERM"); } catch { /* exact owned child only */ }
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8", timeout: 250, windowsHide: true,
    });
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* process group may already have exited */ }
  const escalation = setTimeout(() => {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* process group may already have exited */ }
  }, 450);
  escalation.unref();
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function commandResponse(records, id) {
  return records.find((record) => record?.type === "response" && record.id === id);
}

async function runPiHost({ cli, cwd, agentDir, gitConfig, model = false, prompt }) {
  const args = [cli, "--offline", "--no-session", "--no-builtin-tools", "--no-extensions", "--no-mcp",
    "--no-skills", "--no-context-files", "--no-prompt-templates", "-e", resolve(ROOT, "extensions/index.ts")];
  if (model) args.push("--provider", PROVIDER, "--model", MODEL);
  args.push("--mode", "rpc");
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1",
    GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    detached: process.platform !== "win32" });
  const rows = [];
  const waiters = [];
  let stdout = "";
  let stderr = "";
  let lineBuffer = "";
  let totalBytes = 0;
  let protocolInvalid = false;
  let failure = null;
  let timeoutReached = false;
  let closeInfo = null;
  let cleanupUsed = false;
  let closedResolve;
  const closed = new Promise((resolveClosed) => { closedResolve = resolveClosed; });

  function rejectWaiters(reason) {
    while (waiters.length > 0) waiters.shift().reject(new Error(reason));
  }
  function fail(reason) {
    failure ??= reason;
    rejectWaiters(failure);
  }
  function acceptRow(row) {
    rows.push(row);
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index];
      if (!waiter.predicate(row)) continue;
      waiters.splice(index, 1);
      waiter.resolve(row);
    }
  }
  function readStdout(chunk) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_OUTPUT_BYTES) {
      fail("rpc_output_limit");
      return;
    }
    stdout += chunk.toString("utf8");
    lineBuffer += chunk.toString("utf8");
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try { acceptRow(JSON.parse(line.replace(/\r$/, ""))); }
      catch { protocolInvalid = true; fail("rpc_stdout_not_jsonl"); }
    }
  }
  child.stdout.on("data", readStdout);
  child.stderr.on("data", (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes > MAX_OUTPUT_BYTES) {
      fail("rpc_output_limit");
      return;
    }
    stderr += chunk.toString("utf8");
  });
  child.stdin.on("error", () => {});
  child.on("error", (error) => fail(`spawn_error:${error.message}`));
  child.on("close", (code, signal) => {
    if (lineBuffer.trim()) {
      try { acceptRow(JSON.parse(lineBuffer.replace(/\r$/, ""))); }
      catch { protocolInvalid = true; fail("rpc_stdout_not_jsonl"); }
      lineBuffer = "";
    }
    closeInfo = { code, signal };
    rejectWaiters("process_closed_before_expected_response");
    closedResolve(closeInfo);
  });
  const deadline = setTimeout(() => {
    timeoutReached = true;
    fail("rpc_deadline_15000ms");
    cleanupUsed = true;
    killOwnedTree(child);
  }, PROBE_TIMEOUT_MS);

  function waitFor(predicate) {
    const existing = rows.find(predicate);
    if (existing) return Promise.resolve(existing);
    if (failure) return Promise.reject(new Error(failure));
    return new Promise((resolveWaiter, rejectWaiter) => waiters.push({ predicate,
      resolve: resolveWaiter, reject: rejectWaiter }));
  }
  async function send(command) {
    const responseId = command.id;
    const response = waitFor((row) => row?.type === "response" && row.id === responseId);
    child.stdin.write(`${JSON.stringify(command)}\n`);
    const result = await response;
    if (result.success !== true) throw new Error(`rpc_command_failed:${command.type}`);
    return result;
  }

  let commandList = [];
  let promptResult = null;
  try {
    const inventory = await send({ id: "smoke-get-commands", type: "get_commands" });
    commandList = Array.isArray(inventory.data?.commands)
      ? inventory.data.commands.map((command) => command.name).filter((name) => typeof name === "string") : [];
    if (prompt) {
      promptResult = await send({ id: "smoke-prompt", type: "prompt", message: prompt });
      await waitFor((row) => row?.type === "agent_settled");
    }
  } catch (error) {
    fail(error.message);
  } finally {
    clearTimeout(deadline);
    if (child.stdin.writable && !child.stdin.destroyed) child.stdin.end();
    if (!closeInfo) {
      const naturallyClosed = await Promise.race([closed.then(() => true), delay(CLEANUP_GRACE_MS).then(() => false)]);
      if (!naturallyClosed) {
        cleanupUsed = true;
        killOwnedTree(child);
        await Promise.race([closed, delay(OWNED_TREE_CLEANUP_MS)]);
      }
    }
  }
  const exit_code = closeInfo?.code ?? 1;
  return {
    records: rows, commands: commandList, prompt_response: promptResult,
    exit_code, natural_exit: closeInfo?.code === 0 && !timeoutReached && !cleanupUsed,
    stderr, failure, timeout_reached: timeoutReached, cleanup_used: cleanupUsed,
    protocol_invalid: protocolInvalid, stdout, exit_signal: closeInfo?.signal ?? null,
  };
}

async function runNativeHostShell({ cli, agentDir, gitConfig, expectedVersion }) {
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1",
    GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
  let executable;
  let args;
  if (process.platform === "win32") {
    executable = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    args = ["-NoProfile", "-NonInteractive", "-Command",
      `& ${quote(process.execPath)} ${quote(cli)} --version; exit $LASTEXITCODE`];
  } else {
    executable = "/bin/sh";
    args = ["-c", '"$1" "$2" --version', "pi-sdk-host-shell", process.execPath, cli];
  }
  const child = spawn(executable, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    detached: process.platform !== "win32" });
  let stdout = "";
  let stderr = "";
  let totalBytes = 0;
  let closeInfo = null;
  let timedOut = false;
  let cleanupUsed = false;
  let closeResolve;
  const closed = new Promise((resolveClosed) => { closeResolve = resolveClosed; });
  const capture = (target, chunk) => {
    totalBytes += chunk.length;
    if (totalBytes > MAX_OUTPUT_BYTES) {
      cleanupUsed = true;
      killOwnedTree(child);
      return;
    }
    if (target === "stdout") stdout += chunk.toString("utf8");
    else stderr += chunk.toString("utf8");
  };
  child.stdout.on("data", (chunk) => capture("stdout", chunk));
  child.stderr.on("data", (chunk) => capture("stderr", chunk));
  child.on("error", (error) => { stderr += error.message; });
  child.on("close", (code, signal) => { closeInfo = { code, signal }; closeResolve(closeInfo); });
  const deadline = setTimeout(() => {
    timedOut = true;
    cleanupUsed = true;
    killOwnedTree(child);
  }, NATIVE_SHELL_TIMEOUT_MS);
  if (!closeInfo) {
    const completed = await Promise.race([closed.then(() => true), delay(NATIVE_SHELL_TIMEOUT_MS).then(() => false)]);
    if (!completed) {
      timedOut = true;
      cleanupUsed = true;
      killOwnedTree(child);
      await Promise.race([closed, delay(OWNED_TREE_CLEANUP_MS)]);
    }
  }
  clearTimeout(deadline);
  return { stdout, stderr, exit_code: closeInfo?.code ?? 1,
    natural_exit: closeInfo?.code === 0 && !timedOut && !cleanupUsed,
    timeout_reached: timedOut, cleanup_used: cleanupUsed, exit_signal: closeInfo?.signal ?? null,
    expected_version: expectedVersion };
}

function persistArtifact(name, captures, providerRequests) {
  const artifactPath = join(ARTIFACT_DIR, `${name}.json`);
  const artifact = {
    schema_version: 1,
    case: name,
    command: COMMAND,
    captures,
    deterministic_provider_requests: providerRequests,
  };
  const serializedArtifact = JSON.stringify(artifact, null, 2);
  writeFileSync(artifactPath, `${scrubLocalPaths(serializedArtifact, [
    { path: ROOT, replacement: "<repo>" },
    { path: tmpdir(), replacement: "<temp>" },
  ])}\n`, "utf8");
  return `docs/verification/pi-sdk-smoke/${name}.json`;
}

async function main() {
  const manifest = readJson(join(ROOT, "package.json"));
  const packageDir = join(ROOT, "node_modules/@earendil-works/pi-coding-agent");
  const packageManifest = readJson(join(packageDir, "package.json"));
  const sdkVersions = Object.fromEntries(Object.keys(SDK_VERSIONS).map((name) =>
    [name, readJson(join(ROOT, "node_modules", name, "package.json")).version]));
  if (JSON.stringify(sdkVersions) !== JSON.stringify(SDK_VERSIONS)
      || Object.entries(SDK_VERSIONS).some(([name, version]) => manifest.devDependencies?.[name] !== version)) {
    throw new Error("Installed Pi SDK packages must exactly match the frozen 1.1.0 dev/test pins.");
  }
  if (packageManifest.name !== "@earendil-works/pi-coding-agent" || typeof packageManifest.bin?.pi !== "string") {
    throw new Error("Installed Pi coding-agent manifest has no valid local CLI entry point.");
  }
  const cli = resolve(packageDir, packageManifest.bin.pi);
  const cliRelative = relative(packageDir, cli);
  if (!cliRelative || cliRelative.startsWith("..") || isAbsolute(cliRelative)) {
    throw new Error("Pinned Pi CLI entry point resolves outside its installed SDK package.");
  }

  const agentDir = mkdtempSync(join(tmpdir(), "pi-git-delegate-agent-"));
  const fixture = mkdtempSync(join(tmpdir(), "pi-git-delegate-fixture-"));
  const gitConfig = join(agentDir, "gitconfig");
  writeFileSync(gitConfig, "", "utf8");
  const { server, requests } = createDeterministicCompletionServer();
  let serverStarted = false;
  const privateEnv = { ...process.env, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
  try {
    createGitFixture(fixture, privateEnv);
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    serverStarted = true;
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local deterministic model server did not bind TCP.");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "models.json"), `${JSON.stringify({ providers: {
      [PROVIDER]: {
        baseUrl: `http://127.0.0.1:${address.port}/v1`, api: "openai-completions", apiKey: "offline-test-key",
        models: [{ id: MODEL, name: "Deterministic offline Pi SDK smoke", api: "openai-completions",
          input: ["text"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 8192, maxTokens: 256 }],
      },
    } }, null, 2)}\n`, "utf8");

    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    const runCase = async (name, perform) => {
      const requestStart = requests.length;
      let observation = {};
      let captures = [];
      let protocolInvalid = false;
      try {
        const result = await perform(requestStart);
        observation = result.observation;
        captures = result.captures;
        protocolInvalid = captures.some((capture) => capture.protocol_invalid || capture.failure);
      } catch (error) {
        observation = { exit_code: 1, failure: error.message };
        captures = [{ failure: error.message, stdout: "", stderr: "", exit_code: 1, natural_exit: false }];
        protocolInvalid = true;
      }
      const capturedRequests = requests.slice(requestStart);
      const stderr = captures.map((capture) => capture.stderr ?? "").join("\n");
      const stdout = captures.map((capture) => capture.stdout ?? "").join("\n");
      const extensionLoadErrors = EXTENSION_LOAD_ERROR_PATTERN.test(`${stdout}\n${stderr}`);
      const unhandledErrors = UNHANDLED_ERROR_PATTERN.test(`${stdout}\n${stderr}`);
      const assertionInput = { ...observation, stderr, protocol_invalid: protocolInvalid };
      const assertions = behaviorAssertions(name, assertionInput);
      const exit_code = Number.isInteger(observation.exit_code) ? observation.exit_code : 1;
      const passed = exit_code === 0 && assertions.every((item) => item.passed)
        && !extensionLoadErrors && !unhandledErrors;
      const evidence = persistArtifact(name, captures, capturedRequests);
      return {
        report: { name, command: COMMAND, exit_code, passed, evidence, assertions },
        extensionLoadErrors, unhandledErrors,
      };
    };

    const cases = [];
    cases.push(await runCase("extension_load", async () => {
      const host = await runPiHost({ cli, cwd: fixture, agentDir, gitConfig });
      return { observation: { commands: host.commands, exit_code: host.exit_code,
        natural_exit: host.natural_exit, protocol_invalid: host.protocol_invalid }, captures: [host] };
    }));

    cases.push(await runCase("happy_path", async (requestStart) => {
      const host = await runPiHost({ cli, cwd: fixture, agentDir, gitConfig, model: true,
        prompt: "PI_SDK_SMOKE_HAPPY: invoke git diff, log, and blame summary tools." });
      const tool_events = host.records.filter((row) => row?.type === "tool_execution_end");
      const providerCalls = requests.slice(requestStart).filter((request) => request.kind === "subagent").length;
      return { observation: { tool_events, local_provider_subagent_calls: providerCalls,
        exit_code: host.exit_code, natural_exit: host.natural_exit, stderr: host.stderr,
        protocol_invalid: host.protocol_invalid }, captures: [host] };
    }));

    cases.push(await runCase("error_path", async () => {
      const host = await runPiHost({ cli, cwd: fixture, agentDir, gitConfig, model: true,
        prompt: "PI_SDK_SMOKE_ERROR: request blame for a nonexistent file." });
      const tool_events = host.records.filter((row) => row?.type === "tool_execution_end");
      return { observation: { tool_events, exit_code: host.exit_code, natural_exit: host.natural_exit, stderr: host.stderr,
        protocol_invalid: host.protocol_invalid }, captures: [host] };
    }));

    cases.push(await runCase("reload_cleanup", async (requestStart) => {
      const first = await runPiHost({ cli, cwd: fixture, agentDir, gitConfig });
      const second = await runPiHost({ cli, cwd: fixture, agentDir, gitConfig, model: true,
        prompt: "PI_SDK_SMOKE_RELOAD: invoke git diff summary after a fresh Pi process load." });
      const reloaded_tool_events = second.records.filter((row) => row?.type === "tool_execution_end");
      const providerCalls = requests.slice(requestStart).filter((request) => request.kind === "subagent").length;
      return { observation: { reloaded_commands: second.commands, reloaded_tool_events,
        local_provider_subagent_calls: providerCalls, first_exit_code: first.exit_code,
        first_natural_exit: first.natural_exit, exit_code: second.exit_code,
        natural_exit: second.natural_exit, stderr: `${first.stderr}\n${second.stderr}`,
        protocol_invalid: first.protocol_invalid || second.protocol_invalid }, captures: [first, second] };
    }));

    cases.push(await runCase("host_shell", async () => {
      const host = await runNativeHostShell({ cli, agentDir, gitConfig,
        expectedVersion: SDK_VERSIONS["@earendil-works/pi-coding-agent"] });
      return { observation: host, captures: [host] };
    }));

    const reportCases = cases.map((item) => item.report);
    const report = {
      schema_version: 1,
      verification_contract: VERIFICATION_CONTRACT,
      sdk_versions: sdkVersions,
      platform: process.platform,
      model_inference: "No paid/external inference; actual Pi and extension call a deterministic OpenAI-compatible test model bound only to loopback.",
      unhandled_errors: cases.filter((item) => item.unhandledErrors).length,
      extension_load_errors: cases.filter((item) => item.extensionLoadErrors).length,
      cases: reportCases,
    };
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ verification_contract: VERIFICATION_CONTRACT, platform: process.platform,
      cases: reportCases.map(({ name, exit_code, passed }) => ({ name, exit_code, passed })) }));
    if (reportCases.some((item) => !item.passed)
        || report.unhandled_errors !== 0 || report.extension_load_errors !== 0) process.exitCode = 1;
  } finally {
    if (serverStarted) {
      server.closeAllConnections();
      await Promise.race([new Promise((resolveClose) => server.close(resolveClose)), delay(CLEANUP_GRACE_MS)]);
    }
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(fixture, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Pi SDK smoke setup failed: ${error.message}`);
  process.exitCode = 1;
});
