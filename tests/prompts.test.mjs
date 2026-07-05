import assert from "node:assert/strict";
import test from "node:test";

const {
  BLAME_SUMMARY_PROMPT,
  DIFF_SUMMARY_PROMPT,
  LOG_SUMMARY_PROMPT,
  buildSubagentPrompt,
} = await import("../lib/prompts.ts");

test("prompt constants describe the expected summarizer roles", () => {
  assert.match(DIFF_SUMMARY_PROMPT, /git diff summarizer/i);
  assert.match(LOG_SUMMARY_PROMPT, /git log summarizer/i);
  assert.match(BLAME_SUMMARY_PROMPT, /git blame summarizer/i);
});

test("buildSubagentPrompt combines the system prompt and git output", () => {
  const prompt = buildSubagentPrompt(DIFF_SUMMARY_PROMPT, "diff --git a/README.md b/README.md");

  assert.match(prompt, /^You are a git diff summarizer\./);
  assert.match(prompt, /\n\nGit output:\n/);
  assert.ok(prompt.endsWith("diff --git a/README.md b/README.md"));
});

test("buildSubagentPrompt preserves multiline git output verbatim", () => {
  const gitOutput = "commit abc123\nAuthor: Test User\n\nfeat: add tests";
  const prompt = buildSubagentPrompt(LOG_SUMMARY_PROMPT, gitOutput);

  assert.equal(
    prompt,
    `${LOG_SUMMARY_PROMPT}

Git output:
${gitOutput}`,
  );
});
