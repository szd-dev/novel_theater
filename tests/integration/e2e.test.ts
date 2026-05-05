import { test, describe, expect, beforeAll, afterAll } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";

import { gmAgent, actorAgent, scribeAgent } from "@/agents/registry";
import { archivistAgent } from "@/agents/archivist";
import { createStorySession, getStorySession, getOrCreateStorySession, clearStorySession } from "@/session/manager";
import { initStory, archiveStory, resetStory } from "@/store/story-files";

describe("自由剧场 v2 Agent Architecture", () => {
  describe("Agent definitions", () => {
    test("GM agent has correct tools", () => {
      expect(gmAgent.name).toBe("GM");
      const toolNames = gmAgent.tools.map((t: any) => t.name);
      expect(toolNames).toContain("submit_schedule");
      expect(toolNames).toContain("read_file");
      expect(toolNames).toContain("write_file");
      expect(toolNames).toContain("glob_files");
      expect(toolNames.length).toBe(4);
    });

    test("Actor agent has correct tools", () => {
      expect(actorAgent.name).toBe("Actor");
      const toolNames = actorAgent.tools.map((t: any) => t.name);
      expect(toolNames).toContain("resolve_character");
      expect(toolNames).toContain("read_file");
    });

    test("Scribe agent has correct tools", () => {
      expect(scribeAgent.name).toBe("Scribe");
      const toolNames = scribeAgent.tools.map((t: any) => t.name);
      expect(toolNames).toContain("read_file");
    });

    test("Archivist agent has correct tools", () => {
      expect(archivistAgent.name).toBe("Archivist");
      const toolNames = archivistAgent.tools.map((t: any) => t.name).sort();
      expect(toolNames).toEqual(["edit_file", "glob_files", "list_characters", "read_file", "resolve_character", "write_file"]);
    });
  });

  describe("Session management", () => {
    const testDir = join(tmpdir(), `novel-session-test-${Date.now()}`);

    test("createStorySession creates session with gmSession", () => {
      const session = createStorySession("test-thread-1", testDir);
      expect(session.projectId).toBe("test-thread-1");
      expect(session.gmSession).toBeDefined();
      expect(session.subSessions).toBeDefined();
    });

    test("getOrCreateStorySession returns same session", () => {
      const s1 = createStorySession("test-thread-2", testDir);
      const s2 = getOrCreateStorySession("test-thread-2", testDir);
      expect(s1).toBe(s2);
    });

    test("getStorySession returns undefined when not found", () => {
      const session = getStorySession("nonexistent");
      expect(session).toBeUndefined();
    });

    test("clearStorySession removes session", () => {
      createStorySession("test-thread-4", testDir);
      clearStorySession("test-thread-4", testDir);
      const removed = getStorySession("test-thread-4");
      expect(removed).toBeUndefined();
    });
  });

  describe("Story management APIs", () => {
    let storyDir: string;

    beforeAll(() => {
      storyDir = join(
        tmpdir(),
        `novel-story-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    });

    afterAll(() => {
      if (storyDir && existsSync(storyDir)) {
        rmSync(storyDir, { recursive: true, force: true });
      }
    });

    test("initStory() creates .novel/ directory with templates", async () => {
      const result = await initStory(storyDir);
      expect(result).toContain("Story initialized");
      expect(existsSync(storyDir)).toBe(true);
      expect(existsSync(join(storyDir, "world.md"))).toBe(true);
      expect(existsSync(join(storyDir, "style.md"))).toBe(true);
      expect(existsSync(join(storyDir, "plot.md"))).toBe(true);
      expect(existsSync(join(storyDir, "characters"))).toBe(true);
      expect(existsSync(join(storyDir, "scenes"))).toBe(true);
    });

    test("archiveStory() copies .novel/ to .archive/", async () => {
      const result = await archiveStory(storyDir, "test-archive");
      expect(result).toContain("test-archive");
      expect(existsSync(join(storyDir, "..", ".archive", "test-archive"))).toBe(true);
      expect(existsSync(join(storyDir, "..", ".archive", "test-archive", "world.md"))).toBe(true);
    });

    test("resetStory() backs up and resets .novel/", async () => {
      const result = await resetStory(storyDir);
      expect(result).toContain("故事已重置");
      expect(existsSync(storyDir)).toBe(true);
      expect(existsSync(join(storyDir, "world.md"))).toBe(true);
      expect(existsSync(join(storyDir, "..", ".archive"))).toBe(true);
    });
  });
});
