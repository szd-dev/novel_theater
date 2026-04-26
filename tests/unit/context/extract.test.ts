import { describe, test, expect } from "bun:test";
import {
  extractL0,
  extractL1,
  extractSectionLines,
  extractSceneSummary,
  extractCharactersInScene,
  extractLocationFromWorld,
  extractSceneLocation,
} from "@/context/extract";

const sampleCharacter = `# 测试角色
> 一个勇敢的冒险者

## 身份
流浪剑客

## 当前状态
精神饱满

## 关系
- 好友：小明

## 记忆
上次在酒馆打了一架
`;

const sampleScene = `# s001 开场

## 地点
旧酒馆

## 经过
角色进入酒馆，与酒保交谈。
酒保递上一杯热酒。

## 在场角色
- **测试角色**
- 小明
`;

describe("extractL0", () => {
  test("finds blockquote line", () => {
    expect(extractL0(sampleCharacter)).toBe("一个勇敢的冒险者");
  });

  test("returns empty string when no blockquote", () => {
    const noL0 = `# 角色\n## 身份\n剑客`;
    expect(extractL0(noL0)).toBe("");
  });

  test("returns first blockquote when multiple", () => {
    const multi = `# X\n> first\n> second`;
    expect(extractL0(multi)).toBe("first");
  });

  test("handles empty content", () => {
    expect(extractL0("")).toBe("");
  });
});

describe("extractL1", () => {
  test("extracts key sections within token budget", () => {
    const result = extractL1(sampleCharacter, 200);
    expect(result).toContain("流浪剑客");
    expect(result).toContain("精神饱满");
  });

  test("respects token budget", () => {
    const result = extractL1(sampleCharacter, 5);
    expect(result.length).toBeLessThan(sampleCharacter.length);
  });

  test("skips sections not in L1_SECTIONS", () => {
    const withOther = `# X\n## 身份\n剑客\n## 其他\n不该出现的内容`;
    const result = extractL1(withOther, 200);
    expect(result).toContain("剑客");
    expect(result).not.toContain("不该出现的内容");
  });

  test("limits to 3 lines per section", () => {
    const longSection = `# X\n## 身份\n第一行\n第二行\n第三行\n第四行不该出现`;
    const result = extractL1(longSection, 500);
    expect(result).not.toContain("第四行不该出现");
  });

  test("returns empty for content without L1 sections", () => {
    const noSections = `# X\n## 无关\n内容`;
    expect(extractL1(noSections, 200)).toBe("");
  });
});

describe("extractSectionLines", () => {
  test("extracts lines from named section", () => {
    const result = extractSectionLines(sampleScene, "经过", 5);
    expect(result).toContain("角色进入酒馆，与酒保交谈。");
    expect(result).toContain("酒保递上一杯热酒。");
  });

  test("respects maxLines", () => {
    const result = extractSectionLines(sampleScene, "经过", 1);
    const lines = result.split("\n");
    expect(lines.length).toBe(1);
  });

  test("stops at next heading", () => {
    const result = extractSectionLines(sampleScene, "经过", 10);
    expect(result).not.toContain("测试角色");
  });

  test("returns empty for missing section", () => {
    expect(extractSectionLines(sampleScene, "不存在", 5)).toBe("");
  });

  test("skips blank lines", () => {
    const withBlanks = `# X\n## 经过\n\n内容1\n\n内容2`;
    const result = extractSectionLines(withBlanks, "经过", 5);
    expect(result).not.toContain("\n\n");
  });
});

describe("extractSceneSummary", () => {
  test("extracts '经过' section when present", () => {
    const result = extractSceneSummary(sampleScene);
    expect(result).toContain("角色进入酒馆，与酒保交谈。");
  });

  test("falls back to non-heading, non-blockquote lines", () => {
    const noGuoJing = `# s001\n一些描述文字\n另一行描述`;
    const result = extractSceneSummary(noGuoJing);
    expect(result).toContain("一些描述文字");
    expect(result).toContain("另一行描述");
  });

  test("skips headings and blockquotes in fallback", () => {
    const content = `# s001\n> blockquote\n实际内容`;
    const result = extractSceneSummary(content);
    expect(result).not.toContain("blockquote");
    expect(result).toContain("实际内容");
  });

  test("limits fallback to 5 lines", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `行${i + 1}`).join("\n");
    const content = `# s001\n${lines}`;
    const result = extractSceneSummary(content);
    expect(result.split("\n").length).toBeLessThanOrEqual(5);
  });
});

describe("extractCharactersInScene", () => {
  test("parses character names from list items", () => {
    const result = extractCharactersInScene(sampleScene);
    expect(result).toContain("测试角色");
    expect(result).toContain("小明");
  });

  test("returns empty for no characters section", () => {
    const noChars = `# s001\n## 地点\n酒馆`;
    expect(extractCharactersInScene(noChars)).toEqual([]);
  });

  test("stops at next heading", () => {
    const withNext = `## 在场角色\n- 角色A\n## 其他\n- 角色B`;
    const result = extractCharactersInScene(withNext);
    expect(result).toContain("角色A");
    expect(result).not.toContain("角色B");
  });

  test("handles bold character names", () => {
    const bold = `## 在场角色\n- **艾蕾雅**\n- **莉莎**`;
    const result = extractCharactersInScene(bold);
    expect(result).toContain("艾蕾雅");
    expect(result).toContain("莉莎");
  });

  test("handles names with bracket annotations", () => {
    const withBracket = `## 在场角色\n- 角色A [主要]`;
    const result = extractCharactersInScene(withBracket);
    expect(result).toContain("角色A");
  });
});

describe("extractLocationFromWorld", () => {
  const sampleWorld = `# 世界设定

## 地点

### 旧酒馆
一间破旧的酒馆，弥漫着劣质酒香。
木质的吧台上有深深的刀痕。

### 银月堡
宏伟的城堡，位于山顶。

## 势力

### 商会
控制着酒馆的生意
`;

  test("navigates world.md structure to find location", () => {
    const result = extractLocationFromWorld(sampleWorld, "旧酒馆");
    expect(result).toContain("一间破旧的酒馆");
    expect(result).toContain("木质的吧台");
  });

  test("returns empty for missing location", () => {
    expect(extractLocationFromWorld(sampleWorld, "不存在")).toBe("");
  });

  test("handles partial name match", () => {
    const result = extractLocationFromWorld(sampleWorld, "银月");
    expect(result).toContain("宏伟的城堡");
  });

  test("stops at next ### heading", () => {
    const result = extractLocationFromWorld(sampleWorld, "旧酒馆");
    expect(result).not.toContain("银月堡");
  });

  test("returns empty when no 地点 section", () => {
    const noLoc = `# 世界\n## 势力\n### 商会\n内容`;
    expect(extractLocationFromWorld(noLoc, "旧酒馆")).toBe("");
  });
});

describe("extractSceneLocation", () => {
  test("extracts location from scene content", () => {
    expect(extractSceneLocation(sampleScene)).toBe("旧酒馆");
  });

  test("returns empty for scene without location", () => {
    const noLoc = `# s001\n## 经过\n发生了什么`;
    expect(extractSceneLocation(noLoc)).toBe("");
  });
});
