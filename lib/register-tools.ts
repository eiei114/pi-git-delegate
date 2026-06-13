import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { executeGitBlameSummary } from "./tools/git-blame-summary.ts";
import { executeGitDiffSummary } from "./tools/git-diff-summary.ts";
import { executeGitLogSummary } from "./tools/git-log-summary.ts";

const modelOverrideParameters = {
  provider: Type.Optional(Type.String({ description: "Override provider for this call." })),
  model: Type.Optional(Type.String({ description: "Override model for this call." })),
};

const gitDiffSummaryParameters = Type.Object({
  ref: Type.Optional(Type.String({ description: 'Git ref to diff against (default: "HEAD").' })),
  ...modelOverrideParameters,
});

const gitLogSummaryParameters = Type.Object({
  range: Type.Optional(Type.String({ description: 'Git log range (default: "HEAD~10..HEAD").' })),
  ...modelOverrideParameters,
});

const gitBlameSummaryParameters = Type.Object({
  path: Type.String({ description: "File path to blame." }),
  ref: Type.Optional(Type.String({ description: 'Git ref (default: "HEAD").' })),
  ...modelOverrideParameters,
});

export const GIT_DELEGATE_TOOL_NAMES = [
  "git_diff_summary",
  "git_log_summary",
  "git_blame_summary",
] as const;

export function registerGitDelegateTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "git_diff_summary",
    label: "Git Diff Summary",
    description: "Run git diff and delegate summarization to a subagent.",
    promptSnippet: "git_diff_summary: summarize git diff via subagent",
    promptGuidelines: [
      "Use git_diff_summary when the user wants a concise summary of git diff output without loading raw diff into context.",
      "Do not use this tool for write operations such as commit or push.",
    ],
    parameters: gitDiffSummaryParameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return executeGitDiffSummary(params, ctx, signal);
    },
  });

  pi.registerTool({
    name: "git_log_summary",
    label: "Git Log Summary",
    description: "Run git log and delegate digest generation to a subagent.",
    promptSnippet: "git_log_summary: summarize recent commits via subagent",
    promptGuidelines: [
      "Use git_log_summary when the user wants a digest of recent commits without loading full log output into context.",
    ],
    parameters: gitLogSummaryParameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return executeGitLogSummary(params, ctx, signal);
    },
  });

  pi.registerTool({
    name: "git_blame_summary",
    label: "Git Blame Summary",
    description: "Run git blame and delegate contributor context to a subagent.",
    promptSnippet: "git_blame_summary: summarize file blame history via subagent",
    promptGuidelines: [
      "Use git_blame_summary when the user asks who changed a file and wants a concise contributor summary.",
    ],
    parameters: gitBlameSummaryParameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return executeGitBlameSummary(params, ctx, signal);
    },
  });
}
