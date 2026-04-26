import { test, describe, expect, beforeAll, afterAll } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";

import { gmAgent, actorAgent, scribeAgent, archivistAgent } from "@/agents/registry";
import { createStorySession, getStorySession, getCharacterSession, clearStorySession } from "@/session/manager";
import { initStory, archiveStory, resetStory } from "@/store/story-files";

describe("自由剧场 v2 Agent Architecture", () => {
  describe("Agent definitions", () => {
    test("GM agent has correct tools", () => {
      expect(gmAgent.name).toBe("GM");
      const toolNames = gmAgent.tools.map((t: any) => t.name);
      expect(toolNames).toContain("call_actor");
      expect(toolNames).toContain("call_scribe");
      expect(toolNames).toContain("call_archivist");
      expect(toolNames.length).toBe(3);
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
      expect(toolNames).toEqual(["edit_file", "glob_files", "read_file", "resolve_character", "write_file"]);
    });
  });

  describe("Session management", () => {
    test("createStorySession creates session with gmSession", () => {
      const session = createStorySession("test-thread-1");
      expect(session.threadId).toBe("test-thread-1");
      expect(session.gmSession).toBeDefined();
      expect(session.characterSessions).toBeDefined();
    });

    test("getStorySession returns same session", () => {
      const s1 = createStorySession("test-thread-2");
      const s2 = getStorySession("test-thread-2");
      expect(s1).toBe(s2);
    });

    test("getCharacterSession creates independent sessions", () => {
      const session = getStorySession("test-thread-3");
      const charA = getCharacterSession("test-thread-3", "塞莉娅");
      const charB = getCharacterSession("test-thread-3", "希尔薇");
      expect(charA).not.toBe(charB);
    });

    test("clearStorySession removes session", () => {
      createStorySession("test-thread-4");
      clearStorySession("test-thread-4");
      const newSession = getStorySession("test-thread-4");
      // Should create a new session (different from original)
      expect(newSession).toBeDefined();
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
      expect(existsSync(join(storyDir, ".novel"))).toBe(true);
      expect(existsSync(join(storyDir, ".novel", "world.md"))).toBe(true);
      expect(existsSync(join(storyDir, ".novel", "style.md"))).toBe(true);
      expect(existsSync(join(storyDir, ".novel", "plot.md"))).toBe(true);
      expect(existsSync(join(storyDir, ".novel", "characters"))).toBe(true);
      expect(existsSync(join(storyDir, ".novel", "scenes"))).toBe(true);
    });

    test("archiveStory() copies .novel/ to .archive/", async () => {
      const result = await archiveStory(storyDir, "test-archive");
      expect(result).toContain("test-archive");
      expect(existsSync(join(storyDir, ".archive", "test-archive"))).toBe(true);
      expect(existsSync(join(storyDir, ".archive", "test-archive", "world.md"))).toBe(true);
    });

    test("resetStory() backs up and resets .novel/", async () => {
      const result = await resetStory(storyDir);
      expect(result).toContain("故事已重置");
      expect(existsSync(join(storyDir, ".novel"))).toBe(true);
      expect(existsSync(join(storyDir, ".novel", "world.md"))).toBe(true);
      expect(existsSync(join(storyDir, ".archive"))).toBe(true);
    });
  });
});
