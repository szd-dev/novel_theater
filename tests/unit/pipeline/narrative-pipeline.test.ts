import { describe, test, expect, beforeEach, afterEach, jest, mock } from "bun:test";
import { Agent, RunItemStreamEvent, RunToolCallItem } from "@openai/agents";
import type { RunResult, RunStreamEvent, Session, StreamedRunResult } from "@openai/agents";

import {
  extractScheduleFromResult,
  extractScheduleMeta,
  createSceneStream,
  _setRunFn,
  _resetRunFn,
  _setWithTraceFn,
  _resetWithTraceFn,
} from "@/pipeline/narrative-pipeline";
import { _setRunFn as setCallAgentRunFn, _resetRunFn as resetCallAgentRunFn } from "@/pipeline/call-agent";

type AnyRunResult = RunResult<any, any>;

// --- Mock modules (for filesystem/infrastructure deps) ---

const mockCreateSubSession = jest.fn();
const mockClearInteractionLog = jest.fn();
const mockAppendInteractionLog = jest.fn();
const mockSetupTracing = jest.fn();

mock.module("@/session/manager", () => ({
  createSubSession: mockCreateSubSession,
}));

mock.module("@/store/interaction-log", () => ({
  clearInteractionLog: mockClearInteractionLog,
  appendInteractionLog: mockAppendInteractionLog,
}));

mock.module("@/lib/trace-setup", () => ({
  setupTracing: mockSetupTracing,
}));

// --- Helpers ---

function createTestAgent(name: string) {
  return new Agent({ name });
}

function createMockRunResult(finalOutput: unknown = "test output", newItems: AnyRunResult["newItems"] = []): AnyRunResult {
  return { finalOutput, newItems } as AnyRunResult;
}

function createMockSession(): Session {
  return {} as Session;
}

function createScheduleItems(schedule: Array<{ character: string; direction: string }>, narrativeSummary = "A scene summary") {
  const rawItem = {
    type: "function_call" as const,
    callId: "call-submit-schedule",
    name: "submit_schedule",
    arguments: JSON.stringify({ schedule, narrativeSummary }),
  };
  const agent = createTestAgent("GM");
  return [new RunToolCallItem(rawItem, agent)];
}

function createMockGmStream(
  events: RunStreamEvent[] = [],
  newItems: AnyRunResult["newItems"] = [],
): StreamedRunResult<any, any> {
  let completedResolve!: () => void;
  const completedPromise = new Promise<void>((resolve) => {
    completedResolve = resolve;
  });

  async function* iter(): AsyncGenerator<RunStreamEvent> {
    for (const event of events) {
      yield event;
    }
    completedResolve();
  }

  return {
    [Symbol.asyncIterator]: () => iter()[Symbol.asyncIterator](),
    completed: completedPromise,
    newItems,
    finalOutput: "gm response",
  } as unknown as StreamedRunResult<any, any>;
}

async function collectStreamEvents(gen: AsyncGenerator<RunStreamEvent>): Promise<RunItemStreamEvent[]> {
  const collected: RunItemStreamEvent[] = [];
  for await (const event of gen) {
    if (event instanceof RunItemStreamEvent) {
      collected.push(event);
    }
  }
  return collected;
}

function extractAgentNames(events: RunItemStreamEvent[]): string[] {
  return events
    .filter((e) => e.name === "tool_called")
    .map((e) => (e.item as RunToolCallItem).rawItem.name as string);
}

async function passthroughWithTrace<T>(
  _name: string,
  fn: (trace: { metadata: Record<string, unknown> }) => Promise<T>,
  options?: { metadata?: Record<string, unknown> },
): Promise<T> {
  const trace = { metadata: options?.metadata ?? {} };
  return fn(trace);
}

const pipelineRunMock = jest.fn();
const callAgentRunMock = jest.fn();

beforeEach(() => {
  pipelineRunMock.mockReset();
  callAgentRunMock.mockReset();
  mockCreateSubSession.mockReset();
  mockClearInteractionLog.mockReset();
  mockAppendInteractionLog.mockReset();
  mockSetupTracing.mockReset();

  _setRunFn(pipelineRunMock as any);
  setCallAgentRunFn(callAgentRunMock as any);
  _setWithTraceFn(passthroughWithTrace as any);

  mockCreateSubSession.mockReturnValue({
    session: createMockSession(),
    sessionId: "sub-session-1",
  });
});

afterEach(() => {
  _resetRunFn();
  resetCallAgentRunFn();
  _resetWithTraceFn();
});

// --- extractScheduleFromResult ---

describe("extractScheduleFromResult", () => {
  test("returns null when no submit_schedule tool call", () => {
    const result = createMockRunResult("text", []);
    expect(extractScheduleFromResult(result)).toBeNull();
  });

  test("extracts schedule from submit_schedule tool call", () => {
    const schedule = [
      { character: "林冲", direction: "与鲁智深对话" },
      { character: "鲁智深", direction: "回应林冲" },
    ];
    const items = createScheduleItems(schedule, "林冲与鲁智深相遇");
    const result = createMockRunResult("gm output", items as any);

    const extracted = extractScheduleFromResult(result);
    expect(extracted).not.toBeNull();
    expect(extracted!.schedule).toHaveLength(2);
    expect(extracted!.schedule[0].character).toBe("林冲");
    expect(extracted!.narrativeSummary).toBe("林冲与鲁智深相遇");
  });

  test("returns null when schedule is empty array", () => {
    const rawItem = {
      type: "function_call" as const,
      callId: "call-empty",
      name: "submit_schedule",
      arguments: JSON.stringify({ schedule: [], narrativeSummary: "summary" }),
    };
    const agent = createTestAgent("GM");
    const items = [new RunToolCallItem(rawItem, agent)];
    const result = createMockRunResult("output", items as any);

    expect(extractScheduleFromResult(result)).toBeNull();
  });

  test("returns null when arguments JSON is invalid", () => {
    const rawItem = {
      type: "function_call" as const,
      callId: "call-bad",
      name: "submit_schedule",
      arguments: "not-valid-json",
    };
    const agent = createTestAgent("GM");
    const items = [new RunToolCallItem(rawItem, agent)];
    const result = createMockRunResult("output", items as any);

    expect(extractScheduleFromResult(result)).toBeNull();
  });

  test("ignores other tool calls and finds submit_schedule", () => {
    const otherRawItem = {
      type: "function_call" as const,
      callId: "call-other",
      name: "other_tool",
      arguments: "{}",
    };
    const scheduleRawItem = {
      type: "function_call" as const,
      callId: "call-sched",
      name: "submit_schedule",
      arguments: JSON.stringify({
        schedule: [{ character: "A", direction: "do something" }],
        narrativeSummary: "sum",
      }),
    };
    const agent = createTestAgent("GM");
    const items = [
      new RunToolCallItem(otherRawItem, agent),
      new RunToolCallItem(scheduleRawItem, agent),
    ];
    const result = createMockRunResult("output", items as any);

    const extracted = extractScheduleFromResult(result);
    expect(extracted).not.toBeNull();
    expect(extracted!.schedule).toHaveLength(1);
    expect(extracted!.schedule[0].character).toBe("A");
  });
});

// --- extractScheduleMeta ---

describe("extractScheduleMeta", () => {
  test("returns narrativeSummary from submit_schedule", () => {
    const schedule = [{ character: "A", direction: "act" }];
    const items = createScheduleItems(schedule, "the narrative summary");
    const result = createMockRunResult("output", items as any);

    expect(extractScheduleMeta(result)).toBe("the narrative summary");
  });

  test("returns empty string when no schedule found", () => {
    const result = createMockRunResult("output", []);
    expect(extractScheduleMeta(result)).toBe("");
  });
});

// --- createSceneStream (pipeline flow) ---

describe("createSceneStream", () => {
  const testInput = { input: "林冲遇见鲁智深", projectId: "p1", projectDir: "/data/p1" };
  const testContext = { storyDir: "/data/p1/.novel" };

  test("non-scene request: no schedule → GM events only, no sub-Agent events", async () => {
    const gmStream = createMockGmStream([], []);
    pipelineRunMock.mockResolvedValue(gmStream);

    const events = await collectStreamEvents(
      createSceneStream(testInput, testContext, createMockSession()),
    );

    expect(callAgentRunMock).not.toHaveBeenCalled();
    expect(pipelineRunMock).toHaveBeenCalledTimes(1);
    expect(mockClearInteractionLog).not.toHaveBeenCalled();
  });

  test("scene request: event order is GM → Actor(s) → Scribe → Archivist-Characters → [Scene∥World∥Plot∥Timeline] → Debts", async () => {
    const schedule = [
      { character: "林冲", direction: "与鲁智深对话" },
      { character: "鲁智深", direction: "回应林冲" },
    ];
    const scheduleItems = createScheduleItems(schedule, "林冲与鲁智深相遇");
    const gmStream = createMockGmStream([], scheduleItems as any);
    pipelineRunMock.mockResolvedValue(gmStream);
    callAgentRunMock.mockResolvedValue(createMockRunResult("sub-agent output"));

    const events = await collectStreamEvents(
      createSceneStream(testInput, testContext, createMockSession()),
    );

    const agentNames = extractAgentNames(events);

    // Actors first
    const actorNames = agentNames.filter((n) => n === "Actor");
    expect(actorNames.length).toBeGreaterThanOrEqual(2);

    // Scribe after actors
    const scribeIndex = agentNames.indexOf("Scribe");
    expect(scribeIndex).toBeGreaterThan(actorNames.length - 1);

    // Archivist-Characters after Scribe
    const charIndex = agentNames.indexOf("archivist-characters");
    expect(charIndex).toBeGreaterThan(scribeIndex);

    // Parallel archivists after characters
    const sceneIndex = agentNames.indexOf("archivist-scene");
    const worldIndex = agentNames.indexOf("archivist-world");
    const plotIndex = agentNames.indexOf("archivist-plot");
    const timelineIndex = agentNames.indexOf("archivist-timeline");
    expect(sceneIndex).toBeGreaterThan(charIndex);
    expect(worldIndex).toBeGreaterThan(charIndex);
    expect(plotIndex).toBeGreaterThan(charIndex);
    expect(timelineIndex).toBeGreaterThan(charIndex);

    // Debts after parallel archivists
    const debtsIndex = agentNames.indexOf("archivist-debts");
    expect(debtsIndex).toBeGreaterThan(sceneIndex);
    expect(debtsIndex).toBeGreaterThan(worldIndex);
    expect(debtsIndex).toBeGreaterThan(plotIndex);
    expect(debtsIndex).toBeGreaterThan(timelineIndex);
  });

  test("Actor failure: skip failed step, subsequent continue", async () => {
    const schedule = [
      { character: "A", direction: "act A" },
      { character: "B", direction: "act B" },
      { character: "C", direction: "act C" },
    ];
    const scheduleItems = createScheduleItems(schedule, "summary");
    const gmStream = createMockGmStream([], scheduleItems as any);
    pipelineRunMock.mockResolvedValue(gmStream);

    callAgentRunMock
      .mockRejectedValueOnce(new Error("Actor A failed"))
      .mockResolvedValue(createMockRunResult("output"));

    const events = await collectStreamEvents(
      createSceneStream(testInput, testContext, createMockSession()),
    );

    const agentNames = extractAgentNames(events);
    const actorNames = agentNames.filter((n) => n === "Actor");
    expect(actorNames).toHaveLength(2);

    expect(agentNames).toContain("Scribe");
    expect(agentNames).toContain("archivist-characters");
  });

  test("Session reuse: same character appearing multiple times uses same session", async () => {
    const schedule = [
      { character: "林冲", direction: "第一幕" },
      { character: "鲁智深", direction: "回应" },
      { character: "林冲", direction: "第二幕" },
    ];
    const scheduleItems = createScheduleItems(schedule, "summary");
    const gmStream = createMockGmStream([], scheduleItems as any);
    pipelineRunMock.mockResolvedValue(gmStream);

    const sessionA = createMockSession();
    const sessionB = createMockSession();
    mockCreateSubSession
      .mockReturnValueOnce({ session: sessionA, sessionId: "s-a" })
      .mockReturnValueOnce({ session: sessionB, sessionId: "s-b" });

    callAgentRunMock.mockResolvedValue(createMockRunResult("output"));

    await collectStreamEvents(
      createSceneStream(testInput, testContext, createMockSession()),
    );

    expect(mockCreateSubSession).toHaveBeenCalledTimes(2);

    expect(mockCreateSubSession.mock.calls[0][2]).toBe("Actor");
    expect(mockCreateSubSession.mock.calls[0][3]).toBe("林冲");
    expect(mockCreateSubSession.mock.calls[1][2]).toBe("Actor");
    expect(mockCreateSubSession.mock.calls[1][3]).toBe("鲁智深");

    const actorCalls = callAgentRunMock.mock.calls.filter(
      (call: any[]) => call[0]?.name === "Actor",
    );
    expect(actorCalls).toHaveLength(3);
    expect((actorCalls[0][2] as any).session).toBe(sessionA);
    expect((actorCalls[1][2] as any).session).toBe(sessionB);
    expect((actorCalls[2][2] as any).session).toBe(sessionA);
  });

  test("withTrace wraps Pipeline, metadata includes projectId + storyDir", async () => {
    let capturedMetadata: Record<string, unknown> | undefined;

    async function capturingWithTrace<T>(
      _name: string,
      fn: (trace: { metadata: Record<string, unknown> }) => Promise<T>,
      options?: { metadata?: Record<string, unknown> },
    ): Promise<T> {
      capturedMetadata = options?.metadata;
      const trace = { metadata: options?.metadata ?? {} };
      const result = await fn(trace);
      return result;
    }

    _setWithTraceFn(capturingWithTrace as any);

    const gmStream = createMockGmStream([], []);
    pipelineRunMock.mockResolvedValue(gmStream);

    await collectStreamEvents(
      createSceneStream(
        { input: "hello", projectId: "test-project", projectDir: "/data/test" },
        { storyDir: "/data/test/.novel" },
        createMockSession(),
      ),
    );

    expect(capturedMetadata).toEqual({
      projectId: "test-project",
      storyDir: "/data/test/.novel",
    });
    expect(mockSetupTracing).toHaveBeenCalled();
  });

  test("clearInteractionLog called at start and end of Enact phase", async () => {
    const schedule = [{ character: "A", direction: "act" }];
    const scheduleItems = createScheduleItems(schedule, "summary");
    const gmStream = createMockGmStream([], scheduleItems as any);
    pipelineRunMock.mockResolvedValue(gmStream);
    callAgentRunMock.mockResolvedValue(createMockRunResult("output"));

    await collectStreamEvents(
      createSceneStream(testInput, testContext, createMockSession()),
    );

    expect(mockClearInteractionLog).toHaveBeenCalledTimes(2);
    expect(mockClearInteractionLog).toHaveBeenCalledWith("/data/p1/.novel");
  });

  test("appendInteractionLog called for each successful Actor", async () => {
    const schedule = [
      { character: "A", direction: "act A" },
      { character: "B", direction: "act B" },
    ];
    const scheduleItems = createScheduleItems(schedule, "summary");
    const gmStream = createMockGmStream([], scheduleItems as any);
    pipelineRunMock.mockResolvedValue(gmStream);

    callAgentRunMock
      .mockResolvedValueOnce(createMockRunResult("A dialogue"))
      .mockResolvedValueOnce(createMockRunResult("B dialogue"));

    await collectStreamEvents(
      createSceneStream(testInput, testContext, createMockSession()),
    );

    expect(mockAppendInteractionLog).toHaveBeenCalledTimes(2);
    expect(mockAppendInteractionLog).toHaveBeenCalledWith("/data/p1/.novel", "A", "A dialogue");
    expect(mockAppendInteractionLog).toHaveBeenCalledWith("/data/p1/.novel", "B", "B dialogue");
  });

  test("appendInteractionLog not called on Actor failure", async () => {
    const schedule = [
      { character: "A", direction: "act A" },
      { character: "B", direction: "act B" },
    ];
    const scheduleItems = createScheduleItems(schedule, "summary");
    const gmStream = createMockGmStream([], scheduleItems as any);
    pipelineRunMock.mockResolvedValue(gmStream);

    callAgentRunMock
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(createMockRunResult("B output"));

    await collectStreamEvents(
      createSceneStream(testInput, testContext, createMockSession()),
    );

    expect(mockAppendInteractionLog).toHaveBeenCalledTimes(1);
    expect(mockAppendInteractionLog).toHaveBeenCalledWith("/data/p1/.novel", "B", "B output");
  });

  test("Archivist DAG: Characters before parallel, Debts after parallel", async () => {
    const schedule = [{ character: "A", direction: "act" }];
    const scheduleItems = createScheduleItems(schedule, "narrative summary");
    const gmStream = createMockGmStream([], scheduleItems as any);
    pipelineRunMock.mockResolvedValue(gmStream);
    callAgentRunMock.mockResolvedValue(createMockRunResult("output"));

    await collectStreamEvents(
      createSceneStream(testInput, testContext, createMockSession()),
    );

    const agentCallNames = callAgentRunMock.mock.calls.map(
      (call: any[]) => call[0]?.name,
    );

    const charIdx = agentCallNames.indexOf("archivist-characters");
    const sceneIdx = agentCallNames.indexOf("archivist-scene");
    const debtsIdx = agentCallNames.indexOf("archivist-debts");

    expect(charIdx).toBeLessThan(sceneIdx);
    expect(debtsIdx).toBeGreaterThan(charIdx);
  });
});
