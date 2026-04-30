import { Agent } from '@openai/agents';
import { getModel } from '@/lib/models';
import { getGMPrompt } from '@/prompts/gm';
import { buildStoryContext } from '@/context/build-story-context';
import { submitScheduleTool } from '@/tools/submit-schedule';
import { readFileTool, writeFileTool, globFilesTool } from '@/tools/file-tools';
import { resolveCharacterTool } from '@/tools/character-tools';

export const gmAgent = new Agent({
  name: 'GM',
  model: getModel('gm'),
  instructions: async (runContext) => {
    const { storyDir } = runContext.context as { storyDir: string };
    const storyContext = await buildStoryContext(storyDir);
    return getGMPrompt({
      storyContext: storyContext ?? undefined,
    });
  },
  tools: [submitScheduleTool, readFileTool, writeFileTool, globFilesTool, resolveCharacterTool],
});
