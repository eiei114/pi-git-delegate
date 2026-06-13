import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadGitDelegateConfig, resolveSubagentRoute } from "../config.ts";
import { runGit } from "../git-exec.ts";
import { buildSubagentPrompt, BLAME_SUMMARY_PROMPT } from "../prompts.ts";
import { runSubagent } from "../subagent-runner.ts";

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
  const config = loadGitDelegateConfig(ctx.cwd);
  const route = resolveSubagentRoute("git_blame_summary", config, {
    provider: params.provider,
    model: params.model,
  });

  const gitResult = runGit(["blame", ref, "--", filePath], ctx.cwd);
  if (gitResult.status !== 0) {
    const error = gitResult.stderr || gitResult.stdout || `git blame failed with exit code ${gitResult.status}`;
    return textResult(error, { path: filePath, ref, error: true });
  }

  if (!gitResult.stdout) {
    return textResult(`No blame data found for ${filePath}.`, { path: filePath, ref, empty: true });
  }

  const subagent = await runSubagent({
    cwd: ctx.cwd,
    prompt: buildSubagentPrompt(BLAME_SUMMARY_PROMPT, gitResult.stdout),
    provider: route?.provider,
    model: route?.model,
    signal,
  });

  if (!subagent.outputText) {
    const error = subagent.stderr || "Subagent returned no summary.";
    return textResult(error, { path: filePath, ref, error: true });
  }

  return textResult(subagent.outputText, {
    path: filePath,
    ref,
    provider: route?.provider ?? null,
    model: route?.model ?? null,
  });
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}
