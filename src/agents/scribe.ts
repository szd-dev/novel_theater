import { Agent } from '@openai/agents';
import { getModel } from '@/lib/models';
import { readFileTool, globFilesTool } from '@/tools/file-tools';
import { getScribePrompt } from '@/prompts/scribe';
import { buildStoryContext } from '@/context/build-story-context';
import { readNovelFile } from '@/store/story-files';

export const scribeAgent = new Agent({
  name: 'Scribe',
  model: getModel('scribe'),
  instructions: async (runContext) => {
    const { storyDir } = runContext.context as { storyDir: string };
    const storyContext = await buildStoryContext(storyDir);
    const styleGuide = await readNovelFile(storyDir, 'style.md');
    return getScribePrompt({
      storyContext: storyContext ?? undefined,
      styleGuide: styleGuide ?? undefined,
    });
  },
  tools: [readFileTool, globFilesTool],
});
