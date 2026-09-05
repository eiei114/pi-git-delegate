import type { GitDelegateToolName } from "./config.ts";
import { loadGitDelegateConfig, resolveSubagentRoute } from "./config.ts";
import { runGit, type GitRunResult } from "./git-exec.ts";
import { buildSubagentPrompt } from "./prompts.ts";
import { runSubagent } from "./subagent-runner.ts";
import { textResult, type ToolTextResult } from "./tool-result.ts";

export interface GitSummaryPipelineOptions {
  toolName: GitDelegateToolName;
  gitArgs: string[];
  summaryPrompt: string;
  cwd: string;
  details: Record<string, unknown>;
  override?: { provider?: string; model?: string };
  signal?: AbortSignal;
  gitFailureLabel: string;
  emptyMessage: string;
  onGitFailure?: (gitResult: GitRunResult) => ToolTextResult | undefined;
}

export async function executeGitSummaryPipeline(
  options: GitSummaryPipelineOptions,
): Promise<ToolTextResult> {
  const {
    toolName,
    gitArgs,
    summaryPrompt,
    cwd,
    details,
    override,
    signal,
    gitFailureLabel,
    emptyMessage,
    onGitFailure,
  } = options;

  const config = loadGitDelegateConfig(cwd);
  const route = resolveSubagentRoute(toolName, config, override);

  const gitResult = runGit(gitArgs, cwd);
  if (gitResult.status !== 0) {
    const custom = onGitFailure?.(gitResult);
    if (custom) return custom;

    const error =
      gitResult.stderr ||
      gitResult.stdout ||
      `${gitFailureLabel} failed with exit code ${gitResult.status}`;
    return textResult(error, { ...details, error: true });
  }

  if (!gitResult.stdout) {
    return textResult(emptyMessage, { ...details, empty: true });
  }

  const subagent = await runSubagent({
    cwd,
    prompt: buildSubagentPrompt(summaryPrompt, gitResult.stdout),
    provider: route?.provider,
    model: route?.model,
    signal,
  });

  if (!subagent.outputText) {
    const error = subagent.stderr || "Subagent returned no summary.";
    return textResult(error, { ...details, error: true });
  }

  return textResult(subagent.outputText, {
    ...details,
    provider: route?.provider ?? null,
    model: route?.model ?? null,
  });
}
