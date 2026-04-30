import type { RunContext, RunResult } from '@openai/agents';
import { gmAgent } from './gm';
import { actorAgent } from './actor';
import { scribeAgent } from './scribe';
import { addExecutionLog } from '@/session/manager';
import { readFileTool, writeFileTool, globFilesTool } from '@/tools/file-tools';
import { submitScheduleTool } from '@/tools/submit-schedule';
import type { ExecutionLog } from '@/session/execution-log';

/** Context passed to GM agent run and accessible in all tool execute functions. */
export interface AgentRunContext {
  storyDir: string;
  projectId: string;
  projectDir: string;
}

function getRunContext(runContext?: RunContext<unknown>): AgentRunContext | null {
  const ctx = runContext?.context as AgentRunContext | undefined;
  if (!ctx?.projectDir) return null;
  return ctx;
}

function extractToolCalls(newItems: RunResult<any, any>['newItems']): string[] {
  return newItems
    .filter(item => item.type === 'tool_call_item')
    .map(item => {
      const rawItem = (item as { rawItem?: { name?: string } }).rawItem;
      return rawItem?.name ?? 'unknown';
    });
}

function buildExecutionLog(
  agentName: string,
  input: string,
  result: RunResult<any, any>,
  projectId: string,
): ExecutionLog | null {
  return {
    id: crypto.randomUUID(),
    agentName,
    toolCallId: result.agentToolInvocation?.toolCallId,
    input,
    output: String(result.finalOutput ?? ''),
    toolCalls: extractToolCalls(result.newItems),
    timestamp: Date.now(),
    tokenUsage: result.rawResponses.length
      ? {
          inputTokens: result.rawResponses.reduce((sum, r) => sum + (r.usage?.inputTokens ?? 0), 0),
          outputTokens: result.rawResponses.reduce((sum, r) => sum + (r.usage?.outputTokens ?? 0), 0),
        }
      : undefined,
  };
}

// Set GM's tools
gmAgent.tools = [submitScheduleTool, readFileTool, writeFileTool, globFilesTool];

// Re-export for convenience
export { gmAgent, actorAgent, scribeAgent };
