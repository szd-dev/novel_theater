import { tool } from '@openai/agents';
import { z } from 'zod';
import { readNovelFile, writeNovelFile, globNovelFiles } from '@/store/story-files';
import { toolResult, toolError } from '@/lib/tool-result';
import { isSafePath, isValidCharacterFile, isValidSceneFile, isDirectivesPath, isAllowedFilePath } from '@/lib/validation';
import { findLatestScene } from '@/context/extract';

export { isSafePath } from '@/lib/validation';

function getStoryDir(context: unknown): string {
  const ctx = context as { context?: { storyDir?: string } } | undefined;
  return ctx?.context?.storyDir ?? process.cwd();
}

/**
 * For scene file writes: only allow creating new files (GM initializes skeleton).
 * Overwriting existing scene files is forbidden.
 */
async function validateSceneWrite(dir: string, path: string): Promise<string | null> {
  const existing = await readNovelFile(dir, path);
  if (existing !== null) {
    return `不允许覆盖已有场景文件 ${path}。场景文件只允许初始化创建，后续由 edit_file 补充。`;
  }
  return null;
}

/**
 * For scene file edits: only allow editing the latest scene file (Archivist supplements).
 * Editing historical scene files is forbidden.
 */
async function validateSceneEdit(dir: string, path: string): Promise<string | null> {
  const latestScene = await findLatestScene(dir);
  if (!latestScene) {
    return `没有找到任何场景文件，无法编辑 ${path}。`;
  }
  // path is like "scenes/s001.md", latestScene is like "s001.md"
  const sceneFileName = path.replace('scenes/', '');
  if (sceneFileName !== latestScene) {
    return `不允许编辑历史场景文件 ${path}。只能编辑最新场景文件 scenes/${latestScene}。`;
  }
  return null;
}

export const readFileTool = tool({
  name: 'read_file',
  description: 'Read a file from the .novel/ story directory. Returns the file content as a string, or an error message if the file does not exist.',
  parameters: z.object({
    path: z.string().describe('Relative path within .novel/, e.g. "world.md" or "characters/塞莉娅.md"'),
  }),
  execute: async (input, context) => {
    if (!isSafePath(input.path)) {
      return toolError(`Unsafe path "${input.path}". Path traversal (..) and absolute paths are not allowed.`);
    }
    if (!isAllowedFilePath(input.path)) {
      return toolError('Disallowed file path. .working/ and .archive/ directories are not accessible.');
    }
    const storyDir = getStoryDir(context);
    const content = await readNovelFile(storyDir, input.path);
    return content
      ? toolResult(content)
      : toolError(`File not found: ${input.path}`);
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
      return toolError(`Unsafe path "${input.path}". Path traversal (..) and absolute paths are not allowed.`);
    }
    if (!isAllowedFilePath(input.path)) {
      return toolError('Disallowed file path. .working/ and .archive/ directories are not accessible.');
    }
    if (isDirectivesPath(input.path)) {
      return toolError('作者指令文件仅限手动编辑，AI不可修改。如需调整角色设定，请在作者指令中声明。');
    }
    if (input.path.startsWith('characters/') && !isValidCharacterFile(input.content)) {
      return toolError('Invalid character file content. Character files must start with "# Name" heading and have a "> " L0 line.');
    }
    if (input.path.startsWith('scenes/') && !isValidSceneFile(input.content)) {
      return toolError('Invalid scene file content. Scene files must include sections: ## 地点, ## 时间, ## 在场角色, ## 初始剧本, ## 经过.');
    }
    if (input.path.startsWith('scenes/')) {
      const sceneError = await validateSceneWrite(storyDir, input.path);
      if (sceneError) return toolError(sceneError);
    }
    await writeNovelFile(storyDir, input.path, input.content);
    return toolResult(`Successfully wrote to ${input.path}`);
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
      return toolError(`Unsafe path "${input.path}". Path traversal (..) and absolute paths are not allowed.`);
    }
    if (!isAllowedFilePath(input.path)) {
      return toolError('Disallowed file path. .working/ and .archive/ directories are not accessible.');
    }
    if (isDirectivesPath(input.path)) {
      return toolError('作者指令文件仅限手动编辑，AI不可修改。如需调整角色设定，请在作者指令中声明。');
    }
    if (input.path.startsWith('scenes/')) {
      const sceneError = await validateSceneEdit(storyDir, input.path);
      if (sceneError) return toolError(sceneError);
    }
    const content = await readNovelFile(storyDir, input.path);
    if (content === null) {
      return toolError(`File not found: ${input.path}`);
    }
    if (!content.includes(input.search)) {
      return toolError(`Search string not found in ${input.path}`);
    }
    const newContent = content.replace(input.search, input.replace);
    if (input.path.startsWith('characters/') && !isValidCharacterFile(newContent)) {
      return toolError('Invalid character file content after edit. Character files must start with "# Name" heading and have a "> " L0 line.');
    }
    if (input.path.startsWith('scenes/') && !isValidSceneFile(newContent)) {
      return toolError('Invalid scene file content after edit. Scene files must include sections: ## 地点, ## 时间, ## 在场角色, ## 初始剧本, ## 经过.');
    }
    await writeNovelFile(storyDir, input.path, newContent);
    return toolResult(`Successfully edited ${input.path}`);
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
      return toolError(`Unsafe path "${input.pattern}". Path traversal (..) and absolute paths are not allowed.`);
    }
    if (!isAllowedFilePath(input.pattern)) {
      return toolError('Disallowed path pattern. .working/ and .archive/ directories are not accessible.');
    }
    const storyDir = getStoryDir(context);
    const files = await globNovelFiles(storyDir, input.pattern);
    if (files.length === 0) {
      return toolResult(`No files found matching pattern "${input.pattern}"`);
    }
    return toolResult(`Files matching "${input.pattern}":\n${files.map((f) => `  - ${f}`).join('\n')}`);
  },
});
