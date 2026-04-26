import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initStory,
  readNovelFile,
  writeNovelFile,
  archiveStory,
  resetStory,
} from "@/store/story-files";
import { TEMPLATES, SUBDIRS } from "@/lib/templates";

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "novel-test-store-"));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("initStory", () => {
  test("creates .novel/ with all templates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-init-"));
    try {
      const result = await initStory(dir);
      expect(result).toContain("Story initialized");

      const novelDir = join(dir, ".novel");
      expect(existsSync(novelDir)).toBe(true);

      for (const filename of Object.keys(TEMPLATES)) {
        expect(existsSync(join(novelDir, filename))).toBe(true);
      }

      for (const subdir of SUBDIRS) {
        expect(existsSync(join(novelDir, subdir))).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("is idempotent — second call returns 'already initialized'", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-idem-"));
    try {
      await initStory(dir);
      const result = await initStory(dir);
      expect(result).toContain("already initialized");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readNovelFile", () => {
  test("returns null for missing files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-read-"));
    try {
      await initStory(dir);
      const result = await readNovelFile(dir, "nonexistent.md");
      expect(result).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reads existing file content", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-read2-"));
    try {
      await initStory(dir);
      const result = await readNovelFile(dir, "world.md");
      expect(result).not.toBeNull();
      expect(result!).toContain("世界设定");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("writeNovelFile", () => {
  test("creates parent directories", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-write-"));
    try {
      await initStory(dir);
      await writeNovelFile(dir, "characters/新角色.md", "# 新角色\n> 描述");
      const content = await readNovelFile(dir, "characters/新角色.md");
      expect(content).toBe("# 新角色\n> 描述");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("overwrites existing file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-write2-"));
    try {
      await initStory(dir);
      await writeNovelFile(dir, "world.md", "新的世界内容");
      const content = await readNovelFile(dir, "world.md");
      expect(content).toBe("新的世界内容");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("archiveStory", () => {
  test("rejects empty name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-archive-"));
    try {
      await initStory(dir);
      const result = await archiveStory(dir, "");
      expect(result).toContain("不能为空");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects names with path separators", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-archive2-"));
    try {
      await initStory(dir);
      expect(await archiveStory(dir, "../evil")).toContain("路径分隔符");
      expect(await archiveStory(dir, "sub\\dir")).toContain("路径分隔符");
      expect(await archiveStory(dir, "a/b")).toContain("路径分隔符");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects names exceeding 200 chars", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-archive3-"));
    try {
      await initStory(dir);
      const longName = "a".repeat(201);
      const result = await archiveStory(dir, longName);
      expect(result).toContain("200");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects when .novel/ doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-archive4-"));
    try {
      const result = await archiveStory(dir, "test");
      expect(result).toContain("尚未初始化");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("successfully archives to .archive/{name}/", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-archive5-"));
    try {
      await initStory(dir);
      await writeNovelFile(dir, "characters/角色A.md", "# 角色A");
      const result = await archiveStory(dir, "save1");
      expect(result).toContain("已归档");
      expect(existsSync(join(dir, ".archive", "save1"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects duplicate archive name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-archive6-"));
    try {
      await initStory(dir);
      await archiveStory(dir, "dup");
      const result = await archiveStory(dir, "dup");
      expect(result).toContain("已存在");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resetStory", () => {
  test("backs up before clearing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-reset-"));
    try {
      await initStory(dir);
      await writeNovelFile(dir, "characters/角色A.md", "# 角色A\n> 重置前");
      const result = await resetStory(dir);
      expect(result).toContain("已重置");

      const archiveDir = join(dir, ".archive");
      expect(existsSync(archiveDir)).toBe(true);

      const novelDir = join(dir, ".novel");
      for (const filename of Object.keys(TEMPLATES)) {
        expect(existsSync(join(novelDir, filename))).toBe(true);
      }

      const charContent = await readNovelFile(dir, "characters/角色A.md");
      expect(charContent).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("works on fresh directory without existing .novel/", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-reset2-"));
    try {
      const result = await resetStory(dir);
      expect(result).toContain("已重置");
      expect(existsSync(join(dir, ".novel"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
