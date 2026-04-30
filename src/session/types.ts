import type { Session } from '@openai/agents';
import type { ExecutionLog } from './execution-log';

export type AgentName = 'Actor' | 'Scribe' | 'Archivist' | 'Archivist-Characters' | 'Archivist-Scene' | 'Archivist-World' | 'Archivist-Plot' | 'Archivist-Timeline' | 'Archivist-Debts';

export interface SubSessionEntry {
  sessionId: string;
  createdAt: string;
  agentName: AgentName;
  characterName?: string;
}

export interface SessionIndex {
  gmSessionId: string;
  subSessions: Record<string, SubSessionEntry>;
}

export interface StorySession {
  projectId: string;
  projectDir: string;
  gmSession: Session;
  subSessions: Map<string, Session>;
  executionLogs: ExecutionLog[];
  /** @deprecated Use projectId instead. Will be removed after session manager rewrite. */
  threadId?: string;
  /** @deprecated Sub-sessions now managed via SessionIndex. Will be removed after session manager rewrite. */
  characterSessions?: Map<string, Session>;
}
