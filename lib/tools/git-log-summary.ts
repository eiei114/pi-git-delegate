import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadGitDelegateConfig, resolveSubagentRoute } from "../config.ts";
import { runGit } from "../git-exec.ts";
import { buildSubagentPrompt, LOG_SUMMARY_PROMPT } from "../prompts.ts";
import { runSubagent } from "../subagent-runner.ts";

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
  const config = loadGitDelegateConfig(ctx.cwd);
  const route = resolveSubagentRoute("git_log_summary", config, {
    provider: params.provider,
    model: params.model,
  });

  const gitResult = runGit(["log", "--oneline", range], ctx.cwd);
  if (gitResult.status !== 0) {
    if (isNoCommitsInRange(gitResult.stderr)) {
      return textResult("No commits in range.", { range, empty: true });
    }
    const error = gitResult.stderr || gitResult.stdout || `git log failed with exit code ${gitResult.status}`;
    return textResult(error, { range, error: true });
  }

  if (!gitResult.stdout) {
    return textResult("No commits in range.", { range, empty: true });
  }

  const subagent = await runSubagent({
    cwd: ctx.cwd,
    prompt: buildSubagentPrompt(LOG_SUMMARY_PROMPT, gitResult.stdout),
    provider: route?.provider,
    model: route?.model,
    signal,
  });

  if (!subagent.outputText) {
    const error = subagent.stderr || "Subagent returned no summary.";
    return textResult(error, { range, error: true });
  }

  return textResult(subagent.outputText, {
    range,
    provider: route?.provider ?? null,
    model: route?.model ?? null,
  });
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function isNoCommitsInRange(stderr: string): boolean {
  return /does not have any commits|unknown revision|bad revision|needed single revision|ambiguous argument/i.test(stderr);
}
