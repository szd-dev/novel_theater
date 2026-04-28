export interface ToolResultSuccess {
  ok: true;
  data: string;
}

export interface ToolResultError {
  ok: false;
  error: string;
}

export type ToolResult = ToolResultSuccess | ToolResultError;

export function toolResult(data: string): string {
  return JSON.stringify({ ok: true, data } satisfies ToolResultSuccess);
}

export function toolError(error: string): string {
  return JSON.stringify({ ok: false, error } satisfies ToolResultError);
}
