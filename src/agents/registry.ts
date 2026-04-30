import { gmAgent } from './gm';
import { actorAgent } from './actor';
import { scribeAgent } from './scribe';

/** Context passed to GM agent run and accessible in all tool execute functions. */
export interface AgentRunContext {
  storyDir: string;
  projectId: string;
  projectDir: string;
}

// Re-export for convenience
export { gmAgent, actorAgent, scribeAgent };
