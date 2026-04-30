import { describe, test, expect } from "bun:test";
import { getArchivistSubPrompt } from "@/prompts/archivist-sub";
import { RESPONSIBILITIES } from "@/agents/archivist/types";
import type { ArchivistResponsibility } from "@/agents/archivist/types";
import type { ArchivistPromptState } from "@/prompts/types";

const COMMON_CONSTRAINTS = [
  "只追加不删除",
  "不创造新信息",
  "不调用任何其他节点",
  "事实归属规则",
];

const STATE: ArchivistPromptState = {
  storyContext: "场景总数: 1，当前场景: s001",
};

describe("getArchivistSubPrompt", () => {
  test("returns a non-empty string for each responsibility", () => {
    for (const resp of RESPONSIBILITIES) {
      const result = getArchivistSubPrompt(resp, STATE);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(100);
    }
  });

  test("contains common role definition for each responsibility", () => {
    for (const resp of RESPONSIBILITIES) {
      const result = getArchivistSubPrompt(resp, STATE);
      expect(result).toContain("自由剧场 Archivist");
      expect(result).toContain("角色定义");
      expect(result).toContain("输入格式");
    }
  });

  test("contains all common constraints for each responsibility", () => {
    for (const resp of RESPONSIBILITIES) {
      const result = getArchivistSubPrompt(resp, STATE);
      for (const constraint of COMMON_CONSTRAINTS) {
        expect(result).toContain(constraint);
      }
    }
  });

  test("includes story context when provided", () => {
    for (const resp of RESPONSIBILITIES) {
      const result = getArchivistSubPrompt(resp, STATE);
      expect(result).toContain("场景总数: 1，当前场景: s001");
    }
  });

  test("characters prompt contains dedup workflow steps", () => {
    const result = getArchivistSubPrompt("characters", STATE);
    expect(result).toContain("list_characters");
    expect(result).toContain("resolve_character");
    expect(result).toContain("去重判断");
    expect(result).toContain("characters/*.md");
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
    expect(result).toContain("补充场记");
    expect(result).toContain("edit_file");
    expect(result).toContain("scenes/sXXX.md");
  });

  test("scene prompt contains scene file format spec", () => {
    const result = getArchivistSubPrompt("scene", STATE);
    expect(result).toContain("## 经过");
    expect(result).toContain("## 小说文本");
    expect(result).toContain("## 关键事实");
  });

  test("world prompt contains world update workflow", () => {
    const result = getArchivistSubPrompt("world", STATE);
    expect(result).toContain("world.md");
    expect(result).toContain("地点描述");
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
    expect(result).toContain("剧情事件");
  });

  test("timeline prompt contains timeline update workflow", () => {
    const result = getArchivistSubPrompt("timeline", STATE);
    expect(result).toContain("timeline.md");
    expect(result).toContain("Markdown 表格");
  });

  test("debts prompt contains debt processing workflow", () => {
    const result = getArchivistSubPrompt("debts", STATE);
    expect(result).toContain("debts.md");
    expect(result).toContain("传播债务");
  });

  test("debts prompt contains debt format spec", () => {
    const result = getArchivistSubPrompt("debts", STATE);
    expect(result).toContain("- [ ]");
    expect(result).toContain("影响文件");
    expect(result).toContain("来源");
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
    expect(result).toContain("自由剧场 Archivist");
    expect(result).toContain("当前任务");
  });
});
