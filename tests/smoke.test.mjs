import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const roadmap = await readFile(new URL("../ROADMAP.md", import.meta.url), "utf8");
const ciWorkflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const autoReleaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

test("package declares pi resources", () => {
  assert.deepEqual(packageJson.pi.extensions, ["./extensions"]);
  assert.equal(packageJson.pi.skills, undefined);
  assert.equal(packageJson.pi.prompts, undefined);
  assert.equal(packageJson.pi.themes, undefined);
});

test("package is discoverable as a Pi package", () => {
  assert.ok(packageJson.keywords.includes("pi-package"));
});

test("package uses public publish config", () => {
  assert.equal(packageJson.publishConfig.access, "public");
});

test("ci workflow runs tests on push and pull_request", () => {
  assert.match(ciWorkflow, /on:\s*[\s\S]*push:/);
  assert.match(ciWorkflow, /pull_request:/);
  assert.match(ciWorkflow, /npm run ci/);
});

test("roadmap release status tracks package version", () => {
  const version = packageJson.version;
  assert.ok(roadmap.includes(`| Latest release | **v${version}**`));
  assert.ok(roadmap.includes(`| \`package.json\` version | \`${version}\``));
});

test("changelog documents shipped releases and keeps Unreleased empty", () => {
  const version = packageJson.version;
  assert.match(changelog, /## \[Unreleased\][\s\S]*?## \[0\.2\.3\] - 2026-07-21/);
  assert.match(changelog, /## \[0\.2\.2\] - 2026-07-04[\s\S]*?Buy Me a Coffee[\s\S]*?(?=## \[|$)/);
  assert.match(changelog, new RegExp(`## \\[${version.replace(/\./g, "\\.")}\\]`));
  const unreleasedBody = changelog.split("## [Unreleased]")[1]?.split(/^## \[/m)[0] ?? "";
  assert.match(unreleasedBody.trim(), /^$/);
});

test("template includes npm release workflow handoff", () => {
  assert.match(autoReleaseWorkflow, /actions:\s*write/);
  assert.match(autoReleaseWorkflow, /contents:\s*write/);
  assert.match(autoReleaseWorkflow, /gh workflow run publish\.yml/);
  assert.match(publishWorkflow, /id-token:\s*write/);
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /npm publish --access public/);
});
