import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { DEFAULT_GIT_DELEGATE_CONFIG } = await import("../lib/config.ts");
const {
  buildConfigureHelp,
  formatGitDelegateConfig,
  mergeGitDelegateSettings,
  resolveWritableSettingsPath,
  writeGitDelegateSettings,
} = await import("../lib/settings-help.ts");
const { GIT_DELEGATE_COMMANDS, registerGitDelegateCommands } = await import("../lib/register-commands.ts");

test("formatGitDelegateConfig renders null provider/model defaults", () => {
  const text = formatGitDelegateConfig(DEFAULT_GIT_DELEGATE_CONFIG);
  assert.match(text, /"pi-git-delegate"/);
  assert.match(text, /"provider": null/);
  assert.match(text, /"model": null/);
});

test("buildConfigureHelp includes provider/model descriptions and example JSON", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-help-"));
  const help = buildConfigureHelp(cwd, DEFAULT_GIT_DELEGATE_CONFIG);
  assert.match(help, /provider/);
  assert.match(help, /model/);
  assert.match(help, /diffModel/);
  assert.match(help, /logModel/);
  assert.match(help, /blameModel/);
  assert.match(help, /git-delegate:configure/);
  assert.match(help, /"pi-git-delegate"/);
});

test("writeGitDelegateSettings merges into existing settings without clobbering other keys", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-write-"));
  const settingsDir = join(cwd, ".pi");
  mkdirSync(settingsDir, { recursive: true });
  const settingsPath = join(settingsDir, "settings.json");
  writeFileSync(settingsPath, JSON.stringify({ packages: ["npm:pi-git-delegate"] }, null, 2), "utf8");

  writeGitDelegateSettings(settingsPath, DEFAULT_GIT_DELEGATE_CONFIG);
  const saved = JSON.parse(readFileSync(settingsPath, "utf8"));
  assert.deepEqual(saved.packages, ["npm:pi-git-delegate"]);
  assert.deepEqual(saved["pi-git-delegate"], DEFAULT_GIT_DELEGATE_CONFIG);
});

test("mergeGitDelegateSettings replaces the pi-git-delegate block", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-merge-"));
  const settingsPath = join(cwd, "settings.json");
  writeFileSync(
    settingsPath,
    JSON.stringify({ "pi-git-delegate": { diff: { provider: "old", model: "old" } } }, null, 2),
    "utf8",
  );

  const merged = mergeGitDelegateSettings(settingsPath, {
    diff: { provider: "anthropic", model: "haiku" },
    log: { provider: null, model: null },
    blame: { provider: null, model: null },
  });
  assert.deepEqual(merged["pi-git-delegate"].diff, { provider: "anthropic", model: "haiku" });
  assert.deepEqual(merged["pi-git-delegate"].log, { provider: null, model: null });
  rmSync(cwd, { recursive: true, force: true });
});

test("resolveWritableSettingsPath prefers project settings when present", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-target-"));
  const settingsDir = join(cwd, ".pi");
  mkdirSync(settingsDir, { recursive: true });
  writeFileSync(join(settingsDir, "settings.json"), "{}", "utf8");

  const target = resolveWritableSettingsPath(cwd);
  assert.equal(target.scope, "project");
  assert.match(target.path, /[\\/]\.pi[\\/]settings\.json$/);
});

test("registerGitDelegateCommands registers configure and status commands", () => {
  const commands = new Map();
  registerGitDelegateCommands({
    registerCommand(name, options) {
      commands.set(name, options);
    },
  });

  assert.equal(commands.size, GIT_DELEGATE_COMMANDS.length);
  for (const command of GIT_DELEGATE_COMMANDS) {
    assert.equal(commands.has(command.name), true);
    assert.equal(typeof commands.get(command.name).handler, "function");
  }
});

async function runConfigure(t, { answers = [], useNullDefaults = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-configure-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const settingsPath = join(cwd, ".pi", "settings.json");
  const initialSettings = {
    packages: ["npm:pi-git-delegate"],
    "pi-git-delegate": {
      diff: { provider: "old-provider", model: "old-model" },
      log: { provider: "old-provider", model: "old-model" },
      blame: { provider: "old-provider", model: "old-model" },
    },
  };
  const original = JSON.stringify(initialSettings, null, 2) + "\n";
  mkdirSync(join(cwd, ".pi"));
  writeFileSync(settingsPath, original, "utf8");

  const prompts = [];
  const confirmations = [];
  const notifications = [];
  const commands = new Map();
  registerGitDelegateCommands({
    registerCommand(name, options) {
      commands.set(name, options);
    },
  });
  await commands.get("git-delegate:configure").handler("", {
    cwd,
    hasUI: true,
    ui: {
      async input(title) {
        return answers[prompts.push(title) - 1];
      },
      async confirm(title) {
        confirmations.push(title);
        return title === "Use null defaults?" ? useNullDefaults : true;
      },
      notify(message) {
        notifications.push(message);
      },
    },
  });
  return { prompts, confirmations, notifications, original, saved: readFileSync(settingsPath, "utf8") };
}

const routePrompts = ["git_diff_summary", "git_log_summary", "git_blame_summary"].flatMap((tool) => [
  `${tool} provider (empty = null)`,
  `${tool} model (empty = null)`,
]);

for (const [name, answers] of [
  ["the first provider prompt", [undefined]],
  ["the first model prompt", ["openai", undefined]],
  ["a later provider prompt", ["openai", "gpt-5-mini", undefined]],
  ["a later model prompt", ["openai", "gpt-5-mini", "anthropic", undefined]],
]) {
  test(`configure cancels when dismissing ${name}`, async (t) => {
    const result = await runConfigure(t, { answers });
    assert.deepEqual(result.prompts, routePrompts.slice(0, answers.length));
    assert.deepEqual(result.confirmations, ["Use null defaults?"]);
    assert.equal(result.notifications.at(-1), "Settings not saved.");
    assert.equal(result.saved, result.original);
  });
}

test("configure saves blank inputs as null and trims explicit values", async (t) => {
  const result = await runConfigure(t, { answers: ["", " gpt-5-mini ", " anthropic ", "   ", "", ""] });
  assert.deepEqual(result.prompts, routePrompts);
  assert.deepEqual(result.confirmations, ["Use null defaults?", "Save pi-git-delegate settings?"]);
  assert.deepEqual(JSON.parse(result.saved)["pi-git-delegate"], {
    diff: { provider: null, model: "gpt-5-mini" },
    log: { provider: "anthropic", model: null },
    blame: { provider: null, model: null },
  });
});

test("configure can still save all null defaults without route prompts", async (t) => {
  const result = await runConfigure(t, { useNullDefaults: true });
  assert.deepEqual(result.prompts, []);
  assert.deepEqual(result.confirmations, ["Use null defaults?", "Save pi-git-delegate settings?"]);
  assert.deepEqual(JSON.parse(result.saved)["pi-git-delegate"], DEFAULT_GIT_DELEGATE_CONFIG);
});
