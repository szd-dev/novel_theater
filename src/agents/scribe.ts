import { Agent } from '@openai/agents';
import { getModel } from '@/lib/models';
import { readFileTool } from '@/tools/file-tools';
import { getScribePrompt } from '@/prompts/scribe';

export const scribeAgent = new Agent({
  name: 'Scribe',
  model: getModel('scribe'),
  instructions: getScribePrompt({}),
  tools: [readFileTool],
});
