import { Agent } from '@openai/agents';
import { getModel } from '@/lib/models';
import { readFileTool, writeFileTool, editFileTool, globFilesTool } from '@/tools/file-tools';
import { resolveCharacterTool } from '@/tools/character-tools';
import { getArchivistPrompt } from '@/prompts/archivist';

export const archivistAgent = new Agent({
  name: 'Archivist',
  model: getModel('archivist'),
  instructions: getArchivistPrompt({}),
  tools: [readFileTool, writeFileTool, editFileTool, globFilesTool, resolveCharacterTool],
});
