import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { executeGitDiffSummary } = await import("../lib/tools/git-diff-summary.ts");
const { executeGitLogSummary } = await import("../lib/tools/git-log-summary.ts");
const { executeGitBlameSummary } = await import("../lib/tools/git-blame-summary.ts");
const { createEchoSubagentRunner, setSubagentRunnerForTests } = await import("../lib/subagent-runner.ts");

function createTempGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-git-"));
  execSync("git init", { cwd, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd, stdio: "ignore" });
  execSync('git config user.name "Test User"', { cwd, stdio: "ignore" });
  return cwd;
}

function commitAll(cwd, message) {
  execSync("git add -A", { cwd, stdio: "ignore" });
  execSync(`git commit -m "${message}"`, { cwd, stdio: "ignore" });
}

test.before(() => {
  setSubagentRunnerForTests(createEchoSubagentRunner("Delegated git summary."));
});

test.after(() => {
  setSubagentRunnerForTests(undefined);
});

test("git_diff_summary returns empty message without subagent when diff is empty", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "hello\n", "utf8");
  commitAll(cwd, "initial");

  const result = await executeGitDiffSummary({ ref: "HEAD" }, { cwd });
  assert.equal(result.content[0].text, "No changes found.");
});

test("git_diff_summary returns summary without raw diff in response", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "hello\n", "utf8");
  commitAll(cwd, "initial");
  writeFileSync(join(cwd, "README.md"), "hello world\n", "utf8");

  const result = await executeGitDiffSummary({ ref: "HEAD" }, { cwd });
  assert.equal(result.content[0].text, "Delegated git summary.");
  assert.doesNotMatch(result.content[0].text, /diff --git/);
});

test("git_log_summary returns empty message without subagent when range has no commits", async () => {
  const cwd = createTempGitRepo();

  const result = await executeGitLogSummary({ range: "HEAD~1..HEAD" }, { cwd });
  assert.equal(result.content[0].text, "No commits in range.");
});

test("git_log_summary returns digest without raw log in response", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "one\n", "utf8");
  commitAll(cwd, "feat: one");
  writeFileSync(join(cwd, "README.md"), "two\n", "utf8");
  commitAll(cwd, "fix: two");

  const result = await executeGitLogSummary({ range: "HEAD~1..HEAD" }, { cwd });
  assert.equal(result.content[0].text, "Delegated git summary.");
  assert.doesNotMatch(result.content[0].text, /feat: one/);
});

test("git_blame_summary returns error for missing file without subagent", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "hello\n", "utf8");
  commitAll(cwd, "initial");

  const result = await executeGitBlameSummary({ path: "missing.ts" }, { cwd });
  assert.match(result.content[0].text, /missing\.ts|fatal|error/i);
  assert.notEqual(result.content[0].text, "Delegated git summary.");
});

test("git_blame_summary returns contributor summary without raw blame", async () => {
  const cwd = createTempGitRepo();
  mkdirSync(join(cwd, "src"), { recursive: true });
  writeFileSync(join(cwd, "src", "index.ts"), "export const x = 1;\n", "utf8");
  commitAll(cwd, "add index");
  writeFileSync(join(cwd, "src", "index.ts"), "export const x = 2;\n", "utf8");
  commitAll(cwd, "update index");

  const result = await executeGitBlameSummary({ path: "src/index.ts" }, { cwd });
  assert.equal(result.content[0].text, "Delegated git summary.");
  assert.doesNotMatch(result.content[0].text, /^[0-9a-f]{7,40}/m);
});
