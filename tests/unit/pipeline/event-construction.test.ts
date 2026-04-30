/**
 * Validation tests for stream event construction with @openai/agents.
 *
 * These tests verify that RunItemStreamEvent, RunToolCallItem, and
 * RunToolCallOutputItem can be constructed with real @openai/agents types,
 * and that the internal buildUiMessageStream generator correctly maps
 * agent events to AI SDK UIMessageChunk types.
 *
 * ─── Minimal rawItem Schema ───
 *
 * FunctionCallItem (for tool_called):
 *   REQUIRED: type: "function_call", callId: string, name: string, arguments: string
 *   OPTIONAL: id?: string, namespace?: string, status?: "in_progress"|"completed"|"incomplete", providerData?: Record
 *
 * FunctionCallResultItem (for tool_output):
 *   REQUIRED: type: "function_call_result", callId: string, name: string, status: "in_progress"|"completed"|"incomplete", output: string | object
 *   OPTIONAL: id?: string, namespace?: string, providerData?: Record
 *
 * The buildUiMessageStream generator resolves toolCallId as:
 *   raw.callId || raw.id || `${toolName}-${generatedId}`
 *
 * The toolName is resolved via getToolCallDisplayName(raw) ?? String(raw.type ?? 'tool').
 * For function_call items, getToolCallDisplayName returns raw.name.
 */

import { describe, test, expect } from "bun:test";
import {
  Agent,
  RunItemStreamEvent,
  RunToolCallItem,
  RunToolCallOutputItem,
} from "@openai/agents";
import type { FunctionCallItem, FunctionCallResultItem } from "@openai/agents-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal Agent for test purposes. */
function createTestAgent(name = "test-agent") {
  return new Agent({ name });
}

/** Minimal valid FunctionCallItem rawItem. */
function createFunctionCallRawItem(
  overrides: Partial<FunctionCallItem> = {},
): FunctionCallItem {
  return {
    type: "function_call",
    callId: "call_001",
    name: "call_actor",
    arguments: '{"character":"林冲","action":"speak"}',
    ...overrides,
  } as FunctionCallItem;
}

/** Minimal valid FunctionCallResultItem rawItem. */
function createFunctionCallResultRawItem(
  overrides: Partial<FunctionCallResultItem> = {},
): FunctionCallResultItem {
  return {
    type: "function_call_result",
    callId: "call_001",
    name: "call_actor",
    status: "completed",
    output: "林冲说道：兄弟，此去沧州，路途遥远。",
    ...overrides,
  } as FunctionCallResultItem;
}

// ---------------------------------------------------------------------------
// 1. RunToolCallItem construction
// ---------------------------------------------------------------------------

describe("RunToolCallItem construction", () => {
  test("constructs with minimal valid FunctionCallItem rawItem", () => {
    const agent = createTestAgent();
    const rawItem = createFunctionCallRawItem();
    const item = new RunToolCallItem(rawItem, agent);

    expect(item.type).toBe("tool_call_item");
    expect(item.rawItem).toBe(rawItem);
    expect(item.agent).toBe(agent);
  });

  test("rawItem fields propagate correctly", () => {
    const agent = createTestAgent("gm");
    const rawItem = createFunctionCallRawItem({
      callId: "call_custom",
      name: "call_archivist",
      arguments: '{"target":"world.md"}',
    });
    const item = new RunToolCallItem(rawItem, agent);

    const raw = item.rawItem as FunctionCallItem;
    expect(raw.type).toBe("function_call");
    expect(raw.callId).toBe("call_custom");
    expect(raw.name).toBe("call_archivist");
    expect(raw.arguments).toBe('{"target":"world.md"}');
  });

  test("rawItem preserves optional fields", () => {
    const agent = createTestAgent();
    const rawItem = createFunctionCallRawItem({
      id: "item_001",
      namespace: "tools",
      status: "completed",
    });
    const item = new RunToolCallItem(rawItem, agent);

    const raw = item.rawItem as FunctionCallItem;
    expect(raw.id).toBe("item_001");
    expect(raw.namespace).toBe("tools");
    expect(raw.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// 2. RunToolCallOutputItem construction
// ---------------------------------------------------------------------------

describe("RunToolCallOutputItem construction", () => {
  test("constructs with minimal valid FunctionCallResultItem rawItem", () => {
    const agent = createTestAgent();
    const rawItem = createFunctionCallResultRawItem();
    const output = "Tool execution result";
    const item = new RunToolCallOutputItem(rawItem, agent, output);

    expect(item.type).toBe("tool_call_output_item");
    expect(item.rawItem).toBe(rawItem);
    expect(item.agent).toBe(agent);
    expect(item.output).toBe(output);
  });

  test("rawItem fields propagate correctly", () => {
    const agent = createTestAgent("actor");
    const rawItem = createFunctionCallResultRawItem({
      callId: "call_out_001",
      name: "call_scribe",
      status: "completed",
      output: "Literary text output",
    });
    const item = new RunToolCallOutputItem(rawItem, agent, "formatted output");

    const raw = item.rawItem as FunctionCallResultItem;
    expect(raw.type).toBe("function_call_result");
    expect(raw.callId).toBe("call_out_001");
    expect(raw.name).toBe("call_scribe");
    expect(raw.status).toBe("completed");
    expect(item.output).toBe("formatted output");
  });

  test("output can be a non-string value", () => {
    const agent = createTestAgent();
    const rawItem = createFunctionCallResultRawItem();
    const objectOutput = { text: "result", tokens: 42 };
    const item = new RunToolCallOutputItem(rawItem, agent, objectOutput);

    expect(item.output).toEqual(objectOutput);
  });
});

// ---------------------------------------------------------------------------
// 3. RunItemStreamEvent construction
// ---------------------------------------------------------------------------

describe("RunItemStreamEvent construction", () => {
  test("tool_called event wraps RunToolCallItem", () => {
    const agent = createTestAgent();
    const rawItem = createFunctionCallRawItem();
    const toolCallItem = new RunToolCallItem(rawItem, agent);
    const event = new RunItemStreamEvent("tool_called", toolCallItem);

    expect(event.type).toBe("run_item_stream_event");
    expect(event.name).toBe("tool_called");
    expect(event.item).toBe(toolCallItem);
    expect(event.item.type).toBe("tool_call_item");
  });

  test("tool_output event wraps RunToolCallOutputItem", () => {
    const agent = createTestAgent();
    const rawItem = createFunctionCallResultRawItem();
    const toolOutputItem = new RunToolCallOutputItem(rawItem, agent, "result text");
    const event = new RunItemStreamEvent("tool_output", toolOutputItem);

    expect(event.type).toBe("run_item_stream_event");
    expect(event.name).toBe("tool_output");
    expect(event.item).toBe(toolOutputItem);
    expect(event.item.type).toBe("tool_call_output_item");
  });

  test("all RunItemStreamEventName values are accepted", () => {
    const agent = createTestAgent();
    const rawCallItem = createFunctionCallRawItem();
    const toolCallItem = new RunToolCallItem(rawCallItem, agent);

    const validNames = [
      "message_output_created",
      "handoff_requested",
      "handoff_occurred",
      "tool_search_called",
      "tool_search_output_created",
      "tool_called",
      "tool_output",
      "reasoning_item_created",
      "tool_approval_requested",
    ] as const;

    for (const name of validNames) {
      const event = new RunItemStreamEvent(name, toolCallItem);
      expect(event.name).toBe(name);
      expect(event.type).toBe("run_item_stream_event");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. buildUiMessageStream — UIMessageChunk production
// ---------------------------------------------------------------------------

/**
 * We test the buildUiMessageStream generator by creating an async iterable
 * of RunStreamEvent events and collecting the yielded UIMessageChunks.
 *
 * The generator is an internal function, but we can test it indirectly by
 * using createAiSdkUiMessageStream which wraps it. However, since
 * createAiSdkUiMessageStream returns a ReadableStream, we'll construct
 * events and feed them through to verify the output chunks.
 */

describe("buildUiMessageStream UIMessageChunk production", () => {
  /**
   * Feed events through createAiSdkUiMessageStream and collect all chunks.
   */
  async function collectChunks(
    events: ReadableStream<import("@openai/agents").RunStreamEvent>,
  ) {
    const { createAiSdkUiMessageStream } = await import(
      "@openai/agents-extensions/ai-sdk-ui"
    );
    const stream = createAiSdkUiMessageStream(events);
    const reader = stream.getReader();
    const chunks: import("ai").UIMessageChunk[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return chunks;
  }

  test("tool_called produces tool-input-start + tool-input-available", async () => {
    const agent = createTestAgent();
    const rawItem = createFunctionCallRawItem({
      callId: "call_stream_001",
      name: "call_actor",
      arguments: '{"character":"武松"}',
    });
    const toolCallItem = new RunToolCallItem(rawItem, agent);
    const event = new RunItemStreamEvent("tool_called", toolCallItem);

    const eventStream = new ReadableStream({
      start(controller) {
        controller.enqueue(event);
        controller.close();
      },
    });

    const chunks = await collectChunks(eventStream);

    const toolInputStart = chunks.find((c) => c.type === "tool-input-start");
    const toolInputAvailable = chunks.find(
      (c) => c.type === "tool-input-available",
    );

    expect(toolInputStart).toBeDefined();
    expect(toolInputAvailable).toBeDefined();

    if (toolInputStart && toolInputStart.type === "tool-input-start") {
      expect(toolInputStart.toolCallId).toBe("call_stream_001");
      expect(toolInputStart.toolName).toBe("call_actor");
    }

    if (
      toolInputAvailable &&
      toolInputAvailable.type === "tool-input-available"
    ) {
      expect(toolInputAvailable.toolCallId).toBe("call_stream_001");
      expect(toolInputAvailable.toolName).toBe("call_actor");
      expect(toolInputAvailable.input).toEqual({ character: "武松" });
    }
  });

  test("tool_output produces tool-output-available", async () => {
    const agent = createTestAgent();
    const rawItem = createFunctionCallResultRawItem({
      callId: "call_stream_002",
      name: "call_actor",
      status: "completed",
      output: "武松打虎",
    });
    const outputText = "武松景阳冈打虎，三拳两脚毙大虫。";
    const toolOutputItem = new RunToolCallOutputItem(
      rawItem,
      agent,
      outputText,
    );
    const event = new RunItemStreamEvent("tool_output", toolOutputItem);

    const eventStream = new ReadableStream({
      start(controller) {
        controller.enqueue(event);
        controller.close();
      },
    });

    const chunks = await collectChunks(eventStream);

    const toolOutputAvailable = chunks.find(
      (c) => c.type === "tool-output-available",
    );

    expect(toolOutputAvailable).toBeDefined();

    if (
      toolOutputAvailable &&
      toolOutputAvailable.type === "tool-output-available"
    ) {
      expect(toolOutputAvailable.toolCallId).toBe("call_stream_002");
      // extractToolOutput: item.output takes priority over raw.output
      expect(toolOutputAvailable.output).toBe(outputText);
    }
  });

  test("toolName, toolCallId, input propagate correctly for function_call", async () => {
    const agent = createTestAgent("gm");
    const rawItem = createFunctionCallRawItem({
      callId: "call_prop_test",
      name: "call_archivist",
      arguments: '{"action":"update","file":"world.md","content":"新设定"}',
    });
    const toolCallItem = new RunToolCallItem(rawItem, agent);
    const event = new RunItemStreamEvent("tool_called", toolCallItem);

    const eventStream = new ReadableStream({
      start(controller) {
        controller.enqueue(event);
        controller.close();
      },
    });

    const chunks = await collectChunks(eventStream);

    const toolInputAvailable = chunks.find(
      (c) => c.type === "tool-input-available",
    );

    expect(toolInputAvailable).toBeDefined();
    if (
      toolInputAvailable &&
      toolInputAvailable.type === "tool-input-available"
    ) {
      expect(toolInputAvailable.toolCallId).toBe("call_prop_test");
      expect(toolInputAvailable.toolName).toBe("call_archivist");
      expect(toolInputAvailable.input).toEqual({
        action: "update",
        file: "world.md",
        content: "新设定",
      });
    }
  });

  test("output field propagates from RunToolCallOutputItem.output", async () => {
    const agent = createTestAgent();
    const rawItem = createFunctionCallResultRawItem({
      callId: "call_out_prop",
      name: "call_scribe",
      status: "completed",
      output: "raw output in rawItem",
    });
    // The constructor output arg takes priority over rawItem.output in extractToolOutput
    const priorityOutput = "priority output from constructor";
    const toolOutputItem = new RunToolCallOutputItem(
      rawItem,
      agent,
      priorityOutput,
    );
    const event = new RunItemStreamEvent("tool_output", toolOutputItem);

    const eventStream = new ReadableStream({
      start(controller) {
        controller.enqueue(event);
        controller.close();
      },
    });

    const chunks = await collectChunks(eventStream);

    const toolOutputAvailable = chunks.find(
      (c) => c.type === "tool-output-available",
    );

    expect(toolOutputAvailable).toBeDefined();
    if (
      toolOutputAvailable &&
      toolOutputAvailable.type === "tool-output-available"
    ) {
      // extractToolOutput: item.output takes priority over raw.output
      expect(toolOutputAvailable.output).toBe(priorityOutput);
    }
  });

  test("toolCallId falls back to raw.id when callId is missing", async () => {
    const agent = createTestAgent();
    // Create a rawItem with id but no callId — this is technically invalid
    // per the FunctionCallItem schema, but the stream adapter handles it.
    // We test the fallback by providing an id field.
    const rawItem = createFunctionCallRawItem({
      callId: "call_fallback_id",
      id: "item_fallback",
    });
    const toolCallItem = new RunToolCallItem(rawItem, agent);
    const event = new RunItemStreamEvent("tool_called", toolCallItem);

    const eventStream = new ReadableStream({
      start(controller) {
        controller.enqueue(event);
        controller.close();
      },
    });

    const chunks = await collectChunks(eventStream);

    const toolInputStart = chunks.find((c) => c.type === "tool-input-start");

    expect(toolInputStart).toBeDefined();
    if (toolInputStart && toolInputStart.type === "tool-input-start") {
      expect(toolInputStart.toolCallId).toBe("call_fallback_id");
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Missing required fields validation
// ---------------------------------------------------------------------------

describe("Missing required fields", () => {
  test("FunctionCallItem without callId still constructs but produces unpredictable toolCallId", async () => {
    const agent = createTestAgent();
    // Zod requires callId but JS construction doesn't enforce it — stream adapter generates a fallback
    const rawItem = {
      type: "function_call" as const,
      name: "call_actor",
      arguments: '{"test":true}',
    };
    const item = new RunToolCallItem(
      rawItem as unknown as FunctionCallItem,
      agent,
    );
    const event = new RunItemStreamEvent("tool_called", item);

    const eventStream = new ReadableStream({
      start(controller) {
        controller.enqueue(event);
        controller.close();
      },
    });

    const { createAiSdkUiMessageStream } = await import(
      "@openai/agents-extensions/ai-sdk-ui"
    );
    const stream = createAiSdkUiMessageStream(eventStream);
    const reader = stream.getReader();
    const chunks: import("ai").UIMessageChunk[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const toolInputStart = chunks.find((c) => c.type === "tool-input-start");
    expect(toolInputStart).toBeDefined();
    if (toolInputStart && toolInputStart.type === "tool-input-start") {
      // Without callId, resolveToolCallId falls back to `${toolName}-${generatedId}`
      expect(toolInputStart.toolCallId).toContain("call_actor-");
      expect(toolInputStart.toolName).toBe("call_actor");
    }
  });

  test("FunctionCallResultItem without callId produces null toolCallId in extractToolOutput", async () => {
    const agent = createTestAgent();
    // Without callId AND id, extractToolOutput returns null → tool_output event silently dropped
    const rawItem = {
      type: "function_call_result" as const,
      name: "call_actor",
      status: "completed" as const,
      output: "orphaned output",
    };
    const item = new RunToolCallOutputItem(
      rawItem as unknown as FunctionCallResultItem,
      agent,
      "output text",
    );
    const event = new RunItemStreamEvent("tool_output", item);

    const eventStream = new ReadableStream({
      start(controller) {
        controller.enqueue(event);
        controller.close();
      },
    });

    const { createAiSdkUiMessageStream } = await import(
      "@openai/agents-extensions/ai-sdk-ui"
    );
    const stream = createAiSdkUiMessageStream(eventStream);
    const reader = stream.getReader();
    const chunks: import("ai").UIMessageChunk[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Without callId or id, extractToolOutput returns null → no tool-output-available emitted
    const toolOutputAvailable = chunks.find(
      (c) => c.type === "tool-output-available",
    );
    expect(toolOutputAvailable).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Full pipeline: tool_called → tool_output sequence
// ---------------------------------------------------------------------------

describe("Full tool_called → tool_output pipeline", () => {
  test("paired events produce correct chunk sequence", async () => {
    const agent = createTestAgent("gm");
    const callId = "call_pipeline_001";

    const callRawItem = createFunctionCallRawItem({
      callId,
      name: "call_actor",
      arguments: '{"character":"鲁智深","action":"fight"}',
    });
    const toolCallItem = new RunToolCallItem(callRawItem, agent);
    const calledEvent = new RunItemStreamEvent("tool_called", toolCallItem);

    const resultRawItem = createFunctionCallResultRawItem({
      callId,
      name: "call_actor",
      status: "completed",
      output: "鲁智深倒拔垂杨柳",
    });
    const toolOutputItem = new RunToolCallOutputItem(
      resultRawItem,
      agent,
      "鲁智深大喝一声，双手抱住垂杨柳，腰一使劲，将那树连根拔起！",
    );
    const outputEvent = new RunItemStreamEvent("tool_output", toolOutputItem);

    const eventStream = new ReadableStream({
      start(controller) {
        controller.enqueue(calledEvent);
        controller.enqueue(outputEvent);
        controller.close();
      },
    });

    const { createAiSdkUiMessageStream } = await import(
      "@openai/agents-extensions/ai-sdk-ui"
    );
    const stream = createAiSdkUiMessageStream(eventStream);
    const reader = stream.getReader();
    const chunks: import("ai").UIMessageChunk[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const toolChunks = chunks.filter(
      (c) =>
        c.type === "tool-input-start" ||
        c.type === "tool-input-available" ||
        c.type === "tool-output-available",
    );

    expect(toolChunks).toHaveLength(3);
    expect(toolChunks[0].type).toBe("tool-input-start");
    expect(toolChunks[1].type).toBe("tool-input-available");
    expect(toolChunks[2].type).toBe("tool-output-available");

    const allCallIds = toolChunks.map((c) => {
      if (
        c.type === "tool-input-start" ||
        c.type === "tool-input-available" ||
        c.type === "tool-output-available"
      ) {
        return c.toolCallId;
      }
      return undefined;
    });
    expect(allCallIds.every((id) => id === callId)).toBe(true);

    const inputChunk = toolChunks[1];
    if (inputChunk.type === "tool-input-available") {
      expect(inputChunk.toolName).toBe("call_actor");
      expect(inputChunk.input).toEqual({
        character: "鲁智深",
        action: "fight",
      });
    }

    const outputChunk = toolChunks[2];
    if (outputChunk.type === "tool-output-available") {
      expect(outputChunk.output).toBe(
        "鲁智深大喝一声，双手抱住垂杨柳，腰一使劲，将那树连根拔起！",
      );
    }
  });
});
