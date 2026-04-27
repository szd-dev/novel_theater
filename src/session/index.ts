import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import type { SessionIndex } from "./types";

const INDEX_FILE = "index.json";

export function readSessionIndex(projectDir: string): SessionIndex | null {
  const indexPath = join(projectDir, ".sessions", INDEX_FILE);
  try {
    if (!existsSync(indexPath)) {
      return null;
    }
    const data = readFileSync(indexPath, "utf-8");
    return JSON.parse(data) as SessionIndex;
  } catch {
    return null;
  }
}

export function writeSessionIndex(projectDir: string, index: SessionIndex): void {
  const sessionsDir = join(projectDir, ".sessions");
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
  const indexPath = join(sessionsDir, INDEX_FILE);
  // Atomic write: write to temp file, then rename
  const tmpPath = `${indexPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(index, null, 2), "utf-8");
  renameSync(tmpPath, indexPath);
}

export function createInitialSessionIndex(projectDir: string): SessionIndex {
  const index: SessionIndex = {
    gmSessionId: "gm-main",
    subSessions: {},
  };
  writeSessionIndex(projectDir, index);
  return index;
}
