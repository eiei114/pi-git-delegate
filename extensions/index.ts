import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerGitDelegateCommands } from "../lib/register-commands.ts";
import { registerGitDelegateTools } from "../lib/register-tools.ts";

export default function (pi: ExtensionAPI) {
  registerGitDelegateCommands(pi);
  registerGitDelegateTools(pi);
}
