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

export interface GitSummaryToolParams {
  provider?: string;
  model?: string;
}

export interface GitSummaryToolContext {
  cwd: string;
}

/**
 * Builds the adapter-to-pipeline boundary shared by each git summary tool.
 * Keeping context and per-call routing here prevents tool adapters from
 * drifting when the pipeline gains another execution option.
 */
export function createGitSummaryPipelineOptions(
  context: GitSummaryToolContext,
  params: GitSummaryToolParams,
  signal: AbortSignal | undefined,
  options: Omit<GitSummaryPipelineOptions, "cwd" | "override" | "signal">,
): GitSummaryPipelineOptions {
  return {
    ...options,
    cwd: context.cwd,
    override: { provider: params.provider, model: params.model },
    signal,
  };
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

    let error: string;
    if (gitResult.error && /\bENOBUFS\b/i.test(gitResult.error)) {
      error = `${gitFailureLabel} output exceeded the 10 MiB limit; narrow the ref or path.`;
    } else if (gitResult.error && /\bENOENT\b/i.test(gitResult.error)) {
      error = "git executable not found.";
    } else if (gitResult.error) {
      const signal = gitResult.error.match(/\b(SIG[A-Z0-9]+)\b/i)?.[1];
      error = signal
        ? `${gitFailureLabel} was terminated by ${signal}.`
        : `${gitFailureLabel} failed: ${gitResult.error}`;
    } else {
      error =
        gitResult.stderr ||
        gitResult.stdout ||
        `${gitFailureLabel} failed with exit code ${gitResult.status}`;
    }
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

  if (subagent.exitCode !== 0) {
    const failure = `Subagent failed with exit code ${subagent.exitCode}`;
    const stderr = subagent.stderr.trim();
    return textResult(stderr ? `${failure}: ${stderr}` : `${failure}.`, { ...details, error: true });
  }

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
