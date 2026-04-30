import { Agent } from '@openai/agents';
import { getModel } from '@/lib/models';
import { readFileTool, writeFileTool, editFileTool, globFilesTool } from '@/tools/file-tools';
import { resolveCharacterTool, listCharactersTool } from '@/tools/character-tools';
import { getArchivistPrompt } from '@/prompts/archivist';
import { buildStoryContext } from '@/context/build-story-context';

/** @deprecated Replaced by sub-agent factories in src/agents/archivist/factory.ts. Will be removed in next version. */
export const archivistAgent = new Agent({
  name: 'Archivist',
  model: getModel('archivist'),
  instructions: async (runContext) => {
    const { storyDir } = runContext.context as { storyDir: string };
    const storyContext = await buildStoryContext(storyDir);
    return getArchivistPrompt({
      storyContext: storyContext ?? undefined,
    });
  },
  tools: [readFileTool, writeFileTool, editFileTool, globFilesTool, resolveCharacterTool, listCharactersTool],
});
