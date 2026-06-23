import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type GitDelegateToolName = "git_diff_summary" | "git_log_summary" | "git_blame_summary";
export type GitDelegateToolKey = "diff" | "log" | "blame";

export interface ModelRoute {
  provider: string | null;
  model: string | null;
}

export interface GitDelegateConfig {
  diff: ModelRoute;
  log: ModelRoute;
  blame: ModelRoute;
}

export interface ResolvedSubagentRoute {
  provider?: string;
  model?: string;
}

export const NULL_MODEL_ROUTE: ModelRoute = {
  provider: null,
  model: null,
};

export const DEFAULT_GIT_DELEGATE_CONFIG: GitDelegateConfig = {
  diff: { ...NULL_MODEL_ROUTE },
  log: { ...NULL_MODEL_ROUTE },
  blame: { ...NULL_MODEL_ROUTE },
};

const TOOL_CONFIG_KEYS: Record<GitDelegateToolName, GitDelegateToolKey> = {
  git_diff_summary: "diff",
  git_log_summary: "log",
  git_blame_summary: "blame",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimOrUndefined(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseRoute(value: unknown): ModelRoute {
  if (!isRecord(value)) {
    return { ...NULL_MODEL_ROUTE };
  }

  return {
    provider: parseNullableString(value.provider),
    model: parseNullableString(value.model),
  };
}

function parseRouteWithShorthand(routeValue: unknown, shorthandModel: unknown): ModelRoute {
  const route = parseRoute(routeValue);
  if (route.provider !== null || route.model !== null) {
    return route;
  }

  const model = parseNullableString(shorthandModel);
  if (model) {
    return { provider: null, model };
  }

  return route;
}

function readSettingsFile(filePath: string): Record<string, unknown> | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseGitDelegateConfig(settings: Record<string, unknown> | undefined): GitDelegateConfig | undefined {
  if (!settings) return undefined;
  const raw = settings["pi-git-delegate"];
  if (!isRecord(raw)) return undefined;

  return {
    diff: parseRouteWithShorthand(raw.diff, raw.diffModel),
    log: parseRouteWithShorthand(raw.log, raw.logModel),
    blame: parseRouteWithShorthand(raw.blame, raw.blameModel),
  };
}

export function loadGitDelegateConfig(cwd: string): GitDelegateConfig | undefined {
  const projectSettings = readSettingsFile(join(cwd, ".pi", "settings.json"));
  const projectConfig = parseGitDelegateConfig(projectSettings);
  if (projectConfig !== undefined) return projectConfig;

  const agentSettings = readSettingsFile(join(getAgentDir(), "settings.json"));
  return parseGitDelegateConfig(agentSettings);
}

export function resolveSubagentRoute(
  toolName: GitDelegateToolName,
  config: GitDelegateConfig | undefined,
  override?: { provider?: string; model?: string },
): ResolvedSubagentRoute | undefined {
  const overrideProvider = trimOrUndefined(override?.provider);
  const overrideModel = trimOrUndefined(override?.model);
  if (overrideProvider || overrideModel) {
    return {
      provider: overrideProvider,
      model: overrideModel,
    };
  }

  if (!config) return undefined;

  const route = config[TOOL_CONFIG_KEYS[toolName]];
  const provider = trimOrUndefined(route.provider);
  const model = trimOrUndefined(route.model);
  if (!provider && !model) return undefined;

  return { provider, model };
}
