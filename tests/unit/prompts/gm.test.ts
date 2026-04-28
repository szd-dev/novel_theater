import { describe, test, expect } from "bun:test";
import { getGMPrompt } from "@/prompts/gm";
import { getActorPrompt } from "@/prompts/actor";
import { getScribePrompt } from "@/prompts/scribe";
import { getArchivistPrompt } from "@/prompts/archivist";
import type {
  GMPromptState,
  ActorPromptState,
  ScribePromptState,
  ArchivistPromptState,
} from "@/prompts/types";

const FORBIDDEN_PATTERNS = [
  /task\(/,
  /task_id/,
  /Command\(/,
  /LangGraph/,
  /state\.interactionLog/,
  /state\.characterFile/,
];

function checkNoForbiddenPatterns(output: string, label: string) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(pattern.test(output)).toBe(false);
  }
}

describe("getGMPrompt", () => {
  test("returns a string containing core prompt sections", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(100);
    expect(result).toContain("自由剧场 GM");
    expect(result).toContain("核心职责");
    expect(result).toContain("场景生命周期");
  });

  test("includes state block when provided", () => {
    const state: GMPromptState = {
      currentSceneId: "s001",
      currentLocation: "旧酒馆",
      currentTime: "秋夜",
      activeCharacter: "测试角色",
    };
    const result = getGMPrompt(state);
    expect(result).toContain("s001");
    expect(result).toContain("旧酒馆");
    expect(result).toContain("秋夜");
    expect(result).toContain("测试角色");
  });

  test("includes story context when provided", () => {
    const state: GMPromptState = {
      storyContext: "角色在酒馆中",
    };
    const result = getGMPrompt(state);
    expect(result).toContain("角色在酒馆中");
  });

  test("no forbidden patterns", () => {
    const state: GMPromptState = {
      currentSceneId: "s001",
      storyContext: "测试上下文",
    };
    const result = getGMPrompt(state);
    checkNoForbiddenPatterns(result, "GM");
  });

  test("includes tool descriptions (call_actor, call_scribe, call_archivist)", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).toContain("call_actor");
    expect(result).toContain("call_scribe");
    expect(result).toContain("call_archivist");
  });

  test("no LangGraph references", () => {
    const state: GMPromptState = { storyContext: "测试" };
    const result = getGMPrompt(state);
    expect(result).not.toMatch(/Command\(/);
    expect(result).not.toMatch(/LangGraph/);
    expect(result).not.toMatch(/checkpointing/);
  });

  test("accepts verbosity config without error (verbosity tiers unified)", () => {
    const state: GMPromptState = {};
    const normal = getGMPrompt(state, { verbosity: "normal" });
    const detailed = getGMPrompt(state, { verbosity: "detailed" });
    const minimal = getGMPrompt(state, { verbosity: "minimal" });
    // Verbosity no longer affects output — all tiers produce the same prompt
    expect(normal).toEqual(detailed);
    expect(normal).toEqual(minimal);
  });
});

describe("getActorPrompt", () => {
  test("includes character name", () => {
    const state: ActorPromptState = {};
    const result = getActorPrompt("艾蕾雅", state);
    expect(result).toContain("艾蕾雅");
    expect(result).toContain("自由剧场 Actor");
  });

  test("includes character file when provided", () => {
    const state: ActorPromptState = {
      characterFile: "# 艾蕾雅\n> 公主",
    };
    const result = getActorPrompt("艾蕾雅", state);
    expect(result).toContain("# 艾蕾雅");
    expect(result).toContain("> 公主");
  });

  test("no forbidden patterns", () => {
    const state: ActorPromptState = {
      characterFile: "内容",
    };
    const result = getActorPrompt("角色", state);
    checkNoForbiddenPatterns(result, "Actor");
  });
});

describe("getScribePrompt", () => {
  test("includes style guide when provided", () => {
    const state: ScribePromptState = {
      styleGuide: "古风叙事，第三人称",
    };
    const result = getScribePrompt(state);
    expect(result).toContain("古风叙事，第三人称");
    expect(result).toContain("自由剧场 Scribe");
  });

  test("no forbidden patterns", () => {
    const state: ScribePromptState = {
      styleGuide: "风格",
    };
    const result = getScribePrompt(state);
    checkNoForbiddenPatterns(result, "Scribe");
  });
});

describe("getArchivistPrompt", () => {
  test("includes narrative summary when provided", () => {
    const state: ArchivistPromptState = {
      narrativeSummary: "场景中发生了重大事件",
    };
    const result = getArchivistPrompt(state);
    expect(result).toContain("场景中发生了重大事件");
    expect(result).toContain("自由剧场 Archivist");
  });

  test("includes literary text when provided", () => {
    const state: ArchivistPromptState = {
      literaryText: "月光洒在城堡上",
    };
    const result = getArchivistPrompt(state);
    expect(result).toContain("月光洒在城堡上");
  });

  test("no forbidden patterns", () => {
    const state: ArchivistPromptState = {
      narrativeSummary: "摘要",
      literaryText: "文本",
    };
    const result = getArchivistPrompt(state);
    checkNoForbiddenPatterns(result, "Archivist");
  });
});
