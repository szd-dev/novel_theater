import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initStory,
  readNovelFile,
  writeNovelFile,
  deleteNovelFile,
  readDirectivesFile,
  archiveStory,
  resetStory,
} from "@/store/story-files";
import { computeFileHash } from "@/lib/file-hash";
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
    const parentDir = mkdtempSync(join(tmpdir(), "novel-init-"));
    const dir = join(parentDir, ".novel");
    try {
      const result = await initStory(dir);
      expect(result).toContain("Story initialized");

      for (const filename of Object.keys(TEMPLATES)) {
        expect(existsSync(join(dir, filename))).toBe(true);
      }

      for (const subdir of SUBDIRS) {
        expect(existsSync(join(dir, subdir))).toBe(true);
      }
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test("is idempotent — second call returns 'already initialized'", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-idem-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      const result = await initStory(dir);
      expect(result).toContain("already initialized");
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });
});

describe("readNovelFile", () => {
  test("returns null for missing files", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-read-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      const result = await readNovelFile(dir, "nonexistent.md");
      expect(result).toBeNull();
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test("reads existing file content", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-read2-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      const result = await readNovelFile(dir, "world.md");
      expect(result).not.toBeNull();
      expect(result!).toContain("世界设定");
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });
});

describe("writeNovelFile", () => {
  test("creates parent directories", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-write-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      await writeNovelFile(dir, "characters/新角色.md", "# 新角色\n> 描述");
      const content = await readNovelFile(dir, "characters/新角色.md");
      expect(content).toBe("# 新角色\n> 描述");
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test("overwrites existing file", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-write2-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      await writeNovelFile(dir, "world.md", "新的世界内容");
      const content = await readNovelFile(dir, "world.md");
      expect(content).toBe("新的世界内容");
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });
});

describe("archiveStory", () => {
  test("rejects empty name", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-archive-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      const result = await archiveStory(dir, "");
      expect(result).toContain("不能为空");
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test("rejects names with path separators", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-archive2-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      expect(await archiveStory(dir, "../evil")).toContain("路径分隔符");
      expect(await archiveStory(dir, "sub\\dir")).toContain("路径分隔符");
      expect(await archiveStory(dir, "a/b")).toContain("路径分隔符");
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test("rejects names exceeding 200 chars", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-archive3-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      const longName = "a".repeat(201);
      const result = await archiveStory(dir, longName);
      expect(result).toContain("200");
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test("rejects when .novel/ doesn't exist", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-archive4-"));
    const dir = join(parentDir, ".novel");
    try {
      const result = await archiveStory(dir, "test");
      expect(result).toContain("尚未初始化");
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test("successfully archives to .archive/{name}/", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-archive5-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      await writeNovelFile(dir, "characters/角色A.md", "# 角色A");
      const result = await archiveStory(dir, "save1");
      expect(result).toContain("已归档");
      expect(existsSync(join(parentDir, ".archive", "save1"))).toBe(true);
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test("rejects duplicate archive name", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-archive6-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      await archiveStory(dir, "dup");
      const result = await archiveStory(dir, "dup");
      expect(result).toContain("已存在");
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });
});

describe("resetStory", () => {
  test("backs up before clearing", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-reset-"));
    const dir = join(parentDir, ".novel");
    try {
      await initStory(dir);
      await writeNovelFile(dir, "characters/角色A.md", "# 角色A\n> 重置前");
      const result = await resetStory(dir);
      expect(result).toContain("已重置");

      const archiveDir = join(parentDir, ".archive");
      expect(existsSync(archiveDir)).toBe(true);

      for (const filename of Object.keys(TEMPLATES)) {
        expect(existsSync(join(dir, filename))).toBe(true);
      }

      const charContent = await readNovelFile(dir, "characters/角色A.md");
      expect(charContent).toBeNull();
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  test("works on fresh directory without existing .novel/", async () => {
    const parentDir = mkdtempSync(join(tmpdir(), "novel-reset2-"));
    const dir = join(parentDir, ".novel");
    try {
      const result = await resetStory(dir);
      expect(result).toContain("已重置");
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });
});

describe("computeFileHash", () => {
  test("returns 64-char hex string", () => {
    const hash = computeFileHash("hello world");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  test("produces identical hashes for identical content", () => {
    const a = computeFileHash("hello world");
    const b = computeFileHash("hello world");
    expect(a).toBe(b);
  });

  test("produces different hashes for different content", () => {
    const a = computeFileHash("hello world");
    const b = computeFileHash("hello universe");
    expect(a).not.toBe(b);
  });
});

describe("atomic writeNovelFile", () => {
  test("writes content correctly", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-atomic-"));
    try {
      await writeNovelFile(dir, "test.md", "atomic content");
      const content = await readNovelFile(dir, "test.md");
      expect(content).toBe("atomic content");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("leaves no .tmp files after write", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-atomic2-"));
    try {
      await writeNovelFile(dir, "test.md", "no tmp files");
      const entries = readdirSync(dir);
      expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("overwrites existing file atomically", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-atomic3-"));
    try {
      await writeNovelFile(dir, "world.md", "original");
      await writeNovelFile(dir, "world.md", "updated");
      const content = await readNovelFile(dir, "world.md");
      expect(content).toBe("updated");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("deleteNovelFile", () => {
  test("deletes existing file and returns true", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-delete-"));
    try {
      await writeNovelFile(dir, "characters/test.md", "# Test");
      const result = await deleteNovelFile(dir, "characters/test.md");
      expect(result).toBe(true);
      expect(await readNovelFile(dir, "characters/test.md")).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns false for non-existent file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-delete2-"));
    try {
      const result = await deleteNovelFile(dir, "nonexistent.md");
      expect(result).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns false for .directives.md files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-delete3-"));
    try {
      await writeNovelFile(dir, "characters/test.directives.md", "directives");
      const result = await deleteNovelFile(dir, "characters/test.directives.md");
      expect(result).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns false for .working/ paths", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-delete4-"));
    try {
      const result = await deleteNovelFile(dir, ".working/latest-interaction.md");
      expect(result).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns false for unsafe path with ..", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-delete5-"));
    try {
      const result = await deleteNovelFile(dir, "../etc/passwd");
      expect(result).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readDirectivesFile", () => {
  test("reads directives file for existing entity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-directives-"));
    try {
      await writeNovelFile(dir, "characters/test.md", "# Test character");
      await writeNovelFile(dir, "characters/test.directives.md", "Do not kill this character");
      const result = await readDirectivesFile(dir, "characters/test.md");
      expect(result).toBe("Do not kill this character");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns null when directives file does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-directives2-"));
    try {
      const result = await readDirectivesFile(dir, "characters/nonexistent.md");
      expect(result).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
