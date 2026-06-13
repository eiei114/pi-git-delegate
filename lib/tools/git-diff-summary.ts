import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadGitDelegateConfig, resolveSubagentRoute } from "../config.ts";
import { runGit } from "../git-exec.ts";
import { buildSubagentPrompt, DIFF_SUMMARY_PROMPT } from "../prompts.ts";
import { runSubagent } from "../subagent-runner.ts";

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
  const config = loadGitDelegateConfig(ctx.cwd);
  const route = resolveSubagentRoute("git_diff_summary", config, {
    provider: params.provider,
    model: params.model,
  });

  const gitResult = runGit(["diff", ref], ctx.cwd);
  if (gitResult.status !== 0) {
    const error = gitResult.stderr || gitResult.stdout || `git diff failed with exit code ${gitResult.status}`;
    return textResult(error, { ref, error: true });
  }

  if (!gitResult.stdout) {
    return textResult("No changes found.", { ref, empty: true });
  }

  const subagent = await runSubagent({
    cwd: ctx.cwd,
    prompt: buildSubagentPrompt(DIFF_SUMMARY_PROMPT, gitResult.stdout),
    provider: route?.provider,
    model: route?.model,
    signal,
  });

  if (!subagent.outputText) {
    const error = subagent.stderr || "Subagent returned no summary.";
    return textResult(error, { ref, error: true });
  }

  return textResult(subagent.outputText, {
    ref,
    provider: route?.provider ?? null,
    model: route?.model ?? null,
  });
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}
