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
    expect(result).toContain("场景骨架");
  });

  test("includes state block when provided", () => {
    const state: GMPromptState = {
      storyContext: "角色在酒馆中，场景s001",
    };
    const result = getGMPrompt(state);
    expect(result).toContain("角色在酒馆中，场景s001");
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

  test("includes new four-stage flow names", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).toContain("准备（Orient）");
    expect(result).toContain("场景编写（Script）");
    expect(result).toContain("演绎循环（Enact）");
    expect(result).toContain("收束（Resolve）");
  });

  test("does not contain old stage names", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).not.toContain("角色发现");
    expect(result).not.toContain("场景编排");
    expect(result).not.toContain("分步演绎");
    expect(result).not.toContain("后处理");
  });

  test("includes 初始剧本 specification", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).toContain("初始剧本");
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
  test("includes core archivist identity", () => {
    const state: ArchivistPromptState = {};
    const result = getArchivistPrompt(state);
    expect(result).toContain("自由剧场 Archivist");
    expect(result).toContain("edit_file");
  });

  test("includes story context when provided", () => {
    const state: ArchivistPromptState = {
      storyContext: "场景总数: 3，当前场景: s004",
    };
    const result = getArchivistPrompt(state);
    expect(result).toContain("场景总数: 3，当前场景: s004");
  });

  test("no forbidden patterns", () => {
    const state: ArchivistPromptState = {};
    const result = getArchivistPrompt(state);
    checkNoForbiddenPatterns(result, "Archivist");
  });
});
