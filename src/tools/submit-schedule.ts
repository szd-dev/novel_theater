import { tool } from '@openai/agents';
import type { RunContext } from '@openai/agents';
import { z } from 'zod';
import { join } from 'node:path';
import { runEnactPhase as _runEnactPhase } from '@/pipeline/enact-phase';
import { runScribeAndArchivist as _runScribeAndArchivist } from '@/pipeline/scribe-archivist-phase';
import type { ToolProgress } from '@/lib/tool-progress';
import {
  setToolProgress as _setToolProgress,
  clearToolProgress as _clearToolProgress,
} from '@/lib/tool-progress';
import { toolResult, toolError } from '@/lib/tool-result';

let runEnactPhase = _runEnactPhase;
let runScribeAndArchivist = _runScribeAndArchivist;
let setToolProgress = _setToolProgress;
let clearToolProgress = _clearToolProgress;

export function _setRunEnactPhase(fn: typeof _runEnactPhase) {
  runEnactPhase = fn;
}
export function _resetRunEnactPhase() {
  runEnactPhase = _runEnactPhase;
}
export function _setRunScribeAndArchivist(fn: typeof _runScribeAndArchivist) {
  runScribeAndArchivist = fn;
}
export function _resetRunScribeAndArchivist() {
  runScribeAndArchivist = _runScribeAndArchivist;
}
export function _setSetToolProgress(fn: typeof _setToolProgress) {
  setToolProgress = fn;
}
export function _resetSetToolProgress() {
  setToolProgress = _setToolProgress;
}
export function _setClearToolProgress(fn: typeof _clearToolProgress) {
  clearToolProgress = fn;
}
export function _resetClearToolProgress() {
  clearToolProgress = _clearToolProgress;
}

type ToolCallDetails = { toolCall?: { callId: string } };

export const submitScheduleTool = tool({
  name: 'submit_schedule',
  description:
    '提交角色出场调度计划。GM 规划场景后调用此工具，系统将自动执行后续流程（Actor 演绎、Scribe 叙事、Archivist 归档）。',
  parameters: z.object({
    schedule: z
      .array(
        z.object({
          character: z.string().describe('角色名称'),
          direction: z.string().describe('场景指示'),
        }),
      )
      .min(1)
      .max(10)
      .describe('角色出场序列'),
    narrativeSummary: z.string().describe('场景叙事摘要（用户输入+场景剧本）'),
  }),
  execute: async (input, runContext, details?: ToolCallDetails) => {
    const ctx = (runContext as RunContext).context as {
      projectId?: string;
      projectDir?: string;
      storyDir?: string;
    };
    const projectId = ctx.projectId!;
    const projectDir = ctx.projectDir!;
    const storyDir = ctx.storyDir ?? join(projectDir, '.novel');
    const { schedule, narrativeSummary } = input;
    const callId = details?.toolCall?.callId ?? `pipeline-${projectId}-${Date.now()}`;
    const total = schedule.length + 5;
    const onProgress = (p: ToolProgress) => setToolProgress(projectId, callId, p);

    try {
      const enactResult = await runEnactPhase(
        schedule,
        storyDir,
        projectId,
        projectDir,
        { onProgress, totalSteps: total },
      );

      const saResult = await runScribeAndArchivist(
        narrativeSummary,
        storyDir,
        { onProgress, totalSteps: total },
      );

      clearToolProgress(projectId, callId);

      return toolResult(
        JSON.stringify({
          callId,
          scribeOutput: saResult.scribeOutput,
          steps: enactResult.steps,
        }),
      );
    } catch (error) {
      clearToolProgress(projectId, callId);
      return toolError(error instanceof Error ? error.message : String(error));
    }
  },
});
