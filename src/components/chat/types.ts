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

/**
 * Custom part type from OpenAI Agents pipeline — aligned with AI SDK's
 * `DynamicToolUIPart`. Contains the subset of fields relevant to our UI,
 * plus extra optional fields from the SDK for type compatibility at runtime.
 */
export interface DynamicToolPart {
  type: "dynamic-tool";
  toolName?: string;
  state?: DynamicToolState;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  errorText?: string;
  toolCallId?: string;
  title?: string;
  providerExecuted?: boolean;
  preliminary?: boolean;
}

export function isDynamicToolPart(
  part: UIMessage["parts"][number],
): part is DynamicToolPart & UIMessage["parts"][number] {
  return part.type === "dynamic-tool";
}
