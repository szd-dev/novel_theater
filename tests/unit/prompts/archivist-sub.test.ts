import { describe, test, expect } from "bun:test";
import { getArchivistSubPrompt } from "@/prompts/archivist-sub";
import { RESPONSIBILITIES } from "@/agents/archivist/types";
import type { ArchivistResponsibility } from "@/agents/archivist/types";
import type { ArchivistPromptState } from "@/prompts/types";

const COMMON_MARKERS = [
  "你是自由剧场的场记员",
  "叙事摘要",
  "文学文本",
  "只记录，不创造信息",
];

const STATE: ArchivistPromptState = {
  storyContext: "场景总数: 1，当前场景: s001",
};

describe("getArchivistSubPrompt", () => {
  test("returns a non-empty string for each responsibility", () => {
    for (const resp of RESPONSIBILITIES) {
      const result = getArchivistSubPrompt(resp, STATE);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(50);
    }
  });

  test("contains common markers for each responsibility", () => {
    for (const resp of RESPONSIBILITIES) {
      const result = getArchivistSubPrompt(resp, STATE);
      for (const marker of COMMON_MARKERS) {
        expect(result).toContain(marker);
      }
    }
  });

  test("includes story context when provided", () => {
    for (const resp of RESPONSIBILITIES) {
      const result = getArchivistSubPrompt(resp, STATE);
      expect(result).toContain("场景总数: 1，当前场景: s001");
    }
  });

  test("characters prompt contains dedup workflow and memory format", () => {
    const result = getArchivistSubPrompt("characters", STATE);
    expect(result).toContain("list_characters");
    expect(result).toContain("resolve_character");
    expect(result).toContain("去重判断");
    expect(result).toContain("characters/*.md");
    expect(result).toContain("[[sXXX]]");
    expect(result).toContain("只追加不删除");
  });

  test("characters prompt contains character file format spec", () => {
    const result = getArchivistSubPrompt("characters", STATE);
    expect(result).toContain("# {名}");
    expect(result).toContain("> {L0一句话}");
    expect(result).toContain("## 身份");
    expect(result).toContain("## 当前状态");
    expect(result).toContain("## 关系");
    expect(result).toContain("## 记忆");
  });

  test("scene prompt contains scene supplement workflow", () => {
    const result = getArchivistSubPrompt("scene", STATE);
    expect(result).toContain("经过");
    expect(result).toContain("小说文本");
    expect(result).toContain("关键事实");
    expect(result).toContain("scenes/sXXX.md");
  });

  test("world prompt contains world update workflow", () => {
    const result = getArchivistSubPrompt("world", STATE);
    expect(result).toContain("world.md");
    expect(result).toContain("新地点");
    expect(result).toContain("新势力");
    expect(result).toContain("新规则");
  });

  test("world prompt contains world file format spec", () => {
    const result = getArchivistSubPrompt("world", STATE);
    expect(result).toContain("## 地点");
    expect(result).toContain("## 势力");
    expect(result).toContain("## 规则");
  });

  test("plot prompt contains plot update workflow", () => {
    const result = getArchivistSubPrompt("plot", STATE);
    expect(result).toContain("plot.md");
    expect(result).toContain("关键推进");
  });

  test("timeline prompt contains timeline update workflow", () => {
    const result = getArchivistSubPrompt("timeline", STATE);
    expect(result).toContain("timeline.md");
    expect(result).toContain("Markdown 表格");
    expect(result).toContain("场景编号");
    expect(result).toContain("故事时间");
    expect(result).toContain("顺序");
  });

  test("debts prompt contains narrative debt workflow", () => {
    const result = getArchivistSubPrompt("debts", STATE);
    expect(result).toContain("debts.md");
    expect(result).toContain("叙事债务");
    expect(result).toContain("显式承诺");
    expect(result).toContain("信息缺口");
    expect(result).toContain("未解悬念");
    expect(result).toContain("未闭环因果");
  });

  test("debts prompt contains debt format with 待回收", () => {
    const result = getArchivistSubPrompt("debts", STATE);
    expect(result).toContain("- [ ]");
    expect(result).toContain("待回收");
    expect(result).toContain("来源");
    expect(result).not.toContain("影响文件");
  });

  test("different responsibilities produce different prompts", () => {
    const prompts = new Map<ArchivistResponsibility, string>();
    for (const resp of RESPONSIBILITIES) {
      prompts.set(resp, getArchivistSubPrompt(resp, STATE));
    }
    const uniqueValues = new Set(prompts.values());
    expect(uniqueValues.size).toBe(RESPONSIBILITIES.length);
  });

  test("works without story context", () => {
    const emptyState: ArchivistPromptState = {};
    const result = getArchivistSubPrompt("characters", emptyState);
    expect(result).toContain("场记员");
    expect(result).toContain("当前任务");
  });
});
