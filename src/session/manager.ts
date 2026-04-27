import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";
import type { Session } from "@openai/agents";
import { FileSession } from "./file-session";
import type { StorySession, SessionIndex, SubSessionEntry, AgentName } from "./types";
import type { ExecutionLog } from "./execution-log";
import {
  readSessionIndex,
  writeSessionIndex,
  createInitialSessionIndex,
} from "./index";

const sessions = new Map<string, StorySession>();

function getSessionsDir(projectDir: string): string {
  return join(projectDir, ".sessions");
}

export function createStorySession(projectId: string, projectDir: string): StorySession {
  let index = readSessionIndex(projectDir);
  if (!index) {
    index = createInitialSessionIndex(projectDir);
  }
  const sessionsDir = getSessionsDir(projectDir);
  const session: StorySession = {
    projectId,
    projectDir,
    gmSession: new FileSession({ storageDir: sessionsDir, sessionId: index.gmSessionId }),
    subSessions: new Map(),
    executionLogs: [],
  };
  sessions.set(projectId, session);
  return session;
}

export function getStorySession(projectId: string): StorySession | undefined {
  return sessions.get(projectId);
}

export function getOrCreateStorySession(projectId: string, projectDir: string): StorySession {
  const existing = sessions.get(projectId);
  if (existing) return existing;
  return createStorySession(projectId, projectDir);
}

export function createSubSession(
  projectId: string,
  projectDir: string,
  agentName: AgentName,
  characterName?: string,
): { session: Session; sessionId: string } {
  const storySession = getOrCreateStorySession(projectId, projectDir);
  const sessionId = crypto.randomUUID();
  const sessionsDir = getSessionsDir(projectDir);
  const subagentDir = join(sessionsDir, "subagent");
  const subSession = new FileSession({ storageDir: subagentDir, sessionId });
  storySession.subSessions.set(sessionId, subSession);

  const index = readSessionIndex(projectDir) ?? { gmSessionId: "gm-main", subSessions: {} };
  const entry: SubSessionEntry = {
    sessionId,
    createdAt: new Date().toISOString(),
    agentName,
    characterName,
  };
  index.subSessions[sessionId] = entry;
  writeSessionIndex(projectDir, index);

  return { session: subSession, sessionId };
}

export function getSubSession(projectId: string, projectDir: string, sessionId: string): Session | undefined {
  const storySession = sessions.get(projectId);
  if (storySession) {
    const existing = storySession.subSessions.get(sessionId);
    if (existing) return existing;
  }

  // Disk re-hydration: check if session exists on disk
  const sessionsDir = getSessionsDir(projectDir);
  const historyPath = join(sessionsDir, "subagent", sessionId, "history.json");
  if (existsSync(historyPath)) {
    const subagentDir = join(sessionsDir, "subagent");
    const rehydrated = new FileSession({ storageDir: subagentDir, sessionId });
    const story = getOrCreateStorySession(projectId, projectDir);
    story.subSessions.set(sessionId, rehydrated);
    return rehydrated;
  }

  return undefined;
}

export function addExecutionLog(projectId: string, log: ExecutionLog): void {
  const session = sessions.get(projectId);
  if (!session) return;
  session.executionLogs.push(log);
}

export function getExecutionLogs(projectId: string): ExecutionLog[] {
  const session = sessions.get(projectId);
  return session?.executionLogs ?? [];
}

export function getExecutionLog(projectId: string, logId: string): ExecutionLog | undefined {
  const session = sessions.get(projectId);
  return session?.executionLogs.find(log => log.id === logId);
}

export function clearStorySession(projectId: string, projectDir?: string): void {
  sessions.delete(projectId);
  if (projectDir) {
    const sessionsDir = getSessionsDir(projectDir);
    if (existsSync(sessionsDir)) {
      rmSync(sessionsDir, { recursive: true, force: true });
    }
  }
}

/** @deprecated Use getOrCreateStorySession instead */
export function getCharacterSession(_threadId: string, _characterName: string): Session {
  throw new Error("getCharacterSession is deprecated. Use createSubSession instead.");
}

export function readIndex(projectDir: string): SessionIndex | null {
  return readSessionIndex(projectDir);
}

export function writeIndex(projectDir: string, index: SessionIndex): void {
  writeSessionIndex(projectDir, index);
}
