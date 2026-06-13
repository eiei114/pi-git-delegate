import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadGitDelegateConfig } from "./config.ts";
import {
  buildConfigureHelp,
  formatGitDelegateConfig,
  promptForGitDelegateConfig,
  resolveWritableSettingsPath,
  writeGitDelegateSettings,
} from "./settings-help.ts";

export const GIT_DELEGATE_COMMANDS = [
  { name: "git-delegate:configure", description: "Help set up pi-git-delegate models in .pi/settings.json" },
  { name: "git-delegate:status", description: "Show current pi-git-delegate model routing settings" },
] as const;

export function registerGitDelegateCommands(pi: ExtensionAPI): void {
  for (const command of GIT_DELEGATE_COMMANDS) {
    pi.registerCommand(command.name, {
      description: command.description,
      handler: async (_args, ctx) => {
        if (command.name === "git-delegate:status") {
          const config = loadGitDelegateConfig(ctx.cwd);
          const message = buildConfigureHelp(ctx.cwd, config);
          ctx.ui.notify(message, "info");
          return;
        }

        const config = loadGitDelegateConfig(ctx.cwd);
        ctx.ui.notify(buildConfigureHelp(ctx.cwd, config), "info");

        if (!ctx.hasUI) {
          ctx.ui.notify("Interactive save requires UI support. Copy the JSON above into .pi/settings.json.", "warning");
          return;
        }

        const target = resolveWritableSettingsPath(ctx.cwd);
        const nextConfig = await promptForGitDelegateConfig(ctx.ui, config ?? undefined);
        if (!nextConfig) {
          ctx.ui.notify("Settings not saved.", "info");
          return;
        }

        const save = await ctx.ui.confirm(
          "Save pi-git-delegate settings?",
          `${target.path}\n\n${formatGitDelegateConfig(nextConfig)}`,
        );
        if (!save) {
          ctx.ui.notify("Settings not saved.", "info");
          return;
        }

        writeGitDelegateSettings(target.path, nextConfig);
        ctx.ui.notify(`Saved pi-git-delegate settings to ${target.path}`, "info");
      },
    });
  }
}
