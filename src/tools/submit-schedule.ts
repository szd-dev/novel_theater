import { tool } from '@openai/agents';
import { z } from 'zod';
import { toolResult } from '@/lib/tool-result';

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
  execute: async (input) => {
    return toolResult(
      JSON.stringify({
        accepted: true,
        steps: input.schedule.length,
        message: `调度已提交，系统正在执行。请勿输出叙事内容，等待执行结果返回。`,
      }),
    );
  },
});
