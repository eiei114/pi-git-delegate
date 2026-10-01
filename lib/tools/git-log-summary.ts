import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createGitSummaryPipelineOptions,
  executeGitSummaryPipeline,
} from "../git-summary-pipeline.ts";
import { textResult } from "../tool-result.ts";
import { LOG_SUMMARY_PROMPT } from "../prompts.ts";

export interface GitLogSummaryParams {
  range?: string;
  provider?: string;
  model?: string;
}

export async function executeGitLogSummary(
  params: GitLogSummaryParams,
  ctx: ExtensionContext,
  signal?: AbortSignal,
) {
  const range = params.range?.trim() || "HEAD~10..HEAD";

  return executeGitSummaryPipeline(
    createGitSummaryPipelineOptions(
      ctx,
      params,
      signal,
      {
        toolName: "git_log_summary",
        gitArgs: ["log", "--oneline", range],
        summaryPrompt: LOG_SUMMARY_PROMPT,
        details: { range },
        gitFailureLabel: "git log",
        emptyMessage: "No commits in range.",
        onGitFailure: (gitResult) => {
          if (isNoCommitsInRange(gitResult.stderr)) {
            return textResult("No commits in range.", { range, empty: true });
          }
          return undefined;
        },
      },
    ),
  );
}

function isNoCommitsInRange(stderr: string): boolean {
  return /does not have any commits|unknown revision|bad revision|needed single revision|ambiguous argument/i.test(stderr);
}
