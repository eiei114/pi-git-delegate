import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { loadGitDelegateConfig, resolveSubagentRoute } = await import("../lib/config.ts");

function writeProjectSettings(cwd, settings) {
  const dir = join(cwd, ".pi");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings), "utf8");
}

function writeAgentSettings(agentDir, settings) {
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify(settings), "utf8");
}

function withAgentDir(agentDir, run) {
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previous;
    }
  }
}

test("loadGitDelegateConfig reads diffModel shorthand for git_diff_summary routing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  writeProjectSettings(cwd, {
    "pi-git-delegate": {
      diffModel: "haiku",
    },
  });

  const config = loadGitDelegateConfig(cwd);
  assert.deepEqual(config, {
    diff: { provider: null, model: "haiku" },
    log: { provider: null, model: null },
    blame: { provider: null, model: null },
  });
  assert.deepEqual(resolveSubagentRoute("git_diff_summary", config), {
    provider: undefined,
    model: "haiku",
  });
});

test("loadGitDelegateConfig prefers explicit diff route over diffModel shorthand", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  writeProjectSettings(cwd, {
    "pi-git-delegate": {
      diffModel: "haiku",
      diff: { provider: "anthropic", model: "sonnet" },
    },
  });

  const config = loadGitDelegateConfig(cwd);
  assert.deepEqual(config?.diff, { provider: "anthropic", model: "sonnet" });
});

test("loadGitDelegateConfig keeps explicit null diff route over diffModel shorthand", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  writeProjectSettings(cwd, {
    "pi-git-delegate": {
      diffModel: "haiku",
      diff: { provider: null, model: null },
    },
  });

  const config = loadGitDelegateConfig(cwd);
  assert.deepEqual(config?.diff, { provider: null, model: null });
});

test("loadGitDelegateConfig reads logModel shorthand for git_log_summary routing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  writeProjectSettings(cwd, {
    "pi-git-delegate": {
      logModel: "gpt-4.1-mini",
    },
  });

  const config = loadGitDelegateConfig(cwd);
  assert.deepEqual(config?.log, { provider: null, model: "gpt-4.1-mini" });
  assert.deepEqual(resolveSubagentRoute("git_log_summary", config), {
    provider: undefined,
    model: "gpt-4.1-mini",
  });
});

test("loadGitDelegateConfig reads blameModel shorthand for git_blame_summary routing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  writeProjectSettings(cwd, {
    "pi-git-delegate": {
      blameModel: "gemini-2.5-flash",
    },
  });

  const config = loadGitDelegateConfig(cwd);
  assert.deepEqual(config?.blame, { provider: null, model: "gemini-2.5-flash" });
  assert.deepEqual(resolveSubagentRoute("git_blame_summary", config), {
    provider: undefined,
    model: "gemini-2.5-flash",
  });
});

test("loadGitDelegateConfig reads nested provider/model routes", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  writeProjectSettings(cwd, {
    "pi-git-delegate": {
      diff: { provider: "anthropic", model: "haiku" },
      log: { provider: "openai", model: "gpt-4.1-mini" },
      blame: { provider: null, model: null },
    },
  });

  const config = loadGitDelegateConfig(cwd);
  assert.deepEqual(config, {
    diff: { provider: "anthropic", model: "haiku" },
    log: { provider: "openai", model: "gpt-4.1-mini" },
    blame: { provider: null, model: null },
  });
});

test("resolveSubagentRoute uses config provider/model when override is absent", () => {
  const config = {
    diff: { provider: "anthropic", model: "haiku" },
    log: { provider: "openai", model: "gpt-4.1-mini" },
    blame: { provider: null, model: null },
  };
  assert.deepEqual(resolveSubagentRoute("git_diff_summary", config), {
    provider: "anthropic",
    model: "haiku",
  });
  assert.deepEqual(resolveSubagentRoute("git_log_summary", config), {
    provider: "openai",
    model: "gpt-4.1-mini",
  });
  assert.equal(resolveSubagentRoute("git_blame_summary", config), undefined);
});

test("resolveSubagentRoute prefers parameter override over config", () => {
  const config = {
    diff: { provider: "anthropic", model: "haiku" },
    log: { provider: "openai", model: "gpt-4.1-mini" },
    blame: { provider: "google", model: "gemini-2.5-flash" },
  };
  assert.deepEqual(
    resolveSubagentRoute("git_diff_summary", config, {
      provider: "openai",
      model: "override-model",
    }),
    {
      provider: "openai",
      model: "override-model",
    },
  );
});

test("loadGitDelegateConfig prefers project settings over agent-dir settings", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  const agentDir = mkdtempSync(join(tmpdir(), "pi-git-delegate-agent-"));
  writeProjectSettings(cwd, {
    "pi-git-delegate": {
      diffModel: "project-diff-model",
    },
  });
  writeAgentSettings(agentDir, {
    "pi-git-delegate": {
      diffModel: "agent-diff-model",
      logModel: "agent-log-model",
    },
  });

  withAgentDir(agentDir, () => {
    const config = loadGitDelegateConfig(cwd);
    assert.deepEqual(config?.diff, { provider: null, model: "project-diff-model" });
    assert.notEqual(config?.log?.model, "agent-log-model");
    assert.deepEqual(config?.log, { provider: null, model: null });
  });
});

test("loadGitDelegateConfig falls back to agent-dir settings when project settings are missing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  const agentDir = mkdtempSync(join(tmpdir(), "pi-git-delegate-agent-"));
  writeAgentSettings(agentDir, {
    "pi-git-delegate": {
      logModel: "agent-log-model",
    },
  });

  withAgentDir(agentDir, () => {
    const config = loadGitDelegateConfig(cwd);
    assert.deepEqual(config?.log, { provider: null, model: "agent-log-model" });
  });
});

test("loadGitDelegateConfig returns undefined when neither project nor agent settings exist", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  const agentDir = mkdtempSync(join(tmpdir(), "pi-git-delegate-agent-"));
  mkdirSync(agentDir, { recursive: true });

  withAgentDir(agentDir, () => {
    assert.equal(loadGitDelegateConfig(cwd), undefined);
  });
});

test("loadGitDelegateConfig ignores invalid project JSON and falls back to agent settings", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  const agentDir = mkdtempSync(join(tmpdir(), "pi-git-delegate-agent-"));
  const projectDir = join(cwd, ".pi");
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, "settings.json"), "{not-json", "utf8");
  writeAgentSettings(agentDir, {
    "pi-git-delegate": {
      blameModel: "agent-blame-model",
    },
  });

  withAgentDir(agentDir, () => {
    const config = loadGitDelegateConfig(cwd);
    assert.deepEqual(config?.blame, { provider: null, model: "agent-blame-model" });
  });
});

test("loadGitDelegateConfig ignores invalid agent JSON when project settings are missing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-config-"));
  const agentDir = mkdtempSync(join(tmpdir(), "pi-git-delegate-agent-"));
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "settings.json"), "{broken", "utf8");

  withAgentDir(agentDir, () => {
    assert.equal(loadGitDelegateConfig(cwd), undefined);
  });
});

test("resolveSubagentRoute returns undefined when neither config nor override is set", () => {
  assert.equal(resolveSubagentRoute("git_diff_summary", undefined), undefined);
  assert.equal(
    resolveSubagentRoute("git_log_summary", {
      diff: { provider: null, model: null },
      log: { provider: null, model: null },
      blame: { provider: null, model: null },
    }),
    undefined,
  );
  assert.equal(
    resolveSubagentRoute("git_blame_summary", undefined, { provider: "  ", model: "  " }),
    undefined,
  );
});
