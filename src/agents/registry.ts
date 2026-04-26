import { z } from 'zod';
import { gmAgent } from './gm';
import { actorAgent } from './actor';
import { scribeAgent } from './scribe';
import { archivistAgent } from './archivist';
import { initStoryTool } from '@/tools/story-tools';
import { getCharacterSession, addExecutionLog } from '@/session/manager';
import type { ExecutionLog } from '@/session/execution-log';
import type { Session, AgentInputItem } from '@openai/agents';

let currentThreadId: string | undefined;

export function setCurrentThreadId(threadId: string | undefined): void {
  currentThreadId = threadId;
}

class DynamicCharacterSession implements Session {
  private characterName: string;

  constructor(characterName: string) {
    this.characterName = characterName;
  }

  private resolve(): Session {
    if (!currentThreadId) {
      throw new Error('currentThreadId not set');
    }
    return getCharacterSession(currentThreadId, this.characterName);
  }

  async getSessionId(): Promise<string> {
    return this.resolve().getSessionId();
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    return this.resolve().getItems(limit);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    return this.resolve().addItems(items);
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    return this.resolve().popItem();
  }

  async clearSession(): Promise<void> {
    return this.resolve().clearSession();
  }
}

function extractToolCalls(newItems: { type: string; rawItem?: { name?: string } }[]): string[] {
  return newItems
    .filter((item): item is { type: string; rawItem?: { name?: string } } => item.type === 'tool_call_item')
    .map(item => item.rawItem?.name ?? 'unknown');
}

function buildExecutionLog(
  agentName: string,
  input: string,
  result: {
    finalOutput?: unknown;
    agentToolInvocation?: { toolCallId?: string };
    newItems?: { type: string; rawItem?: { name?: string } }[];
    rawResponses?: { usage?: { inputTokens: number; outputTokens: number } }[];
  },
): ExecutionLog | null {
  if (!currentThreadId) return null;
  return {
    id: crypto.randomUUID(),
    agentName,
    toolCallId: result.agentToolInvocation?.toolCallId,
    input,
    output: String(result.finalOutput ?? ''),
    toolCalls: result.newItems ? extractToolCalls(result.newItems) : undefined,
    timestamp: Date.now(),
    tokenUsage: result.rawResponses?.length
      ? {
          inputTokens: result.rawResponses.reduce((sum, r) => sum + (r.usage?.inputTokens ?? 0), 0),
          outputTokens: result.rawResponses.reduce((sum, r) => sum + (r.usage?.outputTokens ?? 0), 0),
        }
      : undefined,
  };
}

const callActorTool = actorAgent.asTool({
  toolName: 'call_actor',
  toolDescription:
    '调用演员进行角色表演。传入角色名和场景指示，Actor 会以角色视角输出行为、对话和内心独白。',
  parameters: z.object({
    character: z.string().describe('角色名称（如"塞莉娅"、"希尔薇"）'),
    direction: z
      .string()
      .describe('场景指示，告诉 Actor 角色应该做什么、面对什么情境'),
  }),
  runOptions: {
    session: new DynamicCharacterSession('actor'),
  },
  customOutputExtractor: (result) => {
    const log = buildExecutionLog('Actor', 'character + direction', result as any);
    if (log && currentThreadId) addExecutionLog(currentThreadId, log);
    return String(result.finalOutput ?? '');
  },
});

const callScribeTool = scribeAgent.asTool({
  toolName: 'call_scribe',
  toolDescription:
    '调用书记将交互记录转为文学文本。Scribe 会参考风格指南进行创作。',
  parameters: z.object({
    interactionLog: z
      .string()
      .describe(
        '交互记录——包含所有 Actor 的输出（角色行为+对话+内心独白）',
      ),
    sceneContext: z
      .string()
      .describe('场景上下文——地点、时间、氛围描述'),
  }),
  runOptions: {
    session: new DynamicCharacterSession('scribe'),
  },
  customOutputExtractor: (result) => {
    const log = buildExecutionLog('Scribe', 'interactionLog + sceneContext', result as any);
    if (log && currentThreadId) addExecutionLog(currentThreadId, log);
    return String(result.finalOutput ?? '');
  },
});

const callArchivistTool = archivistAgent.asTool({
  toolName: 'call_archivist',
  toolDescription:
    '调用场记员更新故事状态文件（角色、世界、剧情、时间线）。Archivist 会自行决定更新哪些文件。',
  parameters: z.object({
    narrativeSummary: z
      .string()
      .describe(
        '场景叙事摘要（详细描述场景中发生了什么，包括角色变化、新事实、关系变化）',
      ),
    literaryText: z.string().describe('Scribe 产出的完整文学文本'),
  }),
  runOptions: {
    session: new DynamicCharacterSession('archivist'),
  },
  customOutputExtractor: (result) => {
    const log = buildExecutionLog('Archivist', 'narrativeSummary + literaryText', result as any);
    if (log && currentThreadId) addExecutionLog(currentThreadId, log);
    return String(result.finalOutput ?? '');
  },
});

// Set GM's tools
gmAgent.tools = [callActorTool, callScribeTool, callArchivistTool, initStoryTool];

// Re-export for convenience
export { gmAgent, actorAgent, scribeAgent, archivistAgent };
