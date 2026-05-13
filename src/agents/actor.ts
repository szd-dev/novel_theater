import { Agent } from '@openai/agents';
import { getModel, getModelSettings } from '@/lib/models';
import { resolveCharacterTool } from '@/tools/character-tools';
import { readFileTool, globFilesTool } from '@/tools/file-tools';
import { getActorPrompt } from '@/prompts/actor';

export const actorAgent = new Agent({
  name: 'Actor',
  model: getModel('actor'),
  modelSettings: getModelSettings('actor'),
  instructions: async (runContext) => {
    const { characterName } = runContext.context as { storyDir: string; characterName?: string };
    return getActorPrompt(characterName ?? '', {});
  },
  tools: [resolveCharacterTool, readFileTool, globFilesTool],
});
