import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { executeGitDiffSummary } = await import("../lib/tools/git-diff-summary.ts");
const { executeGitLogSummary } = await import("../lib/tools/git-log-summary.ts");
const { executeGitBlameSummary } = await import("../lib/tools/git-blame-summary.ts");
const { createEchoSubagentRunner, setSubagentRunnerForTests } = await import("../lib/subagent-runner.ts");

const tempRepos = [];

function createTempGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-git-"));
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
  setSubagentRunnerForTests(createEchoSubagentRunner("Delegated git summary."));
});

test.after(() => {
  setSubagentRunnerForTests(undefined);
  for (const cwd of tempRepos.splice(0)) {
    rmSync(cwd, { recursive: true, force: true });
  }
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

test("git_diff_summary rejects option-like refs before git or the subagent can run", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "committed\n", "utf8");
  commitAll(cwd, "initial");
  writeFileSync(join(cwd, "README.md"), "working tree change\n", "utf8");
  const outputPath = join(cwd, "diff-output.patch");
  let runnerCalls = 0;
  const echoRunner = createEchoSubagentRunner();
  setSubagentRunnerForTests(async (request) => {
    runnerCalls += 1;
    return echoRunner(request);
  });

  try {
    const result = await executeGitDiffSummary({ ref: ` --output=${outputPath} ` }, { cwd });

    assert.equal(result.content[0].text, "ref must not start with '-'.");
    assert.equal(result.details.error, true);
    assert.equal(existsSync(outputPath), false);
    assert.equal(runnerCalls, 0);
  } finally {
    setSubagentRunnerForTests(createEchoSubagentRunner("Delegated git summary."));
  }
});

test("git_log_summary returns empty message without subagent when range has no commits", async () => {
  const cwd = createTempGitRepo();

  const result = await executeGitLogSummary({ range: "HEAD~1..HEAD" }, { cwd });
  assert.equal(result.content[0].text, "No commits in range.");
});

function captureDelegatedLogs(t) {
  const logs = [];
  const echoRunner = createEchoSubagentRunner();
  setSubagentRunnerForTests(async (request) => {
    const log = request.prompt.split("\nGit output:\n")[1].trim();
    logs.push(log.split(/\r?\n/).map((line) => line.replace(/^\S+ /, "")));
    return echoRunner(request);
  });
  t.after(() => setSubagentRunnerForTests(createEchoSubagentRunner()));
  return logs;
}

test("git_log_summary delegates all available commits for missing and blank ranges in short history", async (t) => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "one\n", "utf8");
  commitAll(cwd, "first commit");
  writeFileSync(join(cwd, "README.md"), "two\n", "utf8");
  commitAll(cwd, "second commit");
  const logs = captureDelegatedLogs(t);

  for (const params of [{}, { range: " \t " }]) {
    const result = await executeGitLogSummary(params, { cwd });
    assert.equal(result.content[0].text, "Delegated git summary.");
  }
  assert.deepEqual(logs, [
    ["second commit", "first commit"],
    ["second commit", "first commit"],
  ]);
});

test("git_log_summary caps the default log at ten commits but does not cap explicit ranges", async (t) => {
  const cwd = createTempGitRepo();
  const subjects = Array.from({ length: 12 }, (_, index) => `commit ${index + 1}`);
  for (const subject of subjects) {
    writeFileSync(join(cwd, "README.md"), `${subject}\n`, "utf8");
    commitAll(cwd, subject);
  }
  const logs = captureDelegatedLogs(t);

  await executeGitLogSummary({}, { cwd });
  const explicit = await executeGitLogSummary({ range: " HEAD~11..HEAD " }, { cwd });

  const newestFirst = subjects.reverse();
  assert.deepEqual(logs, [newestFirst.slice(0, 10), newestFirst.slice(0, 11)]);
  assert.equal(explicit.details.range, "HEAD~11..HEAD");
});

test("git_log_summary returns empty without delegating when HEAD is unborn", async (t) => {
  const cwd = createTempGitRepo();
  const logs = captureDelegatedLogs(t);

  const result = await executeGitLogSummary({}, { cwd });

  assert.equal(result.content[0].text, "No commits in range.");
  assert.equal(result.details.empty, true);
  assert.deepEqual(logs, []);
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

test("git_log_summary rejects option-like ranges before git or the subagent can run", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "initial\n", "utf8");
  commitAll(cwd, "initial");
  const outputPath = join(cwd, "log-output.txt");
  let runnerCalls = 0;
  const echoRunner = createEchoSubagentRunner();
  setSubagentRunnerForTests(async (request) => {
    runnerCalls += 1;
    return echoRunner(request);
  });

  try {
    const result = await executeGitLogSummary({ range: ` --output=${outputPath} ` }, { cwd });

    assert.equal(result.content[0].text, "range must not start with '-'.");
    assert.equal(result.details.error, true);
    assert.equal(existsSync(outputPath), false);
    assert.equal(runnerCalls, 0);
  } finally {
    setSubagentRunnerForTests(createEchoSubagentRunner("Delegated git summary."));
  }
});

test("git_blame_summary returns empty message without subagent when blame output is empty", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "empty.txt"), "", "utf8");
  commitAll(cwd, "add empty file");

  const result = await executeGitBlameSummary({ path: "empty.txt" }, { cwd });
  assert.equal(result.content[0].text, "No blame data found for empty.txt.");
  assert.equal(result.details.empty, true);
});

test("git_blame_summary rejects option-like refs before git or the subagent can run", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "initial\n", "utf8");
  commitAll(cwd, "initial");
  let runnerCalls = 0;
  const echoRunner = createEchoSubagentRunner();
  setSubagentRunnerForTests(async (request) => {
    runnerCalls += 1;
    return echoRunner(request);
  });

  try {
    const result = await executeGitBlameSummary(
      { path: "README.md", ref: " --ext-diff " },
      { cwd },
    );

    assert.equal(result.content[0].text, "ref must not start with '-'.");
    assert.equal(result.details.error, true);
    assert.equal(runnerCalls, 0);
  } finally {
    setSubagentRunnerForTests(createEchoSubagentRunner("Delegated git summary."));
  }
});

test("git_blame_summary returns error for missing file without subagent", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "hello\n", "utf8");
  commitAll(cwd, "initial");

  const result = await executeGitBlameSummary({ path: "missing.ts" }, { cwd });
  assert.match(result.content[0].text, /missing\.ts|fatal|error/i);
  assert.notEqual(result.content[0].text, "Delegated git summary.");
});

test("git_blame_summary rejects missing and blank path inputs before delegation", async () => {
  for (const params of [{}, { path: "" }, { path: " \t\n" }]) {
    const result = await executeGitBlameSummary(params, {});
    assert.equal(result.content[0].text, "path is required.");
    assert.equal(result.details.error, true);
  }
});

test("git_blame_summary preserves a tracked path with leading whitespace", async () => {
  const cwd = createTempGitRepo();
  const path = " notes.txt";
  writeFileSync(join(cwd, path), "content from the literal path\n", "utf8");
  writeFileSync(join(cwd, path.trim()), "content from the trimmed path\n", "utf8");
  commitAll(cwd, "add both files");

  const echoRunner = createEchoSubagentRunner("Delegated git summary.");
  const prompts = [];
  setSubagentRunnerForTests(async (request) => {
    prompts.push(request.prompt);
    return echoRunner(request);
  });

  try {
    const result = await executeGitBlameSummary({ path }, { cwd });
    assert.equal(result.content[0].text, "Delegated git summary.");
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /content from the literal path/);
    assert.equal(result.details.path, path);
  } finally {
    setSubagentRunnerForTests(echoRunner);
  }
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

test("git_blame_summary uses blameModel config and lets model parameter override it", async () => {
  const cwd = createTempGitRepo();
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "settings.json"),
    JSON.stringify({
      "pi-git-delegate": {
        blameModel: "configured-blame-model",
      },
    }),
    "utf8",
  );
  writeFileSync(join(cwd, "README.md"), "hello\n", "utf8");
  commitAll(cwd, "initial");

  const configured = await executeGitBlameSummary({ path: "README.md" }, { cwd });
  assert.equal(configured.details.model, "configured-blame-model");

  const overridden = await executeGitBlameSummary({ path: "README.md", model: "override-model" }, { cwd });
  assert.equal(overridden.details.model, "override-model");
});

function writePiGitDelegateSettings(cwd, settings) {
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ "pi-git-delegate": settings }), "utf8");
}

test("git_diff_summary uses diffModel config and lets model parameter override it", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "hello\n", "utf8");
  commitAll(cwd, "initial");
  writeFileSync(join(cwd, "README.md"), "hello world\n", "utf8");
  writePiGitDelegateSettings(cwd, { diffModel: "configured-diff-model", logModel: "configured-log-model" });

  const configured = await executeGitDiffSummary({ ref: "HEAD" }, { cwd });
  assert.equal(configured.content[0].text, "Delegated git summary.");
  assert.equal(configured.details.model, "configured-diff-model");

  const overridden = await executeGitDiffSummary({ ref: "HEAD", model: "override-model" }, { cwd });
  assert.equal(overridden.details.model, "override-model");
});

test("git_log_summary uses logModel config and lets model parameter override it", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "first\n", "utf8");
  commitAll(cwd, "initial");
  writeFileSync(join(cwd, "README.md"), "second\n", "utf8");
  commitAll(cwd, "update README");
  writePiGitDelegateSettings(cwd, { diffModel: "configured-diff-model", logModel: "configured-log-model" });

  const configured = await executeGitLogSummary({ range: "HEAD~1..HEAD" }, { cwd });
  assert.equal(configured.content[0].text, "Delegated git summary.");
  assert.equal(configured.details.model, "configured-log-model");

  const overridden = await executeGitLogSummary({ range: "HEAD~1..HEAD", model: "override-model" }, { cwd });
  assert.equal(overridden.details.model, "override-model");
});

test("all git summary tools preserve per-call provider and model overrides", async () => {
  const cwd = createTempGitRepo();
  writeFileSync(join(cwd, "README.md"), "first revision\n", "utf8");
  commitAll(cwd, "initial");
  writeFileSync(join(cwd, "README.md"), "second revision\n", "utf8");
  commitAll(cwd, "update README");
  writeFileSync(join(cwd, "README.md"), "working tree change\n", "utf8");

  const overrides = { provider: "override-provider", model: "override-model" };
  const results = [
    await executeGitDiffSummary({ ref: "HEAD", ...overrides }, { cwd }),
    await executeGitLogSummary({ range: "HEAD~1..HEAD", ...overrides }, { cwd }),
    await executeGitBlameSummary({ path: "README.md", ...overrides }, { cwd }),
  ];

  for (const result of results) {
    assert.equal(result.details.provider, overrides.provider);
    assert.equal(result.details.model, overrides.model);
  }
});
