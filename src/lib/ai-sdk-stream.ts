import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { getToolCallDisplayName } from "@openai/agents-core/utils";
import type { RunItemStreamEvent, RunStreamEvent, StreamedRunResult } from "@openai/agents";

type AiSdkUiMessageStreamSource =
  | StreamedRunResult<any, any>
  | ReadableStream<RunStreamEvent>
  | AsyncIterable<RunStreamEvent>
  | { toStream(): ReadableStream<RunStreamEvent> };

let idCounter = 0;
function createId(prefix: string): string {
  const randomUUID =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : undefined;
  if (randomUUID) return `${prefix}-${randomUUID}`;
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function resolveToolName(raw: Record<string, unknown>): string {
  return getToolCallDisplayName(raw) ?? String(raw.type ?? "tool");
}

function resolveToolCallId(
  raw: Record<string, unknown>,
  toolName: string,
): string {
  return (raw.callId || raw.id || `${toolName}-${createId("call")}`) as string;
}

function parseJsonArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch { return { raw }; }
}

function resolveEventSource(
  source: AiSdkUiMessageStreamSource,
): ReadableStream<RunStreamEvent> | AsyncIterable<RunStreamEvent> {
  if (typeof (source as { toStream?: unknown }).toStream === "function") {
    return (source as { toStream(): ReadableStream<RunStreamEvent> }).toStream();
  }
  if (source instanceof ReadableStream) return source;
  return source as AsyncIterable<RunStreamEvent>;
}

interface ToolPayload {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

function extractToolInput(item: RunItemStreamEvent["item"]): ToolPayload | null {
  const raw = item.rawItem as Record<string, unknown>;
  const toolName = resolveToolName(raw);
  const toolCallId = resolveToolCallId(raw, toolName);
  if (raw.type === "function_call" && typeof raw.arguments === "string") {
    return { toolCallId, toolName, input: parseJsonArgs(raw.arguments) };
  }
  if (raw.type === "hosted_tool_call") {
    const input = typeof raw.arguments === "string" ? parseJsonArgs(raw.arguments) : {};
    return { toolCallId, toolName, input };
  }
  return null;
}

interface ToolOutputPayload {
  toolCallId: string;
  output: unknown;
}

function extractHostedToolOutput(
  item: RunItemStreamEvent["item"],
  toolCallId?: string,
): ToolOutputPayload | null {
  const raw = item.rawItem as Record<string, unknown>;
  if (raw.type !== "hosted_tool_call") return null;
  if (raw.status !== "completed" || typeof raw.output === "undefined") return null;
  const toolName = resolveToolName(raw);
  const resolvedCallId = toolCallId ?? resolveToolCallId(raw, toolName);
  return { toolCallId: resolvedCallId, output: raw.output };
}

function extractToolOutput(item: RunItemStreamEvent["item"]): ToolOutputPayload | null {
  const raw = item.rawItem as Record<string, unknown>;
  const toolCallId = (raw.callId || raw.id) as string | undefined;
  if (!toolCallId) return null;
  const output =
    typeof (item as unknown as Record<string, unknown>).output !== "undefined"
      ? (item as unknown as Record<string, unknown>).output
      : raw.output;
  return { toolCallId, output };
}

function isToolError(output: unknown): boolean {
  if (typeof output !== "string") return false;
  try {
    const parsed = JSON.parse(output);
    return parsed != null && typeof parsed === "object" && "ok" in parsed && parsed.ok === false;
  } catch { return false; }
}

function extractErrorText(output: string): string {
  try {
    const parsed = JSON.parse(output);
    return typeof parsed.error === "string" ? parsed.error : "工具执行失败";
  } catch { return "工具执行失败"; }
}

type StreamPart = Record<string, unknown> & { type: string };

async function* buildUiMessageStream(
  events: AsyncIterable<RunStreamEvent>,
): AsyncGenerator<StreamPart> {
  let messageId: string | null = null;
  let stepOpen = false;
  let pendingStepClose = false;
  let responseHasText = false;
  let stepHasTextOutput = false;
  let textOpen = false;
  let currentTextId = "";
  const startedToolCalls = new Set<string>();
  const emittedToolOutputs = new Set<string>();

  const ensureMessageStart = function* (): Generator<StreamPart> {
    if (!messageId) { messageId = createId("message"); yield { type: "start", messageId }; }
  };
  const ensureStepStart = function* (): Generator<StreamPart> {
    if (!stepOpen) { stepOpen = true; pendingStepClose = false; stepHasTextOutput = false; yield { type: "start-step" }; }
  };
  const finishStep = function* (): Generator<StreamPart> {
    if (stepOpen) { stepOpen = false; pendingStepClose = false; yield { type: "finish-step" }; }
  };

  for await (const event of events) {
    if (event.type === "raw_model_stream_event") {
      const data = event.data as Record<string, unknown>;
      if (data.type === "response_started") { yield* ensureMessageStart(); responseHasText = false; yield* ensureStepStart(); }
      if (data.type === "output_text_delta") {
        yield* ensureMessageStart(); yield* ensureStepStart();
        responseHasText = true; stepHasTextOutput = true;
        if (!textOpen) { currentTextId = createId("text"); textOpen = true; yield { type: "text-start", id: currentTextId }; }
        yield { type: "text-delta", id: currentTextId, delta: data.delta };
      }
      if (data.type === "response_done") {
        if (textOpen) { textOpen = false; yield { type: "text-end", id: currentTextId }; }
        if (stepOpen) { if (stepHasTextOutput) { yield* finishStep(); } else { pendingStepClose = true; } }
      }
    }

    if (event.type === "run_item_stream_event") {
      const item = event.item;

      if (event.name === "message_output_created") {
        yield* ensureMessageStart();
        if (!responseHasText) {
          if (!stepOpen) yield* ensureStepStart();
          const content = (item as unknown as Record<string, unknown>).content as string | undefined;
          if (content) {
            const textId = createId("text");
            yield { type: "text-start", id: textId }; yield { type: "text-delta", id: textId, delta: content }; yield { type: "text-end", id: textId };
            stepHasTextOutput = true; responseHasText = true;
          }
        }
        if (pendingStepClose) yield* finishStep();
      }

      if (event.name === "tool_called") {
        yield* ensureMessageStart();
        const payload = extractToolInput(item);
        if (payload) {
          if (!startedToolCalls.has(payload.toolCallId)) {
            startedToolCalls.add(payload.toolCallId);
            yield { type: "tool-input-start", toolCallId: payload.toolCallId, toolName: payload.toolName, dynamic: true };
          }
          yield { type: "tool-input-available", toolCallId: payload.toolCallId, toolName: payload.toolName, input: payload.input, dynamic: true };
        }
        const hostedOutput = extractHostedToolOutput(item, payload?.toolCallId);
        if (hostedOutput && !emittedToolOutputs.has(hostedOutput.toolCallId)) {
          emittedToolOutputs.add(hostedOutput.toolCallId);
          if (isToolError(hostedOutput.output)) {
            yield { type: "tool-output-error", toolCallId: hostedOutput.toolCallId, errorText: extractErrorText(hostedOutput.output as string), dynamic: true };
          } else {
            yield { type: "tool-output-available", toolCallId: hostedOutput.toolCallId, output: hostedOutput.output, dynamic: true };
          }
        }
      }

      if (event.name === "tool_output") {
        yield* ensureMessageStart();
        const payload = extractToolOutput(item);
        if (payload && !emittedToolOutputs.has(payload.toolCallId)) {
          emittedToolOutputs.add(payload.toolCallId);
          if (isToolError(payload.output)) {
            yield { type: "tool-output-error", toolCallId: payload.toolCallId, errorText: extractErrorText(payload.output as string), dynamic: true };
          } else {
            yield { type: "tool-output-available", toolCallId: payload.toolCallId, output: payload.output, dynamic: true };
          }
        }
      }

      if (event.name === "reasoning_item_created") {
        yield* ensureMessageStart();
        const rawItem = item.rawItem as Record<string, unknown>;
        const content = rawItem.content as Array<{ type: string; text?: string }> | undefined;
        const reasoningText = content?.filter(e => e.type === "input_text").map(e => e.text ?? "").join("");
        if (reasoningText) {
          const reasoningId = createId("reasoning");
          yield { type: "reasoning-start", id: reasoningId }; yield { type: "reasoning-delta", id: reasoningId, delta: reasoningText }; yield { type: "reasoning-end", id: reasoningId };
        }
      }
    }
  }

  if (textOpen) yield { type: "text-end", id: currentTextId };
  if (stepOpen) yield* finishStep();
  yield { type: "finish", finishReason: "stop" };
}

function createAiSdkUiMessageStream(source: AiSdkUiMessageStreamSource): ReadableStream<UIMessageChunk> {
  const events = resolveEventSource(source);
  const iterator = buildUiMessageStream(
    events as AsyncIterable<RunStreamEvent>,
  )[Symbol.asyncIterator]();
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) { const { value, done } = await iterator.next(); if (done) { controller.close(); return; } controller.enqueue(value as UIMessageChunk); },
    async cancel() { if (iterator.return) await iterator.return(undefined); },
  });
}

export function createAiSdkUiMessageStreamResponse(
  source: AiSdkUiMessageStreamSource,
  options: { status?: number; statusText?: string; headers?: HeadersInit } = {},
): Response {
  const stream = createAiSdkUiMessageStream(source);
  return createUIMessageStreamResponse({
    stream,
    status: options.status,
    statusText: options.statusText,
    headers: options.headers,
  });
}
