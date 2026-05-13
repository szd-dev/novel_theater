import { Agent } from '@openai/agents';
import { getModel, getModelSettings } from '@/lib/models';
import { getGMPrompt } from '@/prompts/gm';
import { submitScheduleTool } from '@/tools/submit-schedule';
import { readFileTool, writeFileTool, globFilesTool } from '@/tools/file-tools';

export const gmAgent = new Agent({
  name: 'GM',
  model: getModel('gm'),
  modelSettings: getModelSettings('gm'),
  instructions: async () => {
    return getGMPrompt({});
  },
  tools: [submitScheduleTool, readFileTool, writeFileTool, globFilesTool],
});
