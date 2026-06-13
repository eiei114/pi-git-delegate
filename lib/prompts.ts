export const DIFF_SUMMARY_PROMPT = `You are a git diff summarizer. Given a raw git diff output,
produce a concise summary in 1-3 sentences covering:
- What files changed
- The nature of the changes (feature, fix, refactor)
- Any notable patterns or risks

Do not output the diff back. Only output the summary.
Use no markdown formatting. One paragraph max.`;

export const LOG_SUMMARY_PROMPT = `You are a git log summarizer. Given a git log output with
commit hashes and messages, produce a concise digest in
2-4 sentences covering:
- How many commits and their general theme
- The main types of changes (features, fixes, refactors)
- Any notable patterns

Do not output the raw log. Only output the summary.
Use no markdown formatting. Two paragraphs max.`;

export const BLAME_SUMMARY_PROMPT = `You are a git blame summarizer. Given a git blame output,
produce a concise summary in 2-3 sentences covering:
- Total number of contributors to this file
- Who made the most recent changes and when
- The general age of the file (new, actively maintained, stable)

Do not output the raw blame. Only output the summary.
Use no markdown formatting. Two paragraphs max.`;

export function buildSubagentPrompt(systemPrompt: string, gitOutput: string): string {
  return `${systemPrompt}

Git output:
${gitOutput}`;
}
