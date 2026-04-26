import { join } from "node:path";
import type { Session } from "@openai/agents";
import { FileSession } from "./file-session";
import type { StorySession } from "./types";

const sessionsDir = join(process.cwd(), ".sessions");

const sessions = new Map<string, StorySession>();

export function createStorySession(threadId: string): StorySession {
  const session: StorySession = {
    threadId,
    gmSession: new FileSession({ storageDir: sessionsDir, sessionId: `gm-${threadId}` }),
    characterSessions: new Map(),
  };
  sessions.set(threadId, session);
  return session;
}

export function getStorySession(threadId: string): StorySession {
  const existing = sessions.get(threadId);
  if (existing) return existing;
  return createStorySession(threadId);
}

export function getCharacterSession(threadId: string, characterName: string): Session {
  const storySession = getStorySession(threadId);
  const existing = storySession.characterSessions.get(characterName);
  if (existing) return existing;
  const charSession = new FileSession({ storageDir: sessionsDir, sessionId: `char-${threadId}-${characterName}` });
  storySession.characterSessions.set(characterName, charSession);
  return charSession;
}

export function clearStorySession(threadId: string): void {
  sessions.delete(threadId);
}
