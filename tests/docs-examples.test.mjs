import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const catalogDir = new URL("../node_modules/@earendil-works/pi-ai/dist/providers/data/", import.meta.url);
const repoPath = (relative) => new URL(relative, `file:///${repoRoot.replace(/\\/g, "/")}`);

const { executeGitDiffSummary } = await import("../lib/tools/git-diff-summary.ts");
const { executeGitBlameSummary } = await import("../lib/tools/git-blame-summary.ts");
const { setSubagentRunnerForTests } = await import("../lib/subagent-runner.ts");

const tempRepos = [];

function createTempGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-git-delegate-docs-"));
  execSync("git init", { cwd, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd, stdio: "ignore" });
  execSync('git config user.name "Test User"', { cwd, stdio: "ignore" });
  tempRepos.push(cwd);
  return cwd;
}

function commitAs(cwd, message, name = "Test User", email = "test@example.com") {
  execSync(`git config user.name "${name}"`, { cwd, stdio: "ignore" });
  execSync(`git config user.email "${email}"`, { cwd, stdio: "ignore" });
  execSync("git add -A", { cwd, stdio: "ignore" });
  execSync(`git commit -m "${message}"`, { cwd, stdio: "ignore" });
}

/**
 * Captures the exact prompt handed to the subagent so a test can assert what
 * the documented tool call actually shows it. Empty output would skip the
 * subagent, so the fake runner is the only way to observe the Git payload.
 */
function captureSubagentPrompts() {
  const prompts = [];
  setSubagentRunnerForTests(async (request) => {
    prompts.push(request.prompt);
    return { exitCode: 0, outputText: "Delegated git summary.", stderr: "" };
  });
  return prompts;
}

test.after(() => {
  setSubagentRunnerForTests(undefined);
  for (const cwd of tempRepos.splice(0)) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

/**
 * Documented examples must reference model ids that the pinned Pi SDK actually
 * ships. Pi accepts an unknown id as a custom model and only warns at
 * subagent start, so a stale id reaches the user as a confusing runtime
 * warning instead of a failing check here.
 */
async function loadCatalogModelIds() {
  const files = (await readdir(catalogDir)).filter((file) => file.endsWith(".json"));
  assert.ok(files.length > 0, "the pinned Pi SDK must ship a provider model catalog");

  const providers = new Map();
  const collect = (value) => {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value.id === "string" && typeof value.provider === "string") {
      const known = providers.get(value.id) ?? new Set();
      known.add(value.provider);
      providers.set(value.id, known);
    }
    Object.values(value).forEach(collect);
  };

  for (const file of files) {
    collect(JSON.parse(await readFile(new URL(file, catalogDir), "utf8")));
  }
  return providers;
}

async function documentedModelRoutes() {
  const docs = ["README.md", "docs/examples.md"];
  const routes = [];
  for (const doc of docs) {
    const text = await readFile(repoPath(doc), "utf8");
    for (const block of text.matchAll(/```json\r?\n([\s\S]*?)```/g)) {
      if (!block[1].includes("pi-git-delegate")) continue;
      const settings = JSON.parse(block[1])["pi-git-delegate"];
      for (const [key, value] of Object.entries(settings)) {
        if (key.endsWith("Model")) {
          routes.push({ doc, key, provider: null, model: value });
        } else if (value && typeof value === "object" && typeof value.model === "string") {
          routes.push({ doc, key, provider: value.provider, model: value.model });
        }
      }
    }
  }
  return routes;
}

test("documented settings examples only use model ids shipped by the pinned Pi SDK", async () => {
  const catalog = await loadCatalogModelIds();
  const routes = await documentedModelRoutes();

  assert.ok(routes.length >= 4, `expected documented model routes, found ${routes.length}`);

  for (const route of routes) {
    const providers = catalog.get(route.model);
    assert.ok(providers, `${route.doc}: model "${route.model}" (${route.key}) is not in the Pi catalog`);
    if (route.provider) {
      assert.ok(
        providers.has(route.provider),
        `${route.doc}: model "${route.model}" (${route.key}) is not available from provider "${route.provider}"`,
      );
    }
  }
});

test("documented settings example keys match the keys the extension reads", async () => {
  const config = await readFile(repoPath("lib/config.ts"), "utf8");
  const routes = await documentedModelRoutes();

  for (const route of routes) {
    if (route.key.endsWith("Model")) {
      assert.match(
        config,
        new RegExp(`raw\\.${route.key}\\b`),
        `${route.doc}: shorthand "${route.key}" is documented but not read by lib/config.ts`,
      );
      continue;
    }
    assert.match(
      config,
      new RegExp(`raw\\.${route.key}\\b`),
      `${route.doc}: route key "${route.key}" is documented but not read by lib/config.ts`,
    );
  }
});

/**
 * The examples make claims about what each tool's Git command means. Those
 * claims are executable: run the documented call against a real repository and
 * read the payload the subagent receives.
 */
test("documented git_diff_summary example summarizes uncommitted tracked changes", async () => {
  const cwd = createTempGitRepo();
  const file = join(cwd, "f.txt");
  for (const line of ["one", "one\ntwo", "one\ntwo\nthree", "one\ntwo\nthree\nfour"]) {
    writeFileSync(file, `${line}\n`, "utf8");
    commitAs(cwd, `commit ${line.split("\n").length}`);
  }
  writeFileSync(file, "one\ntwo\nthree\nfour\nUNCOMMITTED\n", "utf8");

  const prompts = captureSubagentPrompts();
  const result = await executeGitDiffSummary({ ref: "HEAD~3" }, { cwd });

  assert.equal(result.content[0].text, "Delegated git summary.");
  assert.equal(prompts.length, 1, "the documented example must reach the subagent");
  assert.match(
    prompts[0],
    /\+UNCOMMITTED/,
    "docs example claims ref HEAD~3 covers uncommitted tracked changes; the payload must contain them",
  );

  // `git diff <ref>` is not a commit range: only git log counts commits.
  const committedOnly = execSync("git log --oneline HEAD~3..HEAD", { cwd, encoding: "utf8" }).trim().split("\n");
  assert.equal(committedOnly.length, 3, "HEAD~3..HEAD spans three commits");
  const docs = await readFile(repoPath("docs/examples.md"), "utf8");
  assert.doesNotMatch(docs, /last three commits' changes/i, "docs must not describe git diff <ref> as a commit range");
  assert.match(docs, /including uncommitted tracked changes/, "docs must state that uncommitted tracked changes are included");
});

test("documented git_blame_summary example is a contributor summary, not the file's last commit", async () => {
  const cwd = createTempGitRepo();
  const file = join(cwd, "g.txt");
  writeFileSync(file, "kept line\ndoomed line\n", "utf8");
  commitAs(cwd, "add two lines", "Alice Author", "alice@example.com");
  writeFileSync(file, "kept line\n", "utf8");
  commitAs(cwd, "delete only", "Bob Deleter", "bob@example.com");

  const prompts = captureSubagentPrompts();
  const result = await executeGitBlameSummary({ path: "g.txt" }, { cwd });

  assert.equal(result.content[0].text, "Delegated git summary.");
  assert.equal(prompts.length, 1, "the documented example must reach the subagent");
  assert.match(prompts[0], /Alice Author/, "blame payload must name the author of the surviving line");
  assert.doesNotMatch(
    prompts[0],
    /Bob Deleter/,
    "a deletion-only commit is invisible to git blame, so the example cannot promise the file's last commit",
  );
  assert.equal(
    execSync("git log -1 --format=%an", { cwd, encoding: "utf8" }).trim(),
    "Bob Deleter",
    "sanity check: the file's most recent commit is the deletion Bob made",
  );

  const docs = await readFile(repoPath("docs/examples.md"), "utf8");
  assert.doesNotMatch(docs, /Who last changed [^\n]*git_blame_summary/i, "docs must not ask who last changed the file");
  assert.match(docs, /Who has contributed to/, "docs must frame the blame example as a contributor summary");
});

test("documented quickstart commands resolve against the packed manifest", async () => {
  const manifest = JSON.parse(await readFile(repoPath("package.json"), "utf8"));
  const readme = await readFile(repoPath("README.md"), "utf8");

  assert.match(readme, /pi -e \./, "README must keep the documented local run command");
  assert.match(readme, /pi install npm:pi-git-delegate/, "README must keep the documented install command");
  assert.match(readme, new RegExp(`npm:${manifest.name}`), "documented install target must match package.json name");

  // `pi -e .` loads the package root, so the declared pi entrypoints must exist.
  assert.ok(manifest.pi?.extensions?.length > 0, "package.json must declare pi.extensions for `pi -e .`");
  for (const entry of manifest.pi.extensions) {
    const resolved = await readdir(repoPath(entry));
    assert.ok(resolved.length > 0, `pi.extensions entry ${entry} must contain an extension entrypoint`);
  }
});
