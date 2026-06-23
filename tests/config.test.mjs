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
