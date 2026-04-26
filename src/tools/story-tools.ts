import { tool } from '@openai/agents';
import { z } from 'zod';
import { initStory, archiveStory, resetStory } from '@/store/story-files';

function getStoryDir(context: unknown): string {
  const ctx = context as { context?: { storyDir?: string } } | undefined;
  return ctx?.context?.storyDir ?? process.cwd();
}

export const initStoryTool = tool({
  name: 'init_story',
  description: 'Initialize the .novel/ directory for a new story. Creates template files and subdirectories. Idempotent — skips if already initialized.',
  parameters: z.object({}),
  execute: async (_input, context) => {
    const storyDir = getStoryDir(context);
    return await initStory(storyDir);
  },
});

export const archiveStoryTool = tool({
  name: 'archive_story',
  description: 'Archive the current story to .archive/{name}/. Validates the archive name and checks for duplicates.',
  parameters: z.object({
    name: z.string().describe('Name for the archive (no path separators or parent references)'),
  }),
  execute: async (input, context) => {
    const storyDir = getStoryDir(context);
    return await archiveStory(storyDir, input.name);
  },
});

export const resetStoryTool = tool({
  name: 'reset_story',
  description: 'Reset the story: back up .novel/ to .archive/{timestamp}/, then rebuild templates. Aborts if backup fails.',
  parameters: z.object({}),
  execute: async (_input, context) => {
    const storyDir = getStoryDir(context);
    return await resetStory(storyDir);
  },
});
