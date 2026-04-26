import { Agent } from '@openai/agents';
import { getModel } from '@/lib/models';
import { resolveCharacterTool } from '@/tools/character-tools';
import { readFileTool } from '@/tools/file-tools';
import { getActorPrompt } from '@/prompts/actor';
import { readNovelFile, globNovelFiles } from '@/store/story-files';

async function findLatestScene(storyDir: string): Promise<string | null> {
  const sceneFiles = await globNovelFiles(storyDir, 'scenes/*.md');
  if (sceneFiles.length === 0) return null;
  // sceneFiles are sorted, last one is latest
  const latest = sceneFiles[sceneFiles.length - 1];
  return readNovelFile(storyDir, `scenes/${latest}`);
}

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

    const latestScene = await findLatestScene(storyDir);

    return getActorPrompt(characterName ?? '', {
      characterFile: characterContent || undefined,
      storyContext: latestScene || undefined,
    });
  },
  tools: [resolveCharacterTool, readFileTool],
});
