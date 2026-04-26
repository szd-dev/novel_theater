import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import type { AgentInputItem, Session } from "@openai/agents";

export interface FileSessionOptions {
  sessionId?: string;
  storageDir: string;
}

export class FileSession implements Session {
  private readonly sessionId: string;
  private readonly filePath: string;
  private items: AgentInputItem[];

  constructor(options: FileSessionOptions) {
    this.sessionId = options.sessionId ?? crypto.randomUUID();
    this.filePath = join(options.storageDir, this.sessionId, "history.json");
    this.items = [];
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (existsSync(this.filePath)) {
        const data = readFileSync(this.filePath, "utf-8");
        this.items = JSON.parse(data);
      }
    } catch {
      this.items = [];
    }
  }

  private saveToDisk(): void {
    const dir = join(this.filePath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    // Atomic write: write to temp file, then rename
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.items, null, 2), "utf-8");
    renameSync(tmpPath, this.filePath);
  }

  async getSessionId(): Promise<string> {
    return this.sessionId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    if (limit != null && limit > 0) {
      return this.items.slice(-limit);
    }
    return [...this.items];
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    this.items.push(...items);
    this.saveToDisk();
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const item = this.items.pop();
    if (item !== undefined) {
      this.saveToDisk();
    }
    return item;
  }

  async clearSession(): Promise<void> {
    this.items = [];
    this.saveToDisk();
  }
}
