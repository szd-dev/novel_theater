import { describe, test, expect, beforeEach, jest, mock } from "bun:test";

class MockAgent {
  name: string;
  constructor(opts: { name: string }) { this.name = opts.name; }
}

const mockRun = jest.fn();

mock.module("@openai/agents", () => ({
  run: mockRun,
  Agent: MockAgent,
}));

const mockArchivistFactoryCreators = {
  createCharactersAgent: jest.fn(),
  createSceneAgent: jest.fn(),
  createWorldAgent: jest.fn(),
  createPlotAgent: jest.fn(),
  createTimelineAgent: jest.fn(),
  createDebtsAgent: jest.fn(),
};

mock.module("@/agents/archivist/factory", () => mockArchivistFactoryCreators);

import { runScribeAndArchivist } from "@/pipeline/scribe-archivist-phase";

function createMockRunResult(finalOutput: unknown = "test output") {
  return { finalOutput, newItems: [], rawResponses: [] };
}

function createTestAgent(name: string): MockAgent {
  return new MockAgent({ name });
}

beforeEach(() => {
  mockRun.mockReset();
  Object.values(mockArchivistFactoryCreators).forEach((fn) => fn.mockReset());
  mockArchivistFactoryCreators.createCharactersAgent.mockReturnValue(createTestAgent("archivist-characters"));
  mockArchivistFactoryCreators.createSceneAgent.mockReturnValue(createTestAgent("archivist-scene"));
  mockArchivistFactoryCreators.createWorldAgent.mockReturnValue(createTestAgent("archivist-world"));
  mockArchivistFactoryCreators.createPlotAgent.mockReturnValue(createTestAgent("archivist-plot"));
  mockArchivistFactoryCreators.createTimelineAgent.mockReturnValue(createTestAgent("archivist-timeline"));
  mockArchivistFactoryCreators.createDebtsAgent.mockReturnValue(createTestAgent("archivist-debts"));
  mockRun.mockResolvedValue(createMockRunResult("default output"));
});

describe("runScribeAndArchivist", () => {
  test("returns scribeOutput from scribe result", async () => {
    mockRun.mockResolvedValueOnce(createMockRunResult("literary narrative text"));

    const result = await runScribeAndArchivist("narrative summary", "/story");

    expect(result.scribeOutput).toBe("literary narrative text");
    expect(result.archivistDone).toBe(true);
  });

  test("runs scribe with correct parameters", async () => {
    await runScribeAndArchivist("narrative summary", "/story");

    const scribeCall = mockRun.mock.calls[0];
    expect(scribeCall[0].name).toBe("Scribe");
    expect(scribeCall[1]).toBe("narrative summary");
    expect(scribeCall[2]).toEqual({
      context: { storyDir: "/story" },
      maxTurns: 25,
    });
  });

  test("runs archivist characters agent after scribe", async () => {
    await runScribeAndArchivist("narrative summary", "/story");

    const characterCall = mockRun.mock.calls[1];
    expect(characterCall[0].name).toBe("archivist-characters");
    expect(characterCall[1]).toContain("narrative summary");
    expect(characterCall[2]).toEqual({ context: { storyDir: "/story" } });
  });

  test("runs archivist parallel agents (Scene/World/Plot/Timeline) after characters", async () => {
    await runScribeAndArchivist("narrative summary", "/story");

    const callsAfterScribe = mockRun.mock.calls.slice(1);
    const namesAfterScribe = callsAfterScribe.map((c: unknown[]) => (c[0] as MockAgent).name);

    const charIdx = namesAfterScribe.indexOf("archivist-characters");
    const sceneIdx = namesAfterScribe.indexOf("archivist-scene");
    const worldIdx = namesAfterScribe.indexOf("archivist-world");
    const plotIdx = namesAfterScribe.indexOf("archivist-plot");
    const timelineIdx = namesAfterScribe.indexOf("archivist-timeline");

    expect(charIdx).toBe(0);
    expect(sceneIdx).toBeGreaterThan(charIdx);
    expect(worldIdx).toBeGreaterThan(charIdx);
    expect(plotIdx).toBeGreaterThan(charIdx);
    expect(timelineIdx).toBeGreaterThan(charIdx);
  });

  test("runs archivist debts agent after parallel agents", async () => {
    await runScribeAndArchivist("narrative summary", "/story");

    const callsAfterScribe = mockRun.mock.calls.slice(1);
    const namesAfterScribe = callsAfterScribe.map((c: unknown[]) => (c[0] as MockAgent).name);

    const debtsIdx = namesAfterScribe.indexOf("archivist-debts");

    const lastParallelIdx = Math.max(
      namesAfterScribe.indexOf("archivist-scene"),
      namesAfterScribe.indexOf("archivist-world"),
      namesAfterScribe.indexOf("archivist-plot"),
      namesAfterScribe.indexOf("archivist-timeline"),
    );

    expect(debtsIdx).toBeGreaterThan(lastParallelIdx);
  });

  test("runs all 6 archivist agents (characters + 4 parallel + debts)", async () => {
    await runScribeAndArchivist("narrative summary", "/story");

    const callsAfterScribe = mockRun.mock.calls.slice(1);
    const namesAfterScribe = callsAfterScribe.map((c: unknown[]) => (c[0] as MockAgent).name);

    expect(namesAfterScribe).toContain("archivist-characters");
    expect(namesAfterScribe).toContain("archivist-scene");
    expect(namesAfterScribe).toContain("archivist-world");
    expect(namesAfterScribe).toContain("archivist-plot");
    expect(namesAfterScribe).toContain("archivist-timeline");
    expect(namesAfterScribe).toContain("archivist-debts");
    expect(callsAfterScribe).toHaveLength(6);
  });

  test("returns empty scribeOutput when scribe throws, archivist still runs", async () => {
    mockRun
      .mockRejectedValueOnce(new Error("Scribe failed"))
      .mockResolvedValue(createMockRunResult("characters result"))
      .mockResolvedValue(createMockRunResult("scene result"))
      .mockResolvedValue(createMockRunResult("world result"))
      .mockResolvedValue(createMockRunResult("plot result"))
      .mockResolvedValue(createMockRunResult("timeline result"))
      .mockResolvedValue(createMockRunResult("debts result"));

    const result = await runScribeAndArchivist("narrative summary", "/story");

    expect(result.scribeOutput).toBe("");
    expect(result.archivistDone).toBe(true);
    expect(mockRun).toHaveBeenCalledTimes(7);
  });

  test("continues archivist execution even if characters agent fails", async () => {
    mockRun
      .mockResolvedValueOnce(createMockRunResult("scribe output"))
      .mockRejectedValueOnce(new Error("Characters failed"))
      .mockResolvedValue(createMockRunResult("scene result"))
      .mockResolvedValue(createMockRunResult("world result"))
      .mockResolvedValue(createMockRunResult("plot result"))
      .mockResolvedValue(createMockRunResult("timeline result"))
      .mockResolvedValue(createMockRunResult("debts result"));

    const result = await runScribeAndArchivist("narrative summary", "/story");

    expect(result.archivistDone).toBe(true);
    expect(mockRun).toHaveBeenCalledTimes(7);
  });

  test("continues archivist execution even if a parallel agent fails", async () => {
    mockRun
      .mockResolvedValueOnce(createMockRunResult("scribe output"))
      .mockResolvedValueOnce(createMockRunResult("characters result"))
      .mockResolvedValueOnce(createMockRunResult("scene result"))
      .mockRejectedValueOnce(new Error("World failed"))
      .mockResolvedValueOnce(createMockRunResult("plot result"))
      .mockResolvedValueOnce(createMockRunResult("timeline result"))
      .mockResolvedValueOnce(createMockRunResult("debts result"));

    const result = await runScribeAndArchivist("narrative summary", "/story");

    expect(result.archivistDone).toBe(true);
    expect(mockRun).toHaveBeenCalledTimes(7);
  });

  test("continues archivist execution even if debts agent fails", async () => {
    mockRun
      .mockResolvedValueOnce(createMockRunResult("scribe output"))
      .mockResolvedValueOnce(createMockRunResult("characters result"))
      .mockResolvedValueOnce(createMockRunResult("scene result"))
      .mockResolvedValueOnce(createMockRunResult("world result"))
      .mockResolvedValueOnce(createMockRunResult("plot result"))
      .mockResolvedValueOnce(createMockRunResult("timeline result"))
      .mockRejectedValueOnce(new Error("Debts failed"));

    const result = await runScribeAndArchivist("narrative summary", "/story");

    expect(result.archivistDone).toBe(true);
  });

  test("passes narrative summary and literary text to archivist agents", async () => {
    mockRun.mockResolvedValueOnce(createMockRunResult("beautiful literary text"));

    await runScribeAndArchivist("the narrative summary", "/story");

    const charactersCall = mockRun.mock.calls[1];
    const input = charactersCall[1] as string;
    expect(input).toContain("the narrative summary");
    expect(input).toContain("beautiful literary text");
    expect(input).toContain("## 文学文本");
  });

  test("handles null finalOutput from scribe", async () => {
    mockRun.mockResolvedValueOnce(createMockRunResult(null));

    const result = await runScribeAndArchivist("narrative summary", "/story");

    expect(result.scribeOutput).toBe("");
    expect(result.archivistDone).toBe(true);
  });

  test("handles non-Error exceptions from scribe", async () => {
    mockRun.mockRejectedValueOnce("network error");

    const result = await runScribeAndArchivist("narrative summary", "/story");

    expect(result.scribeOutput).toBe("");
    expect(result.archivistDone).toBe(true);
  });
});
