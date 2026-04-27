import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";

const INTERACTION_FILE = ".working/latest-interaction.md";

/**
 * Append an interaction entry to the interaction log.
 * Creates the .working/ directory and file if they don't exist.
 * Entries are numbered sequentially: ## [1], ## [2], ...
 */
export function appendInteractionLog(
  storyDir: string,
  characterName: string,
  output: string,
): string {
  const workingDir = join(storyDir, ".working");
  mkdirSync(workingDir, { recursive: true });

  const filePath = join(storyDir, INTERACTION_FILE);

  if (!existsSync(filePath)) {
    const content = `# 本幕交互记录\n\n## [1] ${characterName}\n${output}\n`;
    writeFileSync(filePath, content, "utf-8");
    return `✅ 交互记录已追加：第 1 条（${characterName}）`;
  }

  const existing = readFileSync(filePath, "utf-8");
  const matches = existing.match(/^## \[\d+\]/gm);
  const nextNum = matches ? matches.length + 1 : 1;
  const newEntry = `\n## [${nextNum}] ${characterName}\n${output}\n`;
  writeFileSync(filePath, existing + newEntry, "utf-8");
  return `✅ 交互记录已追加：第 ${nextNum} 条（${characterName}）`;
}

/**
 * Read the interaction log file.
 * Returns null if the file doesn't exist.
 */
export function readInteractionLog(storyDir: string): string | null {
  const filePath = join(storyDir, INTERACTION_FILE);
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, "utf-8");
}

/**
 * Clear (delete) the interaction log file.
 * Returns an info message if no active log exists.
 */
export function clearInteractionLog(storyDir: string): string {
  const filePath = join(storyDir, INTERACTION_FILE);
  if (!existsSync(filePath)) {
    return "ℹ️ 无活跃的交互记录";
  }
  rmSync(filePath);
  return "🗑️ 交互记录已清除";
}
