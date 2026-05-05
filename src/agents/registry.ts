import { gmAgent } from './gm';
import { actorAgent } from './actor';
import { scribeAgent } from './scribe';
import { submitScheduleTool } from '@/tools/submit-schedule';
import { readFileTool, writeFileTool, globFilesTool } from '@/tools/file-tools';

/** Context passed to GM agent run and accessible in all tool execute functions. */
export interface AgentRunContext {
  storyDir: string;
  projectId: string;
  projectDir: string;
}

// Set GM tools (override any tools set in gm.ts — only 4 pipeline tools)
gmAgent.tools = [submitScheduleTool, readFileTool, writeFileTool, globFilesTool];

// Re-export for convenience
export { gmAgent, actorAgent, scribeAgent };
