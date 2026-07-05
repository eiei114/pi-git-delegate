import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const { getFinalOutput, getPiInvocation } = await import("../lib/subagent-runner.ts");

test("getFinalOutput joins assistant text blocks and ignores non-text content", () => {
  const output = getFinalOutput([
    {
      role: "user",
      content: [{ type: "text", text: "ignored user text" }],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "first part" },
        { type: "tool_use", name: "ignored", input: {} },
        { type: "text", text: "second part" },
      ],
    },
    {
      role: "assistant",
      content: [{ type: "text", text: "final answer" }],
    },
  ]);

  assert.equal(output, "first part\nsecond part\nfinal answer");
});

test("getFinalOutput returns an empty string when no assistant text exists", () => {
  assert.equal(getFinalOutput([]), "");
  assert.equal(
    getFinalOutput([
      {
        role: "assistant",
        content: [{ type: "tool_use", name: "noop", input: {} }],
      },
    ]),
    "",
  );
});

test("getPiInvocation reuses the current script when argv[1] points to a real file", () => {
  const currentScript = process.argv[1];
  assert.ok(currentScript);
  assert.ok(existsSync(currentScript));

  const invocation = getPiInvocation(["--mode", "json"]);

  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [currentScript, "--mode", "json"]);
});

test("getPiInvocation falls back to pi for generic node runtimes without a real script", () => {
  const originalArgv = process.argv;
  const originalExecPath = process.execPath;

  try {
    process.argv = [originalArgv[0], "/definitely/missing/pi-git-delegate-test-script.mjs"];
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: process.platform === "win32" ? "C:\\Program Files\\nodejs\\node.exe" : "/usr/bin/node",
    });

    assert.deepEqual(getPiInvocation(["--mode", "json", "-p"]), {
      command: "pi",
      args: ["--mode", "json", "-p"],
    });
  } finally {
    process.argv = originalArgv;
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: originalExecPath,
    });
  }
});

test("getPiInvocation keeps the current executable for non-generic runtimes", () => {
  const originalArgv = process.argv;
  const originalExecPath = process.execPath;
  const customExecPath =
    process.platform === "win32" ? "C:\\Tools\\pi.exe" : "/usr/local/bin/pi";

  try {
    process.argv = [originalArgv[0], "/definitely/missing/pi-git-delegate-test-script.mjs"];
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: customExecPath,
    });

    assert.deepEqual(getPiInvocation(["--provider", "anthropic"]), {
      command: customExecPath,
      args: ["--provider", "anthropic"],
    });
  } finally {
    process.argv = originalArgv;
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: originalExecPath,
    });
  }
});
