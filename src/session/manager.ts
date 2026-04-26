import { MemorySession } from '@openai/agents';
import type { StorySession } from './types';

const sessions = new Map<string, StorySession>();

export function createStorySession(threadId: string): StorySession {
  const session: StorySession = {
    threadId,
    gmSession: new MemorySession(),
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

export function getCharacterSession(threadId: string, characterName: string): MemorySession {
  const storySession = getStorySession(threadId);
  const existing = storySession.characterSessions.get(characterName);
  if (existing) return existing;
  const charSession = new MemorySession();
  storySession.characterSessions.set(characterName, charSession);
  return charSession;
}

export function clearStorySession(threadId: string): void {
  sessions.delete(threadId);
}
