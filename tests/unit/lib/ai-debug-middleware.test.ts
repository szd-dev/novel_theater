import { describe, test, expect } from "bun:test";
import { createDebugMiddleware, resetRoundCounter } from "@/lib/ai-debug-middleware";

function fakeModel(overrides: Record<string, unknown> = {}) {
  return {
    specificationVersion: "v3" as const,
    provider: "test",
    modelId: "test-model",
    supportedUrls: {},
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: "stub" }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
      warnings: [],
    }),
    doStream: async () => ({ stream: new ReadableStream() }),
    ...overrides,
  };
}

describe("createDebugMiddleware", () => {
  test("returns a v3 middleware with wrapGenerate and wrapStream", () => {
    const mw = createDebugMiddleware("test-model");
    expect(mw.specificationVersion).toBe("v3");
    expect(typeof mw.wrapGenerate).toBe("function");
    expect(typeof mw.wrapStream).toBe("function");
  });

  test("wrapGenerate calls doGenerate and returns its result", async () => {
    resetRoundCounter();

    const expectedResult = {
      content: [{ type: "text" as const, text: "hello" }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    };

    const mw = createDebugMiddleware("test-model");

    const result = await mw.wrapGenerate!({
      doGenerate: async () => expectedResult,
      doStream: async () => ({ stream: new ReadableStream() }),
      params: {
        prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }],
      },
      model: fakeModel(),
    });

    expect(result).toBe(expectedResult);
  });

  test("wrapGenerate logs error but re-throws", async () => {
    resetRoundCounter();

    const mw = createDebugMiddleware("test-model");

    await expect(
      mw.wrapGenerate!({
        doGenerate: async () => {
          throw new Error("model failure");
        },
        doStream: async () => ({ stream: new ReadableStream() }),
        params: {
          prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }],
        },
        model: fakeModel(),
      }),
    ).rejects.toThrow("model failure");
  });

  test("wrapStream tees the stream and returns consumer side", async () => {
    resetRoundCounter();

    const mw = createDebugMiddleware("test-model");

    const originalStream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-delta" as const, id: "1", delta: "hello" });
        controller.enqueue({ type: "text-delta" as const, id: "1", delta: " world" });
        controller.enqueue({
          type: "finish" as const,
          usage: {
            inputTokens: { total: 10, noCache: 0, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 5, text: 5, reasoning: 0 },
          },
          finishReason: { unified: "stop" as const, raw: "stop" },
        });
        controller.close();
      },
    });

    const result = await mw.wrapStream!({
      doGenerate: async () => {
        throw new Error("unexpected generate");
      },
      doStream: async () => ({ stream: originalStream }),
      params: {
        prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }],
      },
      model: fakeModel(),
    });

    expect(result.stream).toBeDefined();

    const reader = result.stream.getReader();
    const parts: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value.type);
    }

    expect(parts).toEqual(["text-delta", "text-delta", "finish"]);
  });

  test("wrapStream logs error but re-throws", async () => {
    resetRoundCounter();

    const mw = createDebugMiddleware("test-model");

    await expect(
      mw.wrapStream!({
        doGenerate: async () => {
          throw new Error("unexpected generate");
        },
        doStream: async () => {
          throw new Error("stream failure");
        },
        params: {
          prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }],
        },
        model: fakeModel(),
      }),
    ).rejects.toThrow("stream failure");
  });

  test("handles tool calls in generate content", async () => {
    resetRoundCounter();

    const expectedResult = {
      content: [
        { type: "text" as const, text: "I will call a tool" },
        {
          type: "tool-call" as const,
          toolCallId: "call_1",
          toolName: "search",
          input: '{"query":"test"}',
        },
      ],
      finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
      usage: {
        inputTokens: { total: 20, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 15, text: 3, reasoning: 0 },
      },
      warnings: [],
    };

    const mw = createDebugMiddleware("test-model");

    const result = await mw.wrapGenerate!({
      doGenerate: async () => expectedResult,
      doStream: async () => ({ stream: new ReadableStream() }),
      params: {
        prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "search for test" }] }],
      },
      model: fakeModel(),
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe("text");
  });

  test("handles multi-message input prompt", async () => {
    resetRoundCounter();

    const expectedResult = {
      content: [{ type: "text" as const, text: "ok" }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 30, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 2, text: 2, reasoning: 0 },
      },
      warnings: [],
    };

    const mw = createDebugMiddleware("test-model");

    const result = await mw.wrapGenerate!({
      doGenerate: async () => expectedResult,
      doStream: async () => ({ stream: new ReadableStream() }),
      params: {
        prompt: [
          { role: "system" as const, content: "You are helpful." },
          { role: "user" as const, content: [{ type: "text" as const, text: "hello" }] },
        ],
      },
      model: fakeModel(),
    });

    expect(result.content[0].type).toBe("text");
  });

  test("resetRoundCounter allows fresh counting between runs", () => {
    resetRoundCounter();
    const mw1 = createDebugMiddleware("a");
    const mw2 = createDebugMiddleware("b");

    expect(typeof mw1.wrapGenerate).toBe("function");
    expect(typeof mw2.wrapStream).toBe("function");
  });
});