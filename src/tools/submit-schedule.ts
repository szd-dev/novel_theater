import { tool } from '@openai/agents';
import type { RunContext } from '@openai/agents';
import { z } from 'zod';
import { join } from 'node:path';
import { runEnactPhase as _runEnactPhase } from '@/pipeline/enact-phase';
import { runScribeAndArchivist as _runScribeAndArchivist } from '@/pipeline/scribe-archivist-phase';
import { findLatestScene as _findLatestScene, hasCompletionMarker, getNextSceneName, SCENE_COMPLETION_MARKER } from '@/context/extract';
import { readNovelFile as _readNovelFile, writeNovelFile as _writeNovelFile } from '@/store/story-files';
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
let findLatestScene = _findLatestScene;
let readNovelFile = _readNovelFile;
let writeNovelFile = _writeNovelFile;

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
export function _setFindLatestScene(fn: typeof _findLatestScene) {
  findLatestScene = fn;
}
export function _resetFindLatestScene() {
  findLatestScene = _findLatestScene;
}
export function _setReadNovelFile(fn: typeof _readNovelFile) {
  readNovelFile = fn;
}
export function _resetReadNovelFile() {
  readNovelFile = _readNovelFile;
}
export function _setWriteNovelFile(fn: typeof _writeNovelFile) {
  writeNovelFile = fn;
}
export function _resetWriteNovelFile() {
  writeNovelFile = _writeNovelFile;
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

    // 前置检查：确保有新场景骨架且未完结
    const latestScene = await findLatestScene(storyDir);
    if (!latestScene) {
      return toolError(
        "没有找到任何场景文件。" +
        "请先创建场景骨架（write_file → scenes/s001.md），再调用 submit_schedule。"
      );
    }
    const latestContent = await readNovelFile(storyDir, `scenes/${latestScene}`);
    if (latestContent && hasCompletionMarker(latestContent)) {
      const nextScene = getNextSceneName(latestScene);
      return toolError(
        `最新场景 ${latestScene} 已完结。` +
        `请先创建新场景骨架（write_file → scenes/${nextScene}），再调用 submit_schedule。`
      );
    }

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

      // 后置标记：追加完结标记到最新场景
      const latestSceneAfter = await findLatestScene(storyDir);
      if (latestSceneAfter) {
        const sceneContent = await readNovelFile(storyDir, `scenes/${latestSceneAfter}`);
        if (sceneContent && !hasCompletionMarker(sceneContent)) {
          await writeNovelFile(
            storyDir,
            `scenes/${latestSceneAfter}`,
            sceneContent + "\n" + SCENE_COMPLETION_MARKER + "\n",
          );
        }
      }

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
