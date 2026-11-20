import { spawnSync } from "node:child_process";

export interface GitRunResult {
  stdout: string;
  stderr: string;
  status: number;
  error?: string;
}

export function runGit(args: string[], cwd: string): GitRunResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const errorParts: string[] = [];
  if (result.error) {
    const spawnError = result.error as NodeJS.ErrnoException;
    const code = spawnError.code;
    const message = result.error.message.trim();
    errorParts.push(code && message ? `${code}: ${message}` : code ?? message);
  }
  if (result.signal) {
    errorParts.push(`terminated by ${result.signal}`);
  }

  return {
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    status: result.status ?? 1,
    ...(errorParts.length > 0 ? { error: errorParts.join("; ") } : {}),
  };
}
