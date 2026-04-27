import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildStoryContext } from "@/context/build-story-context";
import { initStory, writeNovelFile } from "@/store/story-files";

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "novel-test-ilog-"));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("buildStoryContext — interaction log injection", () => {
  test("appends interaction log after budget-limited content", async () => {
    await initStory(tempDir);

    await writeNovelFile(
      tempDir,
      "scenes/s001.md",
      `# s001 开场\n\n## 经过\n角色进入酒馆。\n\n## 在场角色\n- **角色A**\n`,
    );

    await writeNovelFile(
      tempDir,
      "characters/角色A.md",
      `# 角色A\n> 勇敢的冒险者\n\n## 身份\n剑客\n`,
    );

    const workingDir = join(tempDir, ".working");
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(
      join(workingDir, "latest-interaction.md"),
      `# 本幕交互记录\n\n## [1] 角色A\n角色A挥剑攻击。\n`,
      "utf-8",
    );

    const result = await buildStoryContext(tempDir);
    expect(result).not.toBeNull();
    expect(result!).toContain("本幕交互记录");
    expect(result!).toContain("角色A挥剑攻击");
  });

  test("interaction log appears after budget-limited content", async () => {
    const budgetDir = mkdtempSync(join(tmpdir(), "novel-test-ilog-budget-"));
    try {
      await initStory(budgetDir);

      const longContent = Array.from(
        { length: 50 },
        (_, i) => `这是第${i + 1}行很长的内容，用于测试交互记录注入位置。`,
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

      const workingDir = join(budgetDir, ".working");
      mkdirSync(workingDir, { recursive: true });
      writeFileSync(
        join(workingDir, "latest-interaction.md"),
        `# 本幕交互记录\n\n## [1] 角色A\n交互内容在此。\n`,
        "utf-8",
      );

      const result = await buildStoryContext(budgetDir, { tokenBudget: 50 });
      expect(result).not.toBeNull();
      // Interaction log is appended AFTER budget content, so it should always appear
      expect(result!).toContain("本幕交互记录");
      expect(result!).toContain("交互内容在此");

      // Verify ordering: budget content comes before interaction log
      const logIndex = result!.indexOf("本幕交互记录");
      const sceneIndex = result!.indexOf("当前场景");
      if (sceneIndex !== -1) {
        expect(logIndex).toBeGreaterThan(sceneIndex);
      }
    } finally {
      rmSync(budgetDir, { recursive: true, force: true });
    }
  });

  test("output unchanged when no interaction log exists", async () => {
    const noLogDir = mkdtempSync(join(tmpdir(), "novel-test-ilog-none-"));
    try {
      await initStory(noLogDir);

      await writeNovelFile(
        noLogDir,
        "scenes/s001.md",
        `# s001 开场\n\n## 经过\n角色进入酒馆。\n\n## 在场角色\n- **角色A**\n`,
      );

      await writeNovelFile(
        noLogDir,
        "characters/角色A.md",
        `# 角色A\n> 勇敢的冒险者\n\n## 身份\n剑客\n`,
      );

      const result = await buildStoryContext(noLogDir);
      expect(result).not.toBeNull();
      expect(result!).not.toContain("本幕交互记录");
    } finally {
      rmSync(noLogDir, { recursive: true, force: true });
    }
  });

  test("interaction log not counted in token budget", async () => {
    const tightDir = mkdtempSync(join(tmpdir(), "novel-test-ilog-tight-"));
    try {
      await initStory(tightDir);

      await writeNovelFile(
        tightDir,
        "scenes/s001.md",
        `# s001\n\n## 经过\n简短内容。\n\n## 在场角色\n- 角色A\n`,
      );

      await writeNovelFile(
        tightDir,
        "characters/角色A.md",
        `# 角色A\n> 描述\n\n## 身份\n测试\n`,
      );

      const longLog = Array.from(
        { length: 100 },
        (_, i) => `交互记录第${i + 1}行，这是一段很长的内容。`,
      ).join("\n");

      const workingDir = join(tightDir, ".working");
      mkdirSync(workingDir, { recursive: true });
      writeFileSync(
        join(workingDir, "latest-interaction.md"),
        `# 本幕交互记录\n\n## [1] 角色A\n${longLog}\n`,
        "utf-8",
      );

      // With a small budget, the scene content would be truncated,
      // but the interaction log (outside budget) should appear in full
      const result = await buildStoryContext(tightDir, { tokenBudget: 50 });
      expect(result).not.toBeNull();
      expect(result!).toContain("交互记录第1行");
      expect(result!).toContain("交互记录第100行");
    } finally {
      rmSync(tightDir, { recursive: true, force: true });
    }
  });
});
