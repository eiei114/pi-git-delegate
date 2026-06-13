import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_GIT_DELEGATE_CONFIG,
  type GitDelegateConfig,
  type GitDelegateToolKey,
  type ModelRoute,
  NULL_MODEL_ROUTE,
} from "./config.ts";

export const SETTINGS_KEY = "pi-git-delegate";

export interface SettingsLocation {
  scope: "project" | "agent";
  path: string;
  exists: boolean;
}

const TOOL_LABELS: Record<GitDelegateToolKey, string> = {
  diff: "git_diff_summary",
  log: "git_log_summary",
  blame: "git_blame_summary",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getProjectSettingsPath(cwd: string): string {
  return join(cwd, ".pi", "settings.json");
}

export function getAgentSettingsPath(): string {
  return join(getAgentDir(), "settings.json");
}

export function resolveWritableSettingsPath(cwd: string): SettingsLocation {
  const projectPath = getProjectSettingsPath(cwd);
  if (existsSync(projectPath)) {
    return { scope: "project", path: projectPath, exists: true };
  }

  const agentPath = getAgentSettingsPath();
  if (existsSync(agentPath)) {
    return { scope: "agent", path: agentPath, exists: true };
  }

  return { scope: "project", path: projectPath, exists: false };
}

export function findActiveSettingsLocation(cwd: string): SettingsLocation | undefined {
  const projectPath = getProjectSettingsPath(cwd);
  if (existsSync(projectPath)) {
    return { scope: "project", path: projectPath, exists: true };
  }

  const agentPath = getAgentSettingsPath();
  if (existsSync(agentPath)) {
    return { scope: "agent", path: agentPath, exists: true };
  }

  return undefined;
}

export function readSettingsObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function formatGitDelegateConfig(config: GitDelegateConfig = DEFAULT_GIT_DELEGATE_CONFIG): string {
  const payload = {
    [SETTINGS_KEY]: config,
  };
  return JSON.stringify(payload, null, 2);
}

export function formatRouteSummary(toolKey: GitDelegateToolKey, route: ModelRoute): string {
  const provider = route.provider ?? "null";
  const model = route.model ?? "null";
  return `${TOOL_LABELS[toolKey]}: provider=${provider}, model=${model}`;
}

export function buildConfigureHelp(cwd: string, config: GitDelegateConfig | undefined): string {
  const active = findActiveSettingsLocation(cwd);
  const writeTarget = resolveWritableSettingsPath(cwd);
  const resolved = config ?? DEFAULT_GIT_DELEGATE_CONFIG;
  const lines = [
    "Pi Git Delegate settings",
    "",
    "Add a pi-git-delegate block to .pi/settings.json to route each tool to a subagent model.",
    "",
    "Per tool, set:",
    "  provider -> LLM provider (null = session provider)",
    "  model    -> model id (null = session model)",
    "",
    "Priority: tool parameter provider/model > settings.json > current session",
    "",
    `Active settings: ${active ? `${active.scope} (${active.path})` : "none"}`,
    `Default write target: ${writeTarget.scope} (${writeTarget.path})`,
    "",
    "Current resolved routes:",
    formatRouteSummary("diff", resolved.diff),
    formatRouteSummary("log", resolved.log),
    formatRouteSummary("blame", resolved.blame),
    "",
    "Starter config (null = use session defaults):",
    formatGitDelegateConfig(DEFAULT_GIT_DELEGATE_CONFIG),
    "",
    "Run /git-delegate:configure in Pi to save this interactively.",
  ];

  return lines.join("\n");
}

export function mergeGitDelegateSettings(
  filePath: string,
  config: GitDelegateConfig,
): Record<string, unknown> {
  const settings = readSettingsObject(filePath);
  settings[SETTINGS_KEY] = config;
  return settings;
}

export function writeGitDelegateSettings(filePath: string, config: GitDelegateConfig): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const merged = mergeGitDelegateSettings(filePath, config);
  writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

async function promptForRoute(
  ui: {
    input: (title: string, placeholder?: string) => Promise<string | undefined>;
  },
  toolKey: GitDelegateToolKey,
  current: ModelRoute,
): Promise<ModelRoute> {
  const provider = (await ui.input(`${TOOL_LABELS[toolKey]} provider (empty = null)`, current.provider ?? ""))?.trim();
  const model = (await ui.input(`${TOOL_LABELS[toolKey]} model (empty = null)`, current.model ?? ""))?.trim();

  return {
    provider: provider ? provider : null,
    model: model ? model : null,
  };
}

export async function promptForGitDelegateConfig(
  ui: {
    confirm: (title: string, message: string) => Promise<boolean>;
    input: (title: string, placeholder?: string) => Promise<string | undefined>;
  },
  defaults: GitDelegateConfig = DEFAULT_GIT_DELEGATE_CONFIG,
): Promise<GitDelegateConfig | undefined> {
  const useNullDefaults = await ui.confirm(
    "Use null defaults?",
    "Save provider=null and model=null for all tools so subagents use the current session provider/model.",
  );
  if (useNullDefaults) {
    return {
      diff: { ...NULL_MODEL_ROUTE },
      log: { ...NULL_MODEL_ROUTE },
      blame: { ...NULL_MODEL_ROUTE },
    };
  }

  return {
    diff: await promptForRoute(ui, "diff", defaults.diff),
    log: await promptForRoute(ui, "log", defaults.log),
    blame: await promptForRoute(ui, "blame", defaults.blame),
  };
}
