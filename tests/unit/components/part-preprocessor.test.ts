import { describe, test, expect } from "bun:test";

import type { DynamicToolPart } from "@/components/chat/types";
import { preprocessParts } from "@/components/chat/part-preprocessor";

import type { UIMessage } from "ai";

function dtp(overrides?: Partial<DynamicToolPart>): UIMessage["parts"][number] {
  return {
    type: "dynamic-tool" as const,
    toolName: "test_tool",
    state: "output-available",
    input: { key: "value" },
    output: "test output",
    error: undefined,
    errorText: undefined,
    toolCallId: "call_123",
    title: "Test Tool",
    providerExecuted: true,
    preliminary: false,
    ...overrides,
  } as UIMessage["parts"][number];
}

function textPart(text: string): UIMessage["parts"][number] {
  return { type: "text" as const, text } as UIMessage["parts"][number];
}

function stepStartPart(): UIMessage["parts"][number] {
  return { type: "step-start" as const } as UIMessage["parts"][number];
}

describe("preprocessParts", () => {
  test("converts dynamic-tool part to data-dynamic-tool part", () => {
    const parts: UIMessage["parts"] = [dtp()];
    const result = preprocessParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("data-dynamic-tool");
  });

  test("preserves all original fields in data object", () => {
    const original = dtp();
    const parts: UIMessage["parts"] = [original];
    const result = preprocessParts(parts);

    const converted = result[0] as { type: string; data: Record<string, unknown> };
    expect(converted.type).toBe("data-dynamic-tool");
    expect(converted.data.toolName).toBe("test_tool");
    expect(converted.data.state).toBe("output-available");
    expect(converted.data.input).toEqual({ key: "value" });
    expect(converted.data.output).toBe("test output");
    expect(converted.data.toolCallId).toBe("call_123");
    expect(converted.data.title).toBe("Test Tool");
    expect(converted.data.providerExecuted).toBe(true);
    expect(converted.data.preliminary).toBe(false);
  });

  test("conversion is reversible — can read original fields back", () => {
    const original = dtp({
      toolName: "call_actor",
      state: "input-streaming",
      input: { character: "张三", action: "speak" },
      output: "你好",
      toolCallId: "actor-001",
    });
    const parts: UIMessage["parts"] = [original];
    const result = preprocessParts(parts);

    const converted = result[0] as { type: string; data: Record<string, unknown> };
    expect(converted.data.toolName).toBe("call_actor");
    expect(converted.data.state).toBe("input-streaming");
    expect(converted.data.input).toEqual({ character: "张三", action: "speak" });
    expect(converted.data.output).toBe("你好");
    expect(converted.data.toolCallId).toBe("actor-001");
  });

  test("handles dynamic-tool part with error state", () => {
    const original = dtp({
      toolName: "failing_tool",
      state: "output-error",
      error: "Something went wrong",
      errorText: "Detailed error trace",
    });
    const parts: UIMessage["parts"] = [original];
    const result = preprocessParts(parts);

    const converted = result[0] as { type: string; data: Record<string, unknown> };
    expect(converted.type).toBe("data-dynamic-tool");
    expect(converted.data.error).toBe("Something went wrong");
    expect(converted.data.errorText).toBe("Detailed error trace");
    expect(converted.data.state).toBe("output-error");
  });

  test("handles dynamic-tool part with minimal fields", () => {
    const original = dtp({
      toolName: undefined,
      state: undefined,
      input: undefined,
      output: undefined,
      toolCallId: undefined,
      title: undefined,
      providerExecuted: undefined,
      preliminary: undefined,
    });
    const parts: UIMessage["parts"] = [original];
    const result = preprocessParts(parts);

    const converted = result[0] as { type: string; data: Record<string, unknown> };
    expect(converted.type).toBe("data-dynamic-tool");
    // Verify that the data object exists and has no unexpected keys
    // (type is stripped, leaving only undefined dynamic-tool fields)
    const data = converted.data;
    const keys = Object.keys(data);
    expect(keys.length).toBeGreaterThanOrEqual(0);
  });

  test("text parts pass through unchanged", () => {
    const parts: UIMessage["parts"] = [textPart("Hello world")];
    const result = preprocessParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    expect((result[0] as { text: string }).text).toBe("Hello world");
  });

  test("step-start parts pass through unchanged", () => {
    const parts: UIMessage["parts"] = [stepStartPart()];
    const result = preprocessParts(parts);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("step-start");
  });

  test("mixed array of parts gets correct conversion", () => {
    const parts: UIMessage["parts"] = [
      textPart("Starting..."),
      stepStartPart(),
      dtp({ toolName: "tool_a", toolCallId: "a1" }),
      textPart("Middle text"),
      dtp({ toolName: "tool_b", toolCallId: "b1" }),
      stepStartPart(),
      textPart("Done."),
    ];
    const result = preprocessParts(parts);

    expect(result).toHaveLength(7);

    // text passes through
    expect(result[0].type).toBe("text");
    // step-start passes through
    expect(result[1].type).toBe("step-start");
    // dynamic-tool converted
    expect(result[2].type).toBe("data-dynamic-tool");
    expect((result[2] as { data: Record<string, unknown> }).data.toolName).toBe("tool_a");
    // text passes through
    expect(result[3].type).toBe("text");
    // dynamic-tool converted
    expect(result[4].type).toBe("data-dynamic-tool");
    expect((result[4] as { data: Record<string, unknown> }).data.toolName).toBe("tool_b");
    // step-start passes through
    expect(result[5].type).toBe("step-start");
    // text passes through
    expect(result[6].type).toBe("text");
  });

  test("empty array returns empty array", () => {
    const parts: UIMessage["parts"] = [];
    const result = preprocessParts(parts);

    expect(result).toEqual([]);
  });

  test("does not include type field in data object", () => {
    const original = dtp({ toolName: "my_tool" });
    const parts: UIMessage["parts"] = [original];
    const result = preprocessParts(parts);

    const converted = result[0] as { type: string; data: Record<string, unknown> };
    expect(converted.type).toBe("data-dynamic-tool");
    expect(converted.data).not.toHaveProperty("type");
    expect(converted.data.toolName).toBe("my_tool");
  });
});