import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createGitSummaryPipelineOptions,
  executeGitSummaryPipeline,
} from "../git-summary-pipeline.ts";
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

  return executeGitSummaryPipeline(
    createGitSummaryPipelineOptions(
      ctx,
      params,
      signal,
      {
        toolName: "git_diff_summary",
        gitArgs: ["diff", ref],
        summaryPrompt: DIFF_SUMMARY_PROMPT,
        details: { ref },
        gitFailureLabel: "git diff",
        emptyMessage: "No changes found.",
      },
    ),
  );
}
