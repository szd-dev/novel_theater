import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildStoryContext } from "@/context/build-story-context";
import { initStory, writeNovelFile } from "@/store/story-files";

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "novel-test-ctx-"));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("buildStoryContext", () => {
  test("returns null when .novel/ doesn't exist", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "novel-test-empty-"));
    try {
      const result = await buildStoryContext(emptyDir);
      expect(result).toBeNull();
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test("returns context with scene info when .novel/ has data", async () => {
    await initStory(tempDir);

    await writeNovelFile(
      tempDir,
      "characters/测试角色.md",
      `# 测试角色\n> 一个勇敢的冒险者\n\n## 身份\n流浪剑客\n\n## 当前状态\n精神饱满\n`,
    );

    await writeNovelFile(
      tempDir,
      "scenes/s001.md",
      `# s001 开场\n\n## 地点\n旧酒馆\n\n## 经过\n角色进入酒馆，与酒保交谈。\n\n## 在场角色\n- **测试角色**\n`,
    );

    await writeNovelFile(
      tempDir,
      "world.md",
      `# 世界设定\n\n## 地点\n\n### 旧酒馆\n一间破旧的酒馆，弥漫着劣质酒香。\n`,
    );

    const result = await buildStoryContext(tempDir);
    expect(result).not.toBeNull();
    expect(result!).toContain("当前场景");
  });

  test("token budget truncation works", async () => {
    const budgetDir = mkdtempSync(join(tmpdir(), "novel-test-budget-"));
    try {
      await initStory(budgetDir);

      const longContent = Array.from(
        { length: 50 },
        (_, i) => `这是第${i + 1}行很长的内容，用于测试token预算截断功能是否正常工作。`,
      ).join("\n");

      await writeNovelFile(
        budgetDir,
        "scenes/s001.md",
        `# s001\n\n## 经过\n${longContent}\n\n## 在场角色\n- 角色A\n`,
      );

      await writeNovelFile(
        budgetDir,
        "characters/角色A.md",
        `# 角色A\n> 描述\n\n## 身份\n测试\n`,
      );

      const result = await buildStoryContext(budgetDir, { tokenBudget: 50 });
      if (result) {
        const estimatedTokens = Math.ceil(result.length / 3);
        expect(estimatedTokens).toBeLessThanOrEqual(55);
      }
    } finally {
      rmSync(budgetDir, { recursive: true, force: true });
    }
  });

  test("returns '故事尚未开始' when no scenes exist", async () => {
    const noSceneDir = mkdtempSync(join(tmpdir(), "novel-test-noscene-"));
    try {
      await initStory(noSceneDir);
      const result = await buildStoryContext(noSceneDir);
      if (result) {
        expect(result).toContain("故事尚未开始");
      }
    } finally {
      rmSync(noSceneDir, { recursive: true, force: true });
    }
  });
});
