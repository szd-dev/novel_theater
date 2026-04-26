import type { MemorySession } from '@openai/agents';

export interface StorySession {
  /** Thread ID for this story session */
  threadId: string;
  /** GM's main session — stores the full conversation history */
  gmSession: MemorySession;
  /** Per-character sessions for Actor — keyed by character name */
  characterSessions: Map<string, MemorySession>;
}
