import { spawnSync } from "node:child_process";

export interface GitRunResult {
  stdout: string;
  stderr: string;
  status: number;
}

export function runGit(args: string[], cwd: string): GitRunResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    status: result.status ?? 1,
  };
}
