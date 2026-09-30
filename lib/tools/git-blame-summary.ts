import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createGitSummaryPipelineOptions,
  executeGitSummaryPipeline,
} from "../git-summary-pipeline.ts";
import { textResult } from "../tool-result.ts";
import { BLAME_SUMMARY_PROMPT } from "../prompts.ts";

export interface GitBlameSummaryParams {
  path: string;
  ref?: string;
  provider?: string;
  model?: string;
}

export async function executeGitBlameSummary(
  params: GitBlameSummaryParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
) {
  const filePath = params.path?.trim();
  if (!filePath) {
    return textResult("path is required.", { error: true });
  }

  const ref = params.ref?.trim() || "HEAD";

  return executeGitSummaryPipeline(
    createGitSummaryPipelineOptions(
      ctx,
      params,
      signal,
      {
        toolName: "git_blame_summary",
        gitArgs: ["blame", ref, "--", filePath],
        summaryPrompt: BLAME_SUMMARY_PROMPT,
        details: { path: filePath, ref },
        gitFailureLabel: "git blame",
        emptyMessage: `No blame data found for ${filePath}.`,
      },
    ),
  );
}
