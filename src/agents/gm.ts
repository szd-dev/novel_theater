import { Agent } from '@openai/agents';
import { getModel } from '@/lib/models';
import { getGMPrompt } from '@/prompts/gm';
import { buildStoryContext } from '@/context/build-story-context';

// Tools are set in registry.ts after asTool registration
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
  tools: [], // Populated in registry.ts
});
