import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { executeGitSummaryPipeline } from "../git-summary-pipeline.ts";
import { DIFF_SUMMARY_PROMPT } from "../prompts.ts";

export interface GitDiffSummaryParams {
  ref?: string;
  provider?: string;
  model?: string;
}

export async function executeGitDiffSummary(
  params: GitDiffSummaryParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
) {
  const ref = params.ref?.trim() || "HEAD";

  return executeGitSummaryPipeline({
    toolName: "git_diff_summary",
    gitArgs: ["diff", ref],
    summaryPrompt: DIFF_SUMMARY_PROMPT,
    cwd: ctx.cwd,
    details: { ref },
    override: { provider: params.provider, model: params.model },
    signal,
    gitFailureLabel: "git diff",
    emptyMessage: "No changes found.",
  });
}
