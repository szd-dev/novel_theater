import type { UIMessage } from "ai";

export type DynamicToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export interface ToolClickPayload {
  toolName: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  state?: DynamicToolState;
}

/** Custom part type from OpenAI Agents pipeline — not a standard AI SDK part. */
export interface DynamicToolPart {
  type: "dynamic-tool";
  toolName?: string;
  state?: DynamicToolState;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  toolCallId?: string;
}

export function isDynamicToolPart(
  part: UIMessage["parts"][number],
): part is DynamicToolPart & UIMessage["parts"][number] {
  return part.type === "dynamic-tool";
}
