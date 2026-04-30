import { describe, test, expect } from "bun:test";
import {
  createCharactersAgent,
  createSceneAgent,
  createWorldAgent,
  createPlotAgent,
  createTimelineAgent,
  createDebtsAgent,
} from "@/agents/archivist/factory";

const STORY_DIR = "/tmp/test-novel";

describe("Archivist sub-Agent factories", () => {
  test("createCharactersAgent returns agent with correct name", () => {
    const agent = createCharactersAgent(STORY_DIR);
    expect(agent.name).toBe("archivist-characters");
  });

  test("createCharactersAgent has 6 tools", () => {
    const agent = createCharactersAgent(STORY_DIR);
    expect(agent.tools).toHaveLength(6);
  });

  test("createCharactersAgent includes character-specific tools", () => {
    const agent = createCharactersAgent(STORY_DIR);
    const toolNames = (agent.tools as Array<{ name: string }>).map((t) => t.name);
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("write_file");
    expect(toolNames).toContain("edit_file");
    expect(toolNames).toContain("glob_files");
    expect(toolNames).toContain("resolve_character");
    expect(toolNames).toContain("list_characters");
  });

  test("createSceneAgent returns agent with correct name", () => {
    const agent = createSceneAgent(STORY_DIR);
    expect(agent.name).toBe("archivist-scene");
  });

  test("createSceneAgent has 3 tools", () => {
    const agent = createSceneAgent(STORY_DIR);
    expect(agent.tools).toHaveLength(3);
  });

  test("createSceneAgent includes base tools only", () => {
    const agent = createSceneAgent(STORY_DIR);
    const toolNames = (agent.tools as Array<{ name: string }>).map((t) => t.name);
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("edit_file");
    expect(toolNames).toContain("glob_files");
  });

  test("createWorldAgent returns agent with correct name and 3 tools", () => {
    const agent = createWorldAgent(STORY_DIR);
    expect(agent.name).toBe("archivist-world");
    expect(agent.tools).toHaveLength(3);
  });

  test("createPlotAgent returns agent with correct name and 3 tools", () => {
    const agent = createPlotAgent(STORY_DIR);
    expect(agent.name).toBe("archivist-plot");
    expect(agent.tools).toHaveLength(3);
  });

  test("createTimelineAgent returns agent with correct name and 3 tools", () => {
    const agent = createTimelineAgent(STORY_DIR);
    expect(agent.name).toBe("archivist-timeline");
    expect(agent.tools).toHaveLength(3);
  });

  test("createDebtsAgent returns agent with correct name and 3 tools", () => {
    const agent = createDebtsAgent(STORY_DIR);
    expect(agent.name).toBe("archivist-debts");
    expect(agent.tools).toHaveLength(3);
  });

  test("all non-characters agents have base tools only (no write_file, no character tools)", () => {
    for (const createFn of [createSceneAgent, createWorldAgent, createPlotAgent, createTimelineAgent, createDebtsAgent]) {
      const agent = createFn(STORY_DIR);
      const toolNames = (agent.tools as Array<{ name: string }>).map((t) => t.name);
      expect(toolNames).toContain("read_file");
      expect(toolNames).toContain("edit_file");
      expect(toolNames).toContain("glob_files");
      expect(toolNames).not.toContain("write_file");
      expect(toolNames).not.toContain("resolve_character");
      expect(toolNames).not.toContain("list_characters");
    }
  });
});
