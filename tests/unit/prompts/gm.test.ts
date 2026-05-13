import { describe, test, expect } from "bun:test";
import { getGMPrompt } from "@/prompts/gm";
import { getActorPrompt } from "@/prompts/actor";
import { getScribePrompt } from "@/prompts/scribe";
import type {
  GMPromptState,
  ActorPromptState,
  ScribePromptState,
} from "@/prompts/types";

const FORBIDDEN_PATTERNS = [
  /task\(/,
  /task_id/,
  /Command\(/,
  /LangGraph/,
  /state\.interactionLog/,
  /state\.characterFile/,
];

function checkNoForbiddenPatterns(output: string, _label: string) {
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

  test("no story context in prompt (moved to user messages)", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).not.toContain("## 故事上下文");
  });

  test("no forbidden patterns", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    checkNoForbiddenPatterns(result, "GM");
  });

  test("includes submit_schedule tool description", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).toContain("submit_schedule");
    expect(result).toContain("schedule");
    expect(result).toContain("narrativeSummary");
  });

  test("does not contain removed tool names", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).not.toContain("enact_sequence");
    expect(result).not.toContain("call_scribe");
    expect(result).not.toContain("call_archivist");
    expect(result).not.toContain("call_actor");
    expect(result).not.toContain("clear_interaction_log");
  });

  test("states GM only does Orient + Script + Submit", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).toContain("submit_schedule");
    expect(result).toContain("后续由系统自动执行");
  });

  test("no LangGraph references", () => {
    const state: GMPromptState = {};
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
    expect(normal).toEqual(detailed);
    expect(normal).toEqual(minimal);
  });

  test("includes three-stage flow names (Orient + Script + Submit)", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).toContain("准备（Orient）");
    expect(result).toContain("场景编写（Script）");
    expect(result).toContain("提交调度（Submit）");
  });

  test("does not contain removed stage names (Enact, Resolve)", () => {
    const state: GMPromptState = {};
    const result = getGMPrompt(state);
    expect(result).not.toContain("演绎调度（Enact）");
    expect(result).not.toContain("收束（Resolve）");
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

  test("no character file in prompt (moved to user messages)", () => {
    const state: ActorPromptState = {};
    const result = getActorPrompt("艾蕾雅", state);
    expect(result).not.toContain("## 角色文件");
    expect(result).not.toContain("## 故事上下文");
  });

  test("no forbidden patterns", () => {
    const state: ActorPromptState = {};
    const result = getActorPrompt("角色", state);
    checkNoForbiddenPatterns(result, "Actor");
  });
});

describe("getScribePrompt", () => {
  test("no style guide in prompt (moved to user messages)", () => {
    const state: ScribePromptState = {};
    const result = getScribePrompt(state);
    expect(result).not.toContain("## 风格指南");
    expect(result).not.toContain("## 故事上下文");
    expect(result).toContain("自由剧场 Scribe");
  });

  test("no forbidden patterns", () => {
    const state: ScribePromptState = {};
    const result = getScribePrompt(state);
    checkNoForbiddenPatterns(result, "Scribe");
  });
});
