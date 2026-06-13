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
