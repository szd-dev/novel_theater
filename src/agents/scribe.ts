import { Agent } from '@openai/agents';
import { getModel, getModelSettings } from '@/lib/models';
import { readFileTool, globFilesTool } from '@/tools/file-tools';
import { getScribePrompt } from '@/prompts/scribe';

export const scribeAgent = new Agent({
  name: 'Scribe',
  model: getModel('scribe'),
  modelSettings: getModelSettings('scribe'),
  instructions: async () => {
    return getScribePrompt({});
  },
  tools: [readFileTool, globFilesTool],
});
