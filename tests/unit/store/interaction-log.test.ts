import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendInteractionLog,
  readInteractionLog,
  clearInteractionLog,
} from "@/store/interaction-log";

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "novel-test-ilog-"));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("appendInteractionLog", () => {
  test("creates .working/ directory and file on first append", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-ilog-append1-"));
    try {
      const result = appendInteractionLog(dir, "角色A", "你好世界");
      expect(result).toBe("✅ 交互记录已追加：第 1 条（角色A）");

      const workingDir = join(dir, ".working");
      expect(existsSync(workingDir)).toBe(true);
      expect(existsSync(join(dir, ".working", "latest-interaction.md"))).toBe(true);

      const content = readInteractionLog(dir);
      expect(content).toContain("# 本幕交互记录");
      expect(content).toContain("## [1] 角色A");
      expect(content).toContain("你好世界");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("appends second entry with incremented number", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-ilog-append2-"));
    try {
      appendInteractionLog(dir, "角色A", "第一条");
      const result = appendInteractionLog(dir, "角色B", "第二条");
      expect(result).toBe("✅ 交互记录已追加：第 2 条（角色B）");

      const content = readInteractionLog(dir);
      expect(content).toContain("## [1] 角色A");
      expect(content).toContain("第一条");
      expect(content).toContain("## [2] 角色B");
      expect(content).toContain("第二条");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("appends multiple entries with correct sequential numbering", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-ilog-append3-"));
    try {
      appendInteractionLog(dir, "角色A", "第一条");
      appendInteractionLog(dir, "角色B", "第二条");
      const result = appendInteractionLog(dir, "角色C", "第三条");
      expect(result).toBe("✅ 交互记录已追加：第 3 条（角色C）");

      const content = readInteractionLog(dir);
      const matches = content!.match(/^## \[\d+\]/gm);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readInteractionLog", () => {
  test("returns null when no log file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-ilog-read1-"));
    try {
      const result = readInteractionLog(dir);
      expect(result).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns file content when log exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-ilog-read2-"));
    try {
      appendInteractionLog(dir, "角色A", "测试内容");
      const result = readInteractionLog(dir);
      expect(result).not.toBeNull();
      expect(result).toContain("# 本幕交互记录");
      expect(result).toContain("## [1] 角色A");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("clearInteractionLog", () => {
  test("returns info message when no log file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-ilog-clear1-"));
    try {
      const result = clearInteractionLog(dir);
      expect(result).toBe("ℹ️ 无活跃的交互记录");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("deletes the log file and returns success message", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-ilog-clear2-"));
    try {
      appendInteractionLog(dir, "角色A", "待清除");
      expect(existsSync(join(dir, ".working", "latest-interaction.md"))).toBe(true);

      const result = clearInteractionLog(dir);
      expect(result).toBe("🗑️ 交互记录已清除");
      expect(existsSync(join(dir, ".working", "latest-interaction.md"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("read returns null after clear", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-ilog-clear3-"));
    try {
      appendInteractionLog(dir, "角色A", "待清除");
      clearInteractionLog(dir);
      const result = readInteractionLog(dir);
      expect(result).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
