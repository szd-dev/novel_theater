import type { Session } from '@openai/agents';

export interface StorySession {
  threadId: string;
  gmSession: Session;
  characterSessions: Map<string, Session>;
}
