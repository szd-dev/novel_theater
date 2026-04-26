import type { Session } from '@openai/agents';
import type { ExecutionLog } from './execution-log';

export interface StorySession {
  threadId: string;
  gmSession: Session;
  characterSessions: Map<string, Session>;
  executionLogs: ExecutionLog[];
}
