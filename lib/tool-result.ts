export interface ToolTextResult {
  content: [{ type: "text"; text: string }];
  details: Record<string, unknown>;
}

export function textResult(text: string, details: Record<string, unknown> = {}): ToolTextResult {
  return { content: [{ type: "text" as const, text }], details };
}
