import { describe, test, expect, beforeEach, jest } from "bun:test";
import { Agent, RunItemStreamEvent, RunToolCallItem, RunToolCallOutputItem } from "@openai/agents";
import type { RunResult, RunStreamEvent } from "@openai/agents";
import {
  callAgent,
  callAgentsParallel,
  forwardRun,
  _setRunFn,
  _resetRunFn,
} from "@/pipeline/call-agent";

type AnyRunResult = RunResult<any, any>;

function createTestAgent(name = "test-agent") {
  return new Agent({ name });
}

function createMockRunResult(finalOutput: unknown = "test output"): AnyRunResult {
  return { finalOutput } as AnyRunResult;
}

async function collectEvents(gen: AsyncGenerator<RunStreamEvent>): Promise<RunItemStreamEvent[]> {
  const events: RunItemStreamEvent[] = [];
  for await (const event of gen) {
    if (event instanceof RunItemStreamEvent) {
      events.push(event);
    }
  }
  return events;
}

const mockRun = jest.fn();

beforeEach(() => {
  mockRun.mockReset();
  _setRunFn(mockRun as any);
});

describe("callAgent", () => {
  test("produces [tool_called, tool_output] event sequence", async () => {
    const agent = createTestAgent("actor");
    mockRun.mockResolvedValue(createMockRunResult("林冲说道"));

    const { events, result } = callAgent({ agent, input: "speak" });

    const collected = await collectEvents(events);
    expect(collected).toHaveLength(2);
    expect(collected[0]).toBeInstanceOf(RunItemStreamEvent);
    expect(collected[0].name).toBe("tool_called");
    expect(collected[0].item).toBeInstanceOf(RunToolCallItem);
    expect(collected[1].name).toBe("tool_output");
    expect(collected[1].item).toBeInstanceOf(RunToolCallOutputItem);
  });

  test("tool_called and tool_output share the same toolCallId", async () => {
    const agent = createTestAgent("scribe");
    mockRun.mockResolvedValue(createMockRunResult("narrative text"));

    const { events } = callAgent({ agent, input: "narrate" });
    const collected = await collectEvents(events);

    const callRaw = collected[0].item.rawItem as any;
    const outputRaw = collected[1].item.rawItem as any;
    expect(callRaw.callId).toBe(outputRaw.callId);
    expect(callRaw.callId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("result promise resolves to RunResult", async () => {
    const agent = createTestAgent("archivist");
    const mockResult = createMockRunResult("updated world.md");
    mockRun.mockResolvedValue(mockResult);

    const { events, result } = callAgent({ agent, input: "update" });
    await collectEvents(events);

    const resolved = await result;
    expect(resolved).toBe(mockResult);
  });

  test("result promise rejects when run throws", async () => {
    const agent = createTestAgent("actor");
    mockRun.mockRejectedValue(new Error("API failure"));

    const { events, result } = callAgent({ agent, input: "fail" });

    let eventError: unknown;
    try {
      await collectEvents(events);
    } catch (e) {
      eventError = e;
    }

    await expect(result).rejects.toThrow("API failure");
    expect(eventError).toBeDefined();
  });

  test("rawItem fields match agent name and input", async () => {
    const agent = createTestAgent("scribe");
    mockRun.mockResolvedValue(createMockRunResult("output"));

    const { events } = callAgent({ agent, input: "write scene" });
    const collected = await collectEvents(events);

    const callRaw = collected[0].item.rawItem as any;
    expect(callRaw.type).toBe("function_call");
    expect(callRaw.name).toBe("scribe");
    expect(JSON.parse(callRaw.arguments)).toEqual({ input: "write scene" });

    const outputRaw = collected[1].item.rawItem as any;
    expect(outputRaw.type).toBe("function_call_result");
    expect(outputRaw.name).toBe("scribe");
    expect(outputRaw.status).toBe("completed");
  });

  test("passes context and session to run options", async () => {
    const agent = createTestAgent("actor");
    const context = { storyDir: "/path" };
    const session = {} as any;
    mockRun.mockResolvedValue(createMockRunResult("ok"));

    const { events } = callAgent({ agent, input: "act", context, session });
    await collectEvents(events);

    expect(mockRun).toHaveBeenCalledTimes(1);
    const runOpts = mockRun.mock.calls[0][2] as Record<string, unknown>;
    expect(runOpts.context).toBe(context);
    expect(runOpts.session).toBe(session);
  });

  test("tool_output contains finalOutput as string", async () => {
    const agent = createTestAgent("actor");
    mockRun.mockResolvedValue(createMockRunResult("character dialogue"));

    const { events } = callAgent({ agent, input: "speak" });
    const collected = await collectEvents(events);

    const outputItem = collected[1].item as RunToolCallOutputItem;
    expect(outputItem.output).toBe("character dialogue");
  });

  test("tool_output handles null finalOutput", async () => {
    const agent = createTestAgent("actor");
    mockRun.mockResolvedValue(createMockRunResult(null));

    const { events } = callAgent({ agent, input: "speak" });
    const collected = await collectEvents(events);

    const outputItem = collected[1].item as RunToolCallOutputItem;
    expect(outputItem.output).toBe("");
  });
});

describe("callAgentsParallel", () => {
  test("produces [N tool_called, N tool_output] event sequence", async () => {
    const agent1 = createTestAgent("actor-1");
    const agent2 = createTestAgent("actor-2");

    mockRun.mockResolvedValueOnce(createMockRunResult("output-1"));
    mockRun.mockResolvedValueOnce(createMockRunResult("output-2"));

    const { events, results } = callAgentsParallel([
      { agent: agent1, input: "speak" },
      { agent: agent2, input: "react" },
    ]);

    const collected = await collectEvents(events);
    expect(collected).toHaveLength(4);

    expect(collected[0].name).toBe("tool_called");
    expect(collected[1].name).toBe("tool_called");
    expect(collected[2].name).toBe("tool_output");
    expect(collected[3].name).toBe("tool_output");

    await results;
  });

  test("all tool_called events appear before any tool_output", async () => {
    const agents = [
      createTestAgent("a"),
      createTestAgent("b"),
      createTestAgent("c"),
    ];
    for (let i = 0; i < 3; i++) {
      mockRun.mockResolvedValueOnce(createMockRunResult(`out-${i}`));
    }

    const { events } = callAgentsParallel(
      agents.map((a, i) => ({ agent: a, input: `input-${i}` })),
    );
    const collected = await collectEvents(events);

    const calledCount = collected.filter((e) => e.name === "tool_called").length;
    const firstOutputIdx = collected.findIndex((e) => e.name === "tool_output");
    const lastCalledIdx = collected.map((e, i) => e.name === "tool_called" ? i : -1).filter(i => i >= 0).pop();

    expect(calledCount).toBe(3);
    expect(firstOutputIdx).toBeGreaterThan(lastCalledIdx!);
  });

  test("each tool_called/tool_output pair shares toolCallId", async () => {
    const agent1 = createTestAgent("actor-1");
    const agent2 = createTestAgent("actor-2");

    mockRun.mockResolvedValueOnce(createMockRunResult("out-1"));
    mockRun.mockResolvedValueOnce(createMockRunResult("out-2"));

    const { events } = callAgentsParallel([
      { agent: agent1, input: "a" },
      { agent: agent2, input: "b" },
    ]);

    const collected = await collectEvents(events);
    const callIds = collected
      .filter((e) => e.name === "tool_called")
      .map((e) => (e.item.rawItem as any).callId);
    const outputCallIds = collected
      .filter((e) => e.name === "tool_output")
      .map((e) => (e.item.rawItem as any).callId);

    expect(callIds).toHaveLength(2);
    expect(outputCallIds).toHaveLength(2);
    expect(callIds).toEqual(outputCallIds);
    expect(callIds[0]).not.toBe(callIds[1]);
  });

  test("results promise resolves to array of RunResults", async () => {
    const agent1 = createTestAgent("a");
    const agent2 = createTestAgent("b");
    const result1 = createMockRunResult("r1");
    const result2 = createMockRunResult("r2");

    mockRun.mockResolvedValueOnce(result1);
    mockRun.mockResolvedValueOnce(result2);

    const { events, results } = callAgentsParallel([
      { agent: agent1, input: "x" },
      { agent: agent2, input: "y" },
    ]);

    await collectEvents(events);
    const resolved = await results;

    expect(resolved).toEqual([result1, result2]);
  });

  test("results promise rejects when any run fails", async () => {
    const agent1 = createTestAgent("a");
    const agent2 = createTestAgent("b");

    mockRun.mockResolvedValueOnce(createMockRunResult("ok"));
    mockRun.mockRejectedValueOnce(new Error("boom"));

    const { events, results } = callAgentsParallel([
      { agent: agent1, input: "x" },
      { agent: agent2, input: "y" },
    ]);

    try {
      await collectEvents(events);
    } catch {}

    await expect(results).rejects.toThrow("boom");
  });

  test("agent names propagate to rawItem", async () => {
    const agent1 = createTestAgent("actor");
    const agent2 = createTestAgent("scribe");

    mockRun.mockResolvedValueOnce(createMockRunResult("a"));
    mockRun.mockResolvedValueOnce(createMockRunResult("b"));

    const { events } = callAgentsParallel([
      { agent: agent1, input: "act" },
      { agent: agent2, input: "write" },
    ]);

    const collected = await collectEvents(events);
    const callNames = collected
      .filter((e) => e.name === "tool_called")
      .map((e) => (e.item.rawItem as any).name);
    const outputNames = collected
      .filter((e) => e.name === "tool_output")
      .map((e) => (e.item.rawItem as any).name);

    expect(callNames).toEqual(["actor", "scribe"]);
    expect(outputNames).toEqual(["actor", "scribe"]);
  });
});

describe("forwardRun", () => {
  test("forwards all events from StreamedRunResult", async () => {
    const agent = createTestAgent("gm");
    const eventsToForward: RunStreamEvent[] = [];

    for (let i = 0; i < 3; i++) {
      const rawItem = {
        type: "function_call" as const,
        callId: `call-${i}`,
        name: `tool-${i}`,
        arguments: "{}",
      };
      const item = new RunToolCallItem(rawItem, agent);
      eventsToForward.push(new RunItemStreamEvent("tool_called", item));
    }

    async function* mockStream(): AsyncGenerator<RunStreamEvent> {
      for (const event of eventsToForward) {
        yield event;
      }
    }

    const mockStreamedResult = {
      [Symbol.asyncIterator]: () => mockStream()[Symbol.asyncIterator](),
    } as any;

    const forwarded = [];
    for await (const event of forwardRun(mockStreamedResult)) {
      forwarded.push(event);
    }

    expect(forwarded).toHaveLength(3);
    expect(forwarded).toEqual(eventsToForward);
  });

  test("handles empty stream", async () => {
    async function* emptyStream(): AsyncGenerator<RunStreamEvent> {}

    const mockStreamedResult = {
      [Symbol.asyncIterator]: () => emptyStream()[Symbol.asyncIterator](),
    } as any;

    const forwarded = [];
    for await (const event of forwardRun(mockStreamedResult)) {
      forwarded.push(event);
    }

    expect(forwarded).toHaveLength(0);
  });

  test("preserves event order", async () => {
    const agent = createTestAgent("gm");
    const callRawItem = {
      type: "function_call" as const,
      callId: "call-fwd",
      name: "call_actor",
      arguments: "{}",
    };
    const resultRawItem = {
      type: "function_call_result" as const,
      callId: "call-fwd",
      name: "call_actor",
      status: "completed" as const,
      output: "result",
    };

    const calledEvent = new RunItemStreamEvent(
      "tool_called",
      new RunToolCallItem(callRawItem, agent),
    );
    const outputEvent = new RunItemStreamEvent(
      "tool_output",
      new RunToolCallOutputItem(resultRawItem, agent, "result"),
    );

    async function* orderedStream(): AsyncGenerator<RunStreamEvent> {
      yield calledEvent;
      yield outputEvent;
    }

    const mockStreamedResult = {
      [Symbol.asyncIterator]: () => orderedStream()[Symbol.asyncIterator](),
    } as any;

    const forwarded: RunItemStreamEvent[] = [];
    for await (const event of forwardRun(mockStreamedResult)) {
      if (event instanceof RunItemStreamEvent) forwarded.push(event);
    }

    expect(forwarded[0].name).toBe("tool_called");
    expect(forwarded[1].name).toBe("tool_output");
  });
});
