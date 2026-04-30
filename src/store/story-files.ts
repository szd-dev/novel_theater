import { join, dirname } from "node:path";
import {
  mkdirSync,
  existsSync,
  cpSync,
  rmSync,
  readdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import {
  access,
  writeFile,
  readFile,
} from "node:fs/promises";
import { glob as tinyGlob } from "tinyglobby";
import { TEMPLATES, SUBDIRS } from "@/lib/templates";
import { isSafePath, isAllowedFilePath, isDirectivesPath } from "@/lib/validation";

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize the .novel/ directory for a new story.
 * Idempotent — skips if directory already exists.
 */
export async function initStory(dir: string): Promise<string> {
  const novelDir = dir;

  if (existsSync(novelDir)) {
    return "Story already initialized. Use resetStory() to start over.";
  }

  const created: string[] = [];
  const skipped: string[] = [];

  mkdirSync(novelDir, { recursive: true });

  for (const [filename, content] of Object.entries(TEMPLATES)) {
    const filePath = join(novelDir, filename);
    if (await pathExists(filePath)) {
      skipped.push(filename);
      continue;
    }
    await writeFile(filePath, content, "utf-8");
    created.push(filename);
  }

  for (const subdir of SUBDIRS) {
    const dirPath = join(novelDir, subdir);
    mkdirSync(dirPath, { recursive: true });
    created.push(`${subdir}/`);
  }

  let message = "🎬 Story initialized!\n\n";
  if (created.length > 0) {
    message += `Created:\n${created.map((f) => `  + .novel/${f}`).join("\n")}\n`;
  }
  if (skipped.length > 0) {
    message += `Skipped (already exist):\n${skipped.map((f) => `  · .novel/${f}`).join("\n")}\n`;
  }
  return message;
}

/**
 * Archive the current story to .archive/{name}/.
 * Validates name and checks for duplicates before copying.
 */
export async function archiveStory(
  dir: string,
  name: string,
): Promise<string> {
  const novelDir = dir;

  if (!existsSync(novelDir)) {
    return "故事尚未初始化，无法归档。";
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return "归档名不能为空。";
  }
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    return "归档名不能包含路径分隔符或上级引用。";
  }
  if (trimmed.length > 200) {
    return "归档名不能超过200个字符。";
  }

  const archiveDir = join(dirname(dir), ".archive");
  mkdirSync(archiveDir, { recursive: true });

  const archivePath = join(archiveDir, trimmed);
  if (existsSync(archivePath)) {
    return `归档"${trimmed}"已存在，请使用其他名称。`;
  }

  cpSync(novelDir, archivePath, { recursive: true });

  function countFiles(d: string): number {
    let count = 0;
    const entries = readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countFiles(join(d, entry.name));
      } else {
        count++;
      }
    }
    return count;
  }

  const srcCount = countFiles(novelDir);
  const destCount = countFiles(archivePath);

  return `📦 故事已归档到 .archive/${trimmed}/\n归档文件数: ${destCount}（源文件数: ${srcCount}）${srcCount === destCount ? " ✓" : " ⚠️ 文件数不匹配"}`;
}

/**
 * Reset the story: back up .novel/ to .archive/{timestamp}/, then rebuild templates.
 * Aborts if backup fails.
 */
export async function resetStory(dir: string): Promise<string> {
  const novelDir = dir;

  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/(\d{8})(\d{6})/, "$1-$2");

  if (existsSync(novelDir)) {
    const archiveDir = join(dirname(dir), ".archive");
    const archivePath = join(archiveDir, timestamp);

    try {
      mkdirSync(archiveDir, { recursive: true });
      cpSync(novelDir, archivePath, { recursive: true });
    } catch (err) {
      if (existsSync(archivePath)) {
        rmSync(archivePath, { recursive: true, force: true });
      }
      return `❌ 备份失败，未执行清空操作: ${err instanceof Error ? err.message : String(err)}`;
    }

    const entries = readdirSync(novelDir, { withFileTypes: true });
    for (const entry of entries) {
      const itemPath = join(novelDir, entry.name);
      rmSync(itemPath, { recursive: true, force: true });
    }
  } else {
    mkdirSync(novelDir, { recursive: true });
  }

  const created: string[] = [];

  for (const [filename, content] of Object.entries(TEMPLATES)) {
    const filePath = join(novelDir, filename);
    await writeFile(filePath, content, "utf-8");
    created.push(filename);
  }

  for (const subdir of SUBDIRS) {
    const dirPath = join(novelDir, subdir);
    mkdirSync(dirPath, { recursive: true });
    created.push(`${subdir}/`);
  }

  return `🔄 故事已重置！备份保存至 .archive/${timestamp}/\n重建模板:\n${created.map((f) => `  + .novel/${f}`).join("\n")}\n\n⚠️ 建议开启新对话会话以清除旧故事上下文`;
}

/**
 * Read a file from the .novel/ directory.
 * Returns null if the file doesn't exist.
 */
export async function readNovelFile(
  dir: string,
  relativePath: string,
): Promise<string | null> {
  const filePath = join(dir, relativePath);
  if (!(await pathExists(filePath))) {
    return null;
  }
  return readFile(filePath, "utf-8");
}

/**
 * Write a file to the .novel/ directory.
 * Creates parent directories if they don't exist.
 * Uses atomic write: writes to a .tmp file first, then renames to target.
 */
export async function writeNovelFile(
  dir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const filePath = join(dir, relativePath);
  const parts = relativePath.split("/");
  if (parts.length > 1) {
    const parentDir = join(dir, ...parts.slice(0, -1));
    mkdirSync(parentDir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}

/**
 * Delete a file from the .novel/ directory.
 * Returns true if the file existed and was deleted, false otherwise.
 * Rejects unsafe paths, disallowed file paths, and .directives.md files.
 */
export async function deleteNovelFile(
  dir: string,
  relativePath: string,
): Promise<boolean> {
  if (!isSafePath(relativePath)) return false;
  if (!isAllowedFilePath(relativePath)) return false;
  if (isDirectivesPath(relativePath)) return false;

  const filePath = join(dir, relativePath);
  if (!existsSync(filePath)) return false;

  rmSync(filePath);
  return true;
}

/**
 * Read the directives file associated with an entity.
 * Converts "characters/林黛玉.md" → "characters/林黛玉.directives.md".
 * Returns null if the directives file doesn't exist.
 */
export async function readDirectivesFile(
  dir: string,
  entityPath: string,
): Promise<string | null> {
  const directivesPath = entityPath.replace(/\.md$/, ".directives.md");
  return readNovelFile(dir, directivesPath);
}

/**
 * Glob files within the .novel/ directory matching a pattern.
 * Returns relative paths from .novel/.
 */
export async function globNovelFiles(
  dir: string,
  pattern: string,
): Promise<string[]> {
  if (!existsSync(dir)) return [];

  if (!pattern.includes("*")) {
    return tinyGlob(`${pattern}/*`, { cwd: dir, onlyFiles: true });
  }

  return tinyGlob(pattern, { cwd: dir, onlyFiles: true });
}
