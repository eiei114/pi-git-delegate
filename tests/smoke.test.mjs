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
  assert.match(ciWorkflow, /os: \[ubuntu-latest, windows-latest\]/);
  assert.match(ciWorkflow, /npm run ci/);
  assert.match(packageJson.scripts.ci, /npm run smoke:pi/);
});

test("roadmap distinguishes the latest release from the prepared package version", () => {
  const version = packageJson.version;
  const latestRelease = roadmap.match(/\| Latest release \| \*\*v([0-9]+\.[0-9]+\.[0-9]+)\*\*/)?.[1];
  assert.ok(latestRelease, "roadmap must identify the latest published release");
  assert.ok(roadmap.includes(`| \`package.json\` version | \`${version}\` (prepared for release; not yet published) |`));
  assert.ok(changelog.includes(`## [${version}]`));
  assert.notEqual(latestRelease, version, "SDK maintenance must not claim the unreleased bump was published");
});

test("roadmap keeps at least three active candidate seeds", () => {
  const candidateSection = roadmap.match(
    /^## Candidate maintenance seeds$([\s\S]*?)(?=^## |(?![\s\S]))/m,
  )?.[1];
  assert.ok(candidateSection, "Candidate maintenance seeds section missing from ROADMAP.md");

  const activeSeeds = candidateSection
    .split(/^### Seed /m)
    .slice(1)
    .filter((seed) => /^\d+\b[\s\S]*?^[ \t]*- \[ \]/m.test(seed));

  assert.ok(
    activeSeeds.length >= 3,
    `Candidate maintenance seeds must contain at least three active (- [ ]) seeds; found ${activeSeeds.length}`,
  );
});

test("roadmap open PRs row avoids stale hardcoded PR numbers", () => {
  const match = roadmap.match(/\| Open PRs \|([^|]+)\|/);
  assert.ok(match, "Open PRs row missing from ROADMAP.md");
  const cell = match[1].trim();
  assert.doesNotMatch(
    cell,
    /#\d+/,
    "Open PRs cell must not hardcode PR numbers that go stale after merge",
  );
});

test("changelog documents shipped releases and keeps Unreleased empty", () => {
  const version = packageJson.version;
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(changelog, new RegExp(`## \\[Unreleased\\]\\s*\\n\\s*## \\[${escapedVersion}\\]`));
  assert.match(changelog, /## \[0\.2\.2\] - 2026-07-04[\s\S]*?Buy Me a Coffee[\s\S]*?(?=## \[|$)/);
  assert.match(changelog, new RegExp(`## \\[${escapedVersion}\\]`));
  const unreleasedBody = changelog.split("## [Unreleased]")[1]?.split(/^## \[/m)[0] ?? "";
  assert.match(unreleasedBody.trim(), /^$/);
});

test("template includes npm release workflow handoff", () => {
  assert.match(autoReleaseWorkflow, /actions:\s*write/);
  assert.match(autoReleaseWorkflow, /contents:\s*write/);
  assert.match(autoReleaseWorkflow, /gh workflow run publish\.yml/);
  const releaseTriggers = autoReleaseWorkflow.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1];
  assert.equal(releaseTriggers?.trim(), "workflow_dispatch:");
  assert.match(autoReleaseWorkflow, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.ok(autoReleaseWorkflow.includes("grep -Eq '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'"));
  assert.match(publishWorkflow, /id-token:\s*write/);
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /npm publish --access public/);
  const publishTriggers = publishWorkflow.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1] ?? "";
  assert.doesNotMatch(publishTriggers, /branches:\s*\n\s*- main|paths:/);
});
