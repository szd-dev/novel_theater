import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import type { UIMessage } from "ai";

function getChatHistoryPath(projectDir: string): string {
  return join(projectDir, ".sessions", "gm-main", "chat-history.json");
}

export async function readChatHistory(projectDir: string): Promise<UIMessage[]> {
  const filePath = getChatHistoryPath(projectDir);
  try {
    if (!existsSync(filePath)) {
      return [];
    }
    const data = readFileSync(filePath, "utf-8");
    return JSON.parse(data) as UIMessage[];
  } catch {
    // Corrupt or unreadable file — treat as empty
    return [];
  }
}

export async function saveChatHistory(projectDir: string, messages: UIMessage[]): Promise<void> {
  const filePath = getChatHistoryPath(projectDir);
  const dir = join(filePath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  // Atomic write: write to temp file, then rename
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(messages, null, 2), "utf-8");
  renameSync(tmpPath, filePath);
}
