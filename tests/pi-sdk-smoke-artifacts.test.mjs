import assert from "node:assert/strict";
import test from "node:test";
import { scrubLocalPaths } from "../scripts/pi-sdk-smoke-artifacts.mjs";

test("scrubs raw, JSON-escaped, nested, and forward-slash paths from serialized artifacts", () => {
  const repoRoot = "C:\\Users\\agent\\pi-git-delegate";
  const tempDir = "C:\\Users\\agent\\AppData\\Local\\Temp";
  const serializedArtifact = JSON.stringify({
    source_path: repoRoot,
    output: [
      repoRoot,
      repoRoot.replaceAll("\\", "/"),
      JSON.stringify(repoRoot).slice(1, -1),
      tempDir,
      tempDir.replaceAll("\\", "/"),
      JSON.stringify(tempDir).slice(1, -1),
    ],
  });

  const scrubbed = scrubLocalPaths(serializedArtifact, [
    { path: repoRoot, replacement: "<repo>" },
    { path: tempDir, replacement: "<temp>" },
  ]);

  for (const path of [repoRoot, repoRoot.replaceAll("\\", "/"), JSON.stringify(repoRoot).slice(1, -1),
    tempDir, tempDir.replaceAll("\\", "/"), JSON.stringify(tempDir).slice(1, -1)]) {
    assert.equal(scrubbed.includes(path), false, `serialized artifact retained ${path}`);
  }
  assert.match(scrubbed, /<repo>/);
  assert.match(scrubbed, /<temp>/);
});
