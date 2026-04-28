import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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
    const nonexistentDir = join(tmpdir(), `novel-test-noexist-${Date.now()}`);
    const result = await buildStoryContext(nonexistentDir);
    expect(result).toBeNull();
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

  test("injects character directives at priority -1", async () => {
    const dDir = mkdtempSync(join(tmpdir(), "novel-test-char-dir-"));
    try {
      await initStory(dDir);

      await writeNovelFile(
        dDir,
        "characters/林黛玉.md",
        `# 林黛玉\n> 多愁善感的少女\n\n## 身份\n贾府外孙女\n\n## 当前状态\n忧郁\n`,
      );

      await writeNovelFile(
        dDir,
        "characters/林黛玉.directives.md",
        "性格坚韧果决",
      );

      await writeNovelFile(
        dDir,
        "scenes/s001.md",
        `# s001 开场\n\n## 地点\n潇湘馆\n\n## 经过\n黛玉独坐窗前。\n\n## 在场角色\n- 林黛玉\n`,
      );

      await writeNovelFile(
        dDir,
        "world.md",
        `# 世界设定\n\n## 地点\n\n### 潇湘馆\n幽静的院落。\n`,
      );

      const result = await buildStoryContext(dDir);
      expect(result).not.toBeNull();
      expect(result!).toContain("林黛玉 — 作者指令（不可违反）");
      expect(result!).toContain("性格坚韧果决");

      const directivesIdx = result!.indexOf("林黛玉 — 作者指令（不可违反）");
      const sceneCharsIdx = result!.indexOf("## 在场角色");
      expect(directivesIdx).toBeLessThan(sceneCharsIdx);
    } finally {
      rmSync(dDir, { recursive: true, force: true });
    }
  });

  test("injects root directives at priority -1", async () => {
    const dDir = mkdtempSync(join(tmpdir(), "novel-test-root-dir-"));
    try {
      await initStory(dDir);

      await writeNovelFile(
        dDir,
        "characters/林黛玉.md",
        `# 林黛玉\n> 多愁善感的少女\n\n## 身份\n贾府外孙女\n`,
      );

      await writeNovelFile(
        dDir,
        "scenes/s001.md",
        `# s001 开场\n\n## 地点\n潇湘馆\n\n## 经过\n黛玉独坐。\n\n## 在场角色\n- 林黛玉\n`,
      );

      await writeNovelFile(
        dDir,
        "world.md",
        `# 世界设定\n\n## 地点\n\n### 潇湘馆\n幽静的院落。\n`,
      );

      await writeNovelFile(
        dDir,
        "world.directives.md",
        "不可修改的世界规则",
      );

      const result = await buildStoryContext(dDir);
      expect(result).not.toBeNull();
      expect(result!).toContain("世界设定 — 作者指令");
      expect(result!).toContain("不可修改的世界规则");
    } finally {
      rmSync(dDir, { recursive: true, force: true });
    }
  });

  test("no directives files → unchanged output", async () => {
    const dDir = mkdtempSync(join(tmpdir(), "novel-test-nodir-"));
    try {
      await initStory(dDir);

      await writeNovelFile(
        dDir,
        "characters/林黛玉.md",
        `# 林黛玉\n> 多愁善感的少女\n\n## 身份\n贾府外孙女\n`,
      );

      await writeNovelFile(
        dDir,
        "scenes/s001.md",
        `# s001 开场\n\n## 地点\n潇湘馆\n\n## 经过\n黛玉独坐。\n\n## 在场角色\n- 林黛玉\n`,
      );

      await writeNovelFile(
        dDir,
        "world.md",
        `# 世界设定\n\n## 地点\n\n### 潇湘馆\n幽静的院落。\n`,
      );

      const result = await buildStoryContext(dDir);
      expect(result).not.toBeNull();
      expect(result!).not.toContain("作者指令");
    } finally {
      rmSync(dDir, { recursive: true, force: true });
    }
  });

  test("directives content truncated when exceeding token budget", async () => {
    const dDir = mkdtempSync(join(tmpdir(), "novel-test-dir-trunc-"));
    try {
      await initStory(dDir);

      await writeNovelFile(
        dDir,
        "characters/林黛玉.md",
        `# 林黛玉\n> 多愁善感的少女\n\n## 身份\n贾府外孙女\n`,
      );

      const longDirectives = Array.from(
        { length: 100 },
        (_, i) => `第${i + 1}条指令内容，用于测试截断功能。`,
      ).join("\n");

      await writeNovelFile(
        dDir,
        "characters/林黛玉.directives.md",
        longDirectives,
      );

      await writeNovelFile(
        dDir,
        "scenes/s001.md",
        `# s001 开场\n\n## 地点\n潇湘馆\n\n## 经过\n黛玉独坐。\n\n## 在场角色\n- 林黛玉\n`,
      );

      await writeNovelFile(
        dDir,
        "world.md",
        `# 世界设定\n\n## 地点\n\n### 潇湘馆\n幽静的院落。\n`,
      );

      const result = await buildStoryContext(dDir, { tokenBudget: 100 });
      if (result) {
        expect(result).toContain("林黛玉 — 作者指令（不可违反）");
        expect(result).not.toContain("第100条指令内容");
      }
    } finally {
      rmSync(dDir, { recursive: true, force: true });
    }
  });

  test("includes 故事进度 section", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-test-progress-"));
    try {
      await initStory(dir);
      await writeNovelFile(
        dir,
        "scenes/s001.md",
        `# s001\n\n## 地点\n旧酒馆\n\n## 时间\n黄昏\n\n## 在场角色\n- **测试角色**\n\n## 初始剧本\n角色进入酒馆\n\n## 经过\n角色进入酒馆，与酒保交谈。\n`,
      );
      await writeNovelFile(
        dir,
        "characters/测试角色.md",
        `# 测试角色\n> 一个勇敢的冒险者\n\n## 身份\n流浪剑客\n`,
      );
      const result = await buildStoryContext(dir);
      expect(result).not.toBeNull();
      expect(result!).toContain("场景总数");
      expect(result!).toContain("当前场景");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("includes 前序场景 section when previous scene exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-test-prev-"));
    try {
      await initStory(dir);
      await writeNovelFile(
        dir,
        "scenes/s001.md",
        `# s001\n\n## 地点\n旧酒馆\n\n## 时间\n黄昏\n\n## 在场角色\n- **测试角色**\n\n## 初始剧本\n角色进入酒馆\n\n## 经过\n角色进入酒馆，与酒保交谈。\n\n## 关键事实\n- 酒保透露了秘密\n`,
      );
      await writeNovelFile(
        dir,
        "characters/测试角色.md",
        `# 测试角色\n> 一个勇敢的冒险者\n\n## 身份\n流浪剑客\n`,
      );
      const result = await buildStoryContext(dir);
      expect(result).not.toBeNull();
      expect(result!).toContain("前序场景");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("includes 文件目录 section with hardcoded directory tree", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-test-filedir-"));
    try {
      await initStory(dir);
      const result = await buildStoryContext(dir);
      expect(result).not.toBeNull();
      expect(result!).toContain("文件目录");
      expect(result!).toContain("world.md");
      expect(result!).toContain("characters/");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not include 前序场景 when no scenes exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-test-noprev-"));
    try {
      await initStory(dir);
      const result = await buildStoryContext(dir);
      if (result) {
        expect(result).not.toContain("前序场景");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("DEFAULT_TOKEN_BUDGET allows full content without truncation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-test-default-budget-"));
    try {
      await initStory(dir);
      await writeNovelFile(
        dir,
        "scenes/s001.md",
        `# s001\n\n## 地点\n旧酒馆\n\n## 时间\n黄昏\n\n## 在场角色\n- **测试角色**\n\n## 初始剧本\n角色进入酒馆\n\n## 经过\n角色进入酒馆，与酒保交谈。\n`,
      );
      await writeNovelFile(
        dir,
        "characters/测试角色.md",
        `# 测试角色\n> 一个勇敢的冒险者\n\n## 身份\n流浪剑客\n\n## 当前状态\n精神饱满\n`,
      );
      const result = await buildStoryContext(dir);
      expect(result).not.toBeNull();
      expect(result!).toContain("测试角色");
      expect(result!).toContain("旧酒馆");
      expect(result!).toContain("精神饱满");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
