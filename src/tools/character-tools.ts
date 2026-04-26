import { tool } from '@openai/agents';
import { z } from 'zod';
import { findCharacterByName, listAllCharacters } from '@/context/character-resolver';

function getStoryDir(context: unknown): string {
  const ctx = context as { context?: { storyDir?: string } } | undefined;
  return ctx?.context?.storyDir ?? process.cwd();
}

export const resolveCharacterTool = tool({
  name: 'resolve_character',
  description: 'Find a character by name in the .novel/characters/ directory. Supports fuzzy matching (exact, substring, L0 description). Returns the canonical character name if found, or a not-found message.',
  parameters: z.object({
    name: z.string().describe('Character name to search for (supports fuzzy matching)'),
  }),
  execute: async (input, context) => {
    const storyDir = getStoryDir(context);
    const result = await findCharacterByName(storyDir, input.name);
    if (result === null) {
      return `Character "${input.name}" not found in .novel/characters/.`;
    }
    return `Found character: ${result}`;
  },
});

export const listCharactersTool = tool({
  name: 'list_characters',
  description: 'List all characters in the .novel/characters/ directory with their names and L0 (one-line identity) descriptions.',
  parameters: z.object({}),
  execute: async (_input, context) => {
    const storyDir = getStoryDir(context);
    const characters = await listAllCharacters(storyDir);
    if (characters.length === 0) {
      return 'No characters found in .novel/characters/.';
    }
    return `Characters (${characters.length}):\n${characters.map((c) => `  - ${c.name}: ${c.l0}`).join('\n')}`;
  },
});
