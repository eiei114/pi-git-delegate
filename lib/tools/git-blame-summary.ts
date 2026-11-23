import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { rejectOptionLikeRevision } from "../git-args.ts";
import {
  createGitSummaryPipelineOptions,
  executeGitSummaryPipeline,
  type GitSummaryToolParams,
} from "../git-summary-pipeline.ts";
import { textResult } from "../tool-result.ts";
import { BLAME_SUMMARY_PROMPT } from "../prompts.ts";

export interface GitBlameSummaryParams extends GitSummaryToolParams {
  path: string;
  ref?: string;
}

export async function executeGitBlameSummary(
  params: GitBlameSummaryParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
) {
  const filePath = params.path;
  if (!filePath?.trim()) {
    return textResult("path is required.", { error: true });
  }

  const ref = params.ref?.trim() || "HEAD";
  const invalidRef = rejectOptionLikeRevision(ref, "ref");
  if (invalidRef) return invalidRef;

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
