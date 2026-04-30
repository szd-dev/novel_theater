import { describe, test, expect } from "bun:test";
import { findAndReplace } from "@/lib/search-replace";

describe("findAndReplace", () => {
  test("exact match", () => {
    const result = findAndReplace(
      "hello world\nfoo bar\nhello world",
      "foo bar",
      "baz qux",
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe("hello world\nbaz qux\nhello world");
      expect(result.strategy).toBe("exact");
    }
  });

  test("rejects empty search", () => {
    const result = findAndReplace("content", "", "replacement");
    expect(result.success).toBe(false);
  });

  test("rejects ambiguous exact match", () => {
    const result = findAndReplace(
      "hello world\nhello world",
      "hello world",
      "goodbye",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("2 次");
    }
  });

  test("whitespace-insensitive fallback", () => {
    const content = "## 角色\n  林黛玉  \n## 身份";
    const result = findAndReplace(content, "## 角色\n林黛玉\n## 身份", "## 角色\n贾宝玉\n## 身份");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toContain("贾宝玉");
      expect(result.strategy).toBe("whitespace-insensitive");
    }
  });

  test("indentation-preserving fallback", () => {
    const content = "## 记忆\n    - 入府时年幼\n    - 与宝玉初见";
    const result = findAndReplace(
      content,
      "## 记忆\n- 入府时年幼\n- 与宝玉初见",
      "## 记忆\n- 入府时年幼\n- 与宝玉初见\n- 葬花",
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toContain("葬花");
      expect(result.strategy).toMatch(/^(whitespace-insensitive|indentation-preserving)$/);
    }
  });

  test("fuzzy fallback for minor typos", () => {
    const content = "## 当前状态\n林黛玉在潇湘馆中养病，心情忧郁。";
    const result = findAndReplace(
      content,
      "## 当前状态\n林黛玉在潇湘馆中养病，心情忧豫。",
      "## 当前状态\n林黛玉在潇湘馆中养病，心情好转。",
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toContain("心情好转");
      expect(result.strategy).toContain("fuzzy");
    }
  });

  test("returns error when no strategy matches", () => {
    const content = "完全不同的内容\n没有任何关联";
    const result = findAndReplace(content, "## 角色\n林黛玉", "## 角色\n贾宝玉");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("搜索内容未找到");
    }
  });

  test("rejects ambiguous whitespace-insensitive match", () => {
    const content = "## 角色\n  a  \n## 状态\n  a  ";
    const result = findAndReplace(content, "a", "b");
    expect(result.success).toBe(false);
  });
});
