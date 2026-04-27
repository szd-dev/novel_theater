import { tool } from '@openai/agents';
import { z } from 'zod';
import { resetStory } from '@/store/story-files';

function getStoryDir(context: unknown): string {
  const ctx = context as { context?: { storyDir?: string } } | undefined;
  return ctx?.context?.storyDir ?? process.cwd();
}

export const resetStoryTool = tool({
  name: 'reset_story',
  description: 'Reset the story: back up .novel/ to .archive/{timestamp}/, then rebuild templates. Aborts if backup fails.',
  parameters: z.object({}),
  execute: async (_input, context) => {
    const storyDir = getStoryDir(context);
    return await resetStory(storyDir);
  },
});
