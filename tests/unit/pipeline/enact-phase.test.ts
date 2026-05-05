import { describe, test, expect, beforeEach, jest, mock } from "bun:test";

class MockAgent {
  name: string;
  constructor(opts: { name: string }) { this.name = opts.name; }
}

const mockRun = jest.fn();
const mockCreateSubSession = jest.fn();
const mockClearInteractionLog = jest.fn();
const mockAppendInteractionLog = jest.fn();

mock.module("@openai/agents", () => ({
  run: mockRun,
  Agent: MockAgent,
}));

mock.module("@/session/manager", () => ({
  createSubSession: mockCreateSubSession,
}));

mock.module("@/store/interaction-log", () => ({
  clearInteractionLog: mockClearInteractionLog,
  appendInteractionLog: mockAppendInteractionLog,
}));

import { runEnactPhase } from "@/pipeline/enact-phase";
import type { ScheduleStep } from "@/pipeline/enact-phase";

function createMockSession(): Record<string, unknown> {
  return {};
}

function createMockRunResult(finalOutput: unknown = "test output") {
  return { finalOutput, newItems: [], rawResponses: [] };
}

beforeEach(() => {
  mockRun.mockReset();
  mockCreateSubSession.mockReset();
  mockClearInteractionLog.mockReset();
  mockAppendInteractionLog.mockReset();

  mockCreateSubSession.mockReturnValue({
    session: createMockSession(),
    sessionId: "sub-session-1",
  });
});

describe("runEnactPhase", () => {
  test("returns steps with success status for each schedule item", async () => {
    const schedule: ScheduleStep[] = [
      { character: "林冲", direction: "与鲁智深对话" },
      { character: "鲁智深", direction: "回应林冲" },
    ];

    mockRun.mockResolvedValue(createMockRunResult("actor output"));

    const result = await runEnactPhase(schedule, "/story", "p1", "/project");

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toEqual({ character: "林冲", status: "success" });
    expect(result.steps[1]).toEqual({ character: "鲁智深", status: "success" });
  });

  test("calls run with the correct agent, input, context, session, and maxTurns", async () => {
    const schedule: ScheduleStep[] = [
      { character: "林冲", direction: "与鲁智深对话" },
    ];

    mockRun.mockResolvedValue(createMockRunResult("output"));

    await runEnactPhase(schedule, "/story", "p1", "/project");

    expect(mockRun).toHaveBeenCalledTimes(1);
    const agentArg = mockRun.mock.calls[0][0];
    const inputArg = mockRun.mock.calls[0][1];
    const optsArg = mockRun.mock.calls[0][2];

    expect(agentArg.name).toBe("Actor");
    expect(inputArg).toBe("林冲: 与鲁智深对话");
    expect(optsArg.context).toEqual({ storyDir: "/story", characterName: "林冲" });
    expect(optsArg.session).toBeDefined();
    expect(optsArg.maxTurns).toBe(10);
  });

  test("clears interaction log at start", async () => {
    mockRun.mockResolvedValue(createMockRunResult("output"));

    await runEnactPhase(
      [{ character: "A", direction: "act" }],
      "/story",
      "p1",
      "/project",
    );

    expect(mockClearInteractionLog).toHaveBeenCalledTimes(1);
    expect(mockClearInteractionLog).toHaveBeenCalledWith("/story");
  });

  test("appends interaction log for each successful actor", async () => {
    const schedule: ScheduleStep[] = [
      { character: "A", direction: "act A" },
      { character: "B", direction: "act B" },
    ];

    mockRun
      .mockResolvedValueOnce(createMockRunResult("A dialogue"))
      .mockResolvedValueOnce(createMockRunResult("B dialogue"));

    await runEnactPhase(schedule, "/story", "p1", "/project");

    expect(mockAppendInteractionLog).toHaveBeenCalledTimes(2);
    expect(mockAppendInteractionLog).toHaveBeenCalledWith("/story", "A", "A dialogue");
    expect(mockAppendInteractionLog).toHaveBeenCalledWith("/story", "B", "B dialogue");
  });

  test("handles appendInteractionLog failure gracefully", async () => {
    mockRun.mockResolvedValue(createMockRunResult("output"));
    mockAppendInteractionLog.mockImplementation(() => {
      throw new Error("disk full");
    });

    const result = await runEnactPhase(
      [{ character: "A", direction: "act" }],
      "/story",
      "p1",
      "/project",
    );

    expect(result.steps[0].status).toBe("success");
  });

  test("marks error status when run throws, continues to next actor", async () => {
    const schedule: ScheduleStep[] = [
      { character: "A", direction: "act A" },
      { character: "B", direction: "act B" },
      { character: "C", direction: "act C" },
    ];

    mockRun
      .mockRejectedValueOnce(new Error("Actor A failed"))
      .mockResolvedValueOnce(createMockRunResult("B output"))
      .mockResolvedValueOnce(createMockRunResult("C output"));

    const result = await runEnactPhase(schedule, "/story", "p1", "/project");

    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]).toEqual({
      character: "A",
      status: "error",
      error: "Actor A failed",
    });
    expect(result.steps[1]).toEqual({ character: "B", status: "success" });
    expect(result.steps[2]).toEqual({ character: "C", status: "success" });

    expect(mockRun).toHaveBeenCalledTimes(3);
  });

  test("does not append interaction log for failed actor", async () => {
    const schedule: ScheduleStep[] = [
      { character: "A", direction: "act A" },
      { character: "B", direction: "act B" },
    ];

    mockRun
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(createMockRunResult("B output"));

    await runEnactPhase(schedule, "/story", "p1", "/project");

    expect(mockAppendInteractionLog).toHaveBeenCalledTimes(1);
    expect(mockAppendInteractionLog).toHaveBeenCalledWith("/story", "B", "B output");
  });

  test("reuses session for same character appearing multiple times", async () => {
    const schedule: ScheduleStep[] = [
      { character: "林冲", direction: "第一幕" },
      { character: "鲁智深", direction: "回应" },
      { character: "林冲", direction: "第二幕" },
    ];

    mockRun.mockResolvedValue(createMockRunResult("output"));

    const sessionA = createMockSession();
    const sessionB = createMockSession();
    mockCreateSubSession
      .mockReturnValueOnce({ session: sessionA, sessionId: "s-a" })
      .mockReturnValueOnce({ session: sessionB, sessionId: "s-b" });

    await runEnactPhase(schedule, "/story", "p1", "/project");

    expect(mockCreateSubSession).toHaveBeenCalledTimes(2);

    expect(mockCreateSubSession.mock.calls[0][2]).toBe("Actor");
    expect(mockCreateSubSession.mock.calls[0][3]).toBe("林冲");
    expect(mockCreateSubSession.mock.calls[1][2]).toBe("Actor");
    expect(mockCreateSubSession.mock.calls[1][3]).toBe("鲁智深");

    expect(mockRun).toHaveBeenCalledTimes(3);
    expect((mockRun.mock.calls[0][2] as Record<string, unknown>).session).toBe(sessionA);
    expect((mockRun.mock.calls[1][2] as Record<string, unknown>).session).toBe(sessionB);
    expect((mockRun.mock.calls[2][2] as Record<string, unknown>).session).toBe(sessionA);
  });

  test("handles empty schedule gracefully", async () => {
    const result = await runEnactPhase([], "/story", "p1", "/project");

    expect(result.steps).toHaveLength(0);
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockClearInteractionLog).toHaveBeenCalledWith("/story");
  });

  test("returns interactionLog as empty string", async () => {
    mockRun.mockResolvedValue(createMockRunResult("output"));

    const result = await runEnactPhase(
      [{ character: "A", direction: "act" }],
      "/story",
      "p1",
      "/project",
    );

    expect(result.interactionLog).toBe("");
  });

  test("handles null finalOutput from actor", async () => {
    mockRun.mockResolvedValue(createMockRunResult(null));

    const result = await runEnactPhase(
      [{ character: "A", direction: "act" }],
      "/story",
      "p1",
      "/project",
    );

    expect(result.steps[0].status).toBe("success");
    expect(mockAppendInteractionLog).toHaveBeenCalledWith("/story", "A", "");
  });

  test("handles non-Error exceptions", async () => {
    mockRun.mockRejectedValue("string error");

    const result = await runEnactPhase(
      [{ character: "A", direction: "act" }],
      "/story",
      "p1",
      "/project",
    );

    expect(result.steps[0].status).toBe("error");
    expect(result.steps[0].error).toBe("string error");
  });
});
