import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const catalogDir = new URL("../node_modules/@earendil-works/pi-ai/dist/providers/data/", import.meta.url);
const repoPath = (relative) => new URL(relative, `file:///${repoRoot.replace(/\\/g, "/")}`);

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
