import { textResult, type ToolTextResult } from "./tool-result.ts";

export function rejectOptionLikeRevision(
  value: string,
  argumentName: "ref" | "range",
): ToolTextResult | undefined {
  if (!value.trim().startsWith("-")) return undefined;

  return textResult(`${argumentName} must not start with '-'.`, { error: true });
}
