import { join } from 'node:path';
import { z } from 'zod';
import { tool, run } from '@openai/agents';
import { gmAgent } from './gm';
import { actorAgent } from './actor';
import { scribeAgent } from './scribe';
import { archivistAgent } from './archivist';
import { addExecutionLog, createSubSession, getSubSession } from '@/session/manager';
import { appendInteractionLog, clearInteractionLog } from '@/store/interaction-log';
import { readFileTool, writeFileTool, globFilesTool } from '@/tools/file-tools';
import { toolResult, toolError } from '@/lib/tool-result';
import type { ExecutionLog } from '@/session/execution-log';
import type { RunResult, Session } from '@openai/agents';
import { createPromptLogFilter } from '@/lib/prompt-logger';

let currentProjectId: string | undefined;
let currentProjectDir: string | undefined;

export function setCurrentProjectId(projectId: string | undefined, projectDir: string | undefined): void {
  currentProjectId = projectId;
  currentProjectDir = projectDir;
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
): ExecutionLog | null {
  if (!currentProjectId) return null;
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

const callActorTool = tool({
  name: 'call_actor',
  description: '调用演员进行角色表演。传入角色名和场景指示，Actor 会以角色视角输出行为、对话和内心独白。',
  parameters: z.object({
    character: z.string().describe('角色名称（如"塞莉娅"、"希尔薇"）'),
    direction: z.string().describe('场景指示，告诉 Actor 角色应该做什么、面对什么情境'),
    sessionId: z.string().optional().describe('已有的 sub-session ID，传入则复用，不传则新建'),
  }),
  execute: async (input) => {
    if (!currentProjectDir) return toolError('No active project');
    const storyDir = join(currentProjectDir, '.novel');

    let isNewSession = false;
    let subSession: Session;
    let sessionId: string;
    if (input.sessionId) {
      const existing = getSubSession(currentProjectId!, currentProjectDir!, input.sessionId);
      if (existing) {
        subSession = existing;
        sessionId = input.sessionId;
      } else {
        return toolError(`Session ${input.sessionId} not found. Start a new session by calling without sessionId.`);
      }
    } else {
      const created = createSubSession(currentProjectId!, currentProjectDir!, 'Actor', input.character);
      subSession = created.session;
      sessionId = created.sessionId;
      isNewSession = true;
    }

    const result = await run(actorAgent, `${input.character}: ${input.direction}`, {
      context: { storyDir, characterName: input.character },
      session: subSession,
      maxTurns: 25,
      callModelInputFilter: createPromptLogFilter(storyDir),
    });

    // Auto-append interaction log (best-effort)
    try {
      appendInteractionLog(storyDir, input.character, String(result.finalOutput ?? ''));
    } catch {
      // Best-effort: don't block Actor result on interaction log write failure
    }

    const log = buildExecutionLog('Actor', `${input.character}: ${input.direction}`, result);
    if (log && currentProjectId) addExecutionLog(currentProjectId, log);

    return toolResult(JSON.stringify({ output: String(result.finalOutput ?? ''), sessionId, isNewSession }));
  },
});

const callScribeTool = tool({
  name: 'call_scribe',
  description: '调用书记将交互记录转为文学文本。Scribe 会参考风格指南进行创作。',
  parameters: z.object({
    sceneContext: z.string().describe('场景上下文——地点、时间、氛围描述'),
    sessionId: z.string().optional().describe('已有的 sub-session ID，传入则复用，不传则新建'),
  }),
  execute: async (input) => {
    if (!currentProjectDir) return toolError('No active project');
    const storyDir = join(currentProjectDir, '.novel');

    let isNewSession = false;
    let subSession: Session;
    let sessionId: string;
    if (input.sessionId) {
      const existing = getSubSession(currentProjectId!, currentProjectDir!, input.sessionId);
      if (existing) {
        subSession = existing;
        sessionId = input.sessionId;
      } else {
        return toolError(`Session ${input.sessionId} not found. Start a new session by calling without sessionId.`);
      }
    } else {
      const created = createSubSession(currentProjectId!, currentProjectDir!, 'Scribe');
      subSession = created.session;
      sessionId = created.sessionId;
      isNewSession = true;
    }

    const result = await run(scribeAgent, input.sceneContext, {
      context: { storyDir },
      session: subSession,
      maxTurns: 25,
      callModelInputFilter: createPromptLogFilter(storyDir),
    });

    const log = buildExecutionLog('Scribe', input.sceneContext, result);
    if (log && currentProjectId) addExecutionLog(currentProjectId, log);

    return toolResult(JSON.stringify({ output: String(result.finalOutput ?? ''), sessionId, isNewSession }));
  },
});

const callArchivistTool = tool({
  name: 'call_archivist',
  description: '调用场记员更新故事状态文件（角色、世界、剧情、时间线）。Archivist 会自行决定更新哪些文件。',
  parameters: z.object({
    narrativeSummary: z.string().describe('场景叙事摘要（详细描述场景中发生了什么，包括角色变化、新事实、关系变化）'),
    literaryText: z.string().describe('Scribe 产出的完整文学文本'),
    sessionId: z.string().optional().describe('已有的 sub-session ID，传入则复用，不传则新建'),
  }),
  execute: async (input) => {
    if (!currentProjectDir) return toolError('No active project');
    const storyDir = join(currentProjectDir, '.novel');

    let isNewSession = false;
    let subSession: Session;
    let sessionId: string;
    if (input.sessionId) {
      const existing = getSubSession(currentProjectId!, currentProjectDir!, input.sessionId);
      if (existing) {
        subSession = existing;
        sessionId = input.sessionId;
      } else {
        return toolError(`Session ${input.sessionId} not found. Start a new session by calling without sessionId.`);
      }
    } else {
      const created = createSubSession(currentProjectId!, currentProjectDir!, 'Archivist');
      subSession = created.session;
      sessionId = created.sessionId;
      isNewSession = true;
    }

    const prompt = `叙事摘要：\n${input.narrativeSummary}\n\n文学文本：\n${input.literaryText}`;

    const result = await run(archivistAgent, prompt, {
      context: { storyDir },
      session: subSession,
      maxTurns: 50,
      callModelInputFilter: createPromptLogFilter(storyDir),
    });

    const log = buildExecutionLog('Archivist', prompt, result);
    if (log && currentProjectId) addExecutionLog(currentProjectId, log);

    return toolResult(JSON.stringify({ output: String(result.finalOutput ?? ''), sessionId, isNewSession }));
  },
});

const clearInteractionLogTool = tool({
  name: 'clear_interaction_log',
  description: '清除当前交互记录文件。通常在场景结束时调用。',
  parameters: z.object({}),
  execute: async () => {
    if (!currentProjectDir) return toolError('No active project');
    const storyDir = join(currentProjectDir, '.novel');
    return toolResult(clearInteractionLog(storyDir));
  },
});

// Set GM's tools
gmAgent.tools = [callActorTool, callScribeTool, callArchivistTool, clearInteractionLogTool, readFileTool, writeFileTool, globFilesTool];

// Re-export for convenience
export { gmAgent, actorAgent, scribeAgent, archivistAgent };
