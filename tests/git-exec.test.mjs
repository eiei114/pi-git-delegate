import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { runGit } = await import("../lib/git-exec.ts");

const tempRepos = [];

function createTempGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-git-exec-"));
  execSync("git init", { cwd, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd, stdio: "ignore" });
  execSync('git config user.name "Test User"', { cwd, stdio: "ignore" });
  tempRepos.push(cwd);
  return cwd;
}

test.after(() => {
  for (const cwd of tempRepos.splice(0)) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runGit returns success output for a valid git command", () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "hello\n", "utf8");
  execSync("git add README.md", { cwd, stdio: "ignore" });
  execSync('git commit -m "initial"', { cwd, stdio: "ignore" });

  const result = runGit(["log", "-1", "--pretty=%s"], cwd);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "initial");
  assert.equal(result.stderr, "");
});

test("runGit returns non-zero status for an invalid git invocation", () => {
  const cwd = createTempGitRepo();

  const result = runGit(["rev-parse", "not-a-real-ref"], cwd);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /not-a-real-ref|unknown revision|bad revision/i);
});
