import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { textResult } = await import("../lib/tool-result.ts");
const { executeGitSummaryPipeline } = await import("../lib/git-summary-pipeline.ts");
const { createEchoSubagentRunner, setSubagentRunnerForTests } = await import("../lib/subagent-runner.ts");
const { DIFF_SUMMARY_PROMPT } = await import("../lib/prompts.ts");

const tempRepos = [];

function createTempGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-pipeline-"));
  execSync("git init", { cwd, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd, stdio: "ignore" });
  execSync('git config user.name "Test User"', { cwd, stdio: "ignore" });
  tempRepos.push(cwd);
  return cwd;
}

function commitAll(cwd, message) {
  execSync("git add -A", { cwd, stdio: "ignore" });
  execSync(`git commit -m "${message}"`, { cwd, stdio: "ignore" });
}

test.before(() => {
  setSubagentRunnerForTests(createEchoSubagentRunner("Pipeline summary."));
});

test.after(() => {
  setSubagentRunnerForTests(undefined);
  for (const cwd of tempRepos.splice(0)) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("textResult returns typed text content and details", () => {
  const result = textResult("hello", { ref: "HEAD", empty: true });
  assert.deepEqual(result.content, [{ type: "text", text: "hello" }]);
  assert.deepEqual(result.details, { ref: "HEAD", empty: true });
});

test("executeGitSummaryPipeline delegates to subagent on non-empty git output", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "hello\n", "utf8");
  commitAll(cwd, "initial");
  writeFileSync(join(cwd, "README.md"), "hello world\n", "utf8");

  const result = await executeGitSummaryPipeline({
    toolName: "git_diff_summary",
    gitArgs: ["diff", "HEAD"],
    summaryPrompt: DIFF_SUMMARY_PROMPT,
    cwd,
    details: { ref: "HEAD" },
    gitFailureLabel: "git diff",
    emptyMessage: "No changes found.",
  });

  assert.equal(result.content[0].text, "Pipeline summary.");
  assert.equal(result.details.ref, "HEAD");
});

test("executeGitSummaryPipeline uses onGitFailure before default git error", async () => {
  const cwd = createTempGitRepo();

  const result = await executeGitSummaryPipeline({
    toolName: "git_log_summary",
    gitArgs: ["log", "--oneline", "HEAD~1..HEAD"],
    summaryPrompt: DIFF_SUMMARY_PROMPT,
    cwd,
    details: { range: "HEAD~1..HEAD" },
    gitFailureLabel: "git log",
    emptyMessage: "No commits in range.",
    onGitFailure: (gitResult) => {
      if (/does not have any commits|unknown revision/i.test(gitResult.stderr)) {
        return textResult("Custom empty range.", { range: "HEAD~1..HEAD", empty: true });
      }
      return undefined;
    },
  });

  assert.equal(result.content[0].text, "Custom empty range.");
  assert.equal(result.details.empty, true);
});
