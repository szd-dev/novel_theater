import { Agent } from '@openai/agents';
import { getModel } from '@/lib/models';
import { resolveCharacterTool } from '@/tools/character-tools';
import { readFileTool, globFilesTool } from '@/tools/file-tools';
import { getActorPrompt } from '@/prompts/actor';
import { readNovelFile } from '@/store/story-files';
import { buildStoryContext } from '@/context/build-story-context';

export const actorAgent = new Agent({
  name: 'Actor',
  model: getModel('actor'),
  instructions: async (runContext) => {
    const { storyDir, characterName } = runContext.context as { storyDir: string; characterName?: string };

    let characterContent = '';
    if (characterName) {
      const content = await readNovelFile(storyDir, `characters/${characterName}.md`);
      if (content) {
        characterContent = content;
      }
    }

    const storyContext = await buildStoryContext(storyDir);

    return getActorPrompt(characterName ?? '', {
      characterFile: characterContent || undefined,
      storyContext: storyContext ?? undefined,
    });
  },
  tools: [resolveCharacterTool, readFileTool, globFilesTool],
});
