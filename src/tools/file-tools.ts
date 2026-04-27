import { tool } from '@openai/agents';
import { z } from 'zod';
import { readNovelFile, writeNovelFile, globNovelFiles } from '@/store/story-files';

export function isSafePath(relativePath: string): boolean {
  if (relativePath.includes('..')) return false;
  if (relativePath.startsWith('/')) return false;
  return true;
}

function isValidCharacterFile(content: string): boolean {
  const lines = content.split('\n');
  const hasHeading = lines[0]?.startsWith('# ');
  const hasL0 = lines.some((l) => l.startsWith('> '));
  return hasHeading && hasL0;
}

function isValidSceneFile(content: string): boolean {
  const required = ['## 地点', '## 时间', '## 在场角色', '## 经过'];
  return required.every((section) => content.includes(section));
}

function getStoryDir(context: unknown): string {
  const ctx = context as { context?: { storyDir?: string } } | undefined;
  return ctx?.context?.storyDir ?? process.cwd();
}

export const readFileTool = tool({
  name: 'read_file',
  description: 'Read a file from the .novel/ story directory. Returns the file content as a string, or an error message if the file does not exist.',
  parameters: z.object({
    path: z.string().describe('Relative path within .novel/, e.g. "world.md" or "characters/塞莉娅.md"'),
  }),
  execute: async (input, context) => {
    if (!isSafePath(input.path)) {
      return `Error: Unsafe path "${input.path}". Path traversal (..) and absolute paths are not allowed.`;
    }
    const storyDir = getStoryDir(context);
    const content = await readNovelFile(storyDir, input.path);
    return content ?? `File not found: ${input.path}`;
  },
});

export const writeFileTool = tool({
  name: 'write_file',
  description: 'Write content to a file in the .novel/ story directory. Creates parent directories if needed. Validates path safety and file content for character/scene files.',
  parameters: z.object({
    path: z.string().describe('Relative path within .novel/, e.g. "world.md" or "characters/塞莉娅.md"'),
    content: z.string().describe('The content to write to the file'),
  }),
  execute: async (input, context) => {
    const storyDir = getStoryDir(context);
    if (!isSafePath(input.path)) {
      return `Error: Unsafe path "${input.path}". Path traversal (..) and absolute paths are not allowed.`;
    }
    if (input.path.startsWith('characters/') && !isValidCharacterFile(input.content)) {
      return `Error: Invalid character file content. Character files must start with "# Name" heading and have a "> " L0 line.`;
    }
    if (input.path.startsWith('scenes/') && !isValidSceneFile(input.content)) {
      return `Error: Invalid scene file content. Scene files must include sections: ## 地点, ## 时间, ## 在场角色, ## 经过.`;
    }
    await writeNovelFile(storyDir, input.path, input.content);
    return `Successfully wrote to ${input.path}`;
  },
});

export const editFileTool = tool({
  name: 'edit_file',
  description: 'Edit a file in the .novel/ story directory by replacing a search string with a replacement string. Reads the file, performs replacement, and writes back.',
  parameters: z.object({
    path: z.string().describe('Relative path within .novel/'),
    search: z.string().describe('The exact string to find and replace'),
    replace: z.string().describe('The replacement string'),
  }),
  execute: async (input, context) => {
    const storyDir = getStoryDir(context);
    if (!isSafePath(input.path)) {
      return `Error: Unsafe path "${input.path}". Path traversal (..) and absolute paths are not allowed.`;
    }
    const content = await readNovelFile(storyDir, input.path);
    if (content === null) {
      return `Error: File not found: ${input.path}`;
    }
    if (!content.includes(input.search)) {
      return `Error: Search string not found in ${input.path}`;
    }
    const newContent = content.replace(input.search, input.replace);
    await writeNovelFile(storyDir, input.path, newContent);
    return `Successfully edited ${input.path}`;
  },
});

export const globFilesTool = tool({
  name: 'glob_files',
  description: 'List files in the .novel/ story directory matching a pattern. Returns an array of relative paths.',
  parameters: z.object({
    pattern: z.string().describe('Glob pattern, e.g. "characters/*.md" or "scenes"'),
  }),
  execute: async (input, context) => {
    if (!isSafePath(input.pattern)) {
      return `Error: Unsafe path "${input.pattern}". Path traversal (..) and absolute paths are not allowed.`;
    }
    const storyDir = getStoryDir(context);
    const files = await globNovelFiles(storyDir, input.pattern);
    if (files.length === 0) {
      return `No files found matching pattern "${input.pattern}"`;
    }
    return `Files matching "${input.pattern}":\n${files.map((f) => `  - ${f}`).join('\n')}`;
  },
});
