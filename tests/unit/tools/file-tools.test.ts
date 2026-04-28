import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Agent, RunContext } from '@openai/agents';
import { editFileTool, writeFileTool, readFileTool, globFilesTool } from '@/tools/file-tools';

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'novel-edit-test-'));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeRunContext(storyDir: string) {
  const agent = new Agent({ name: 'test-agent' });
  const rc = new RunContext(agent);
  rc.context = { storyDir } as Record<string, string>;
  return rc;
}

describe('editFileTool post-edit re-validation', () => {
  test('rejects edit that removes character heading', async () => {
    const charDir = join(tempDir, 'characters');
    mkdirSync(charDir, { recursive: true });
    const filePath = join(charDir, '林黛玉.md');
    const originalContent = '# 林黛玉\n> 黛玉初入贾府';
    writeFileSync(filePath, originalContent, 'utf-8');

    const rc = makeRunContext(tempDir);
    const result = await editFileTool.invoke(
      rc,
      JSON.stringify({ path: 'characters/林黛玉.md', search: '# 林黛玉', replace: '林黛玉' }),
    );

    expect(result).toContain('Invalid character file content');

    const onDisk = readFileSync(filePath, 'utf-8');
    expect(onDisk).toBe(originalContent);
  });

  test('rejects edit that removes scene section', async () => {
    const sceneDir = join(tempDir, 'scenes');
    mkdirSync(sceneDir, { recursive: true });
    const filePath = join(sceneDir, 'scene-001.md');
    const originalContent = '## 地点\n某处\n## 时间\n某时\n## 在场角色\n某人\n## 经过\n某事';
    writeFileSync(filePath, originalContent, 'utf-8');

    const rc = makeRunContext(tempDir);
    const result = await editFileTool.invoke(
      rc,
      JSON.stringify({ path: 'scenes/scene-001.md', search: '## 经过', replace: '经过' }),
    );

    expect(result).toContain('Invalid scene file content');

    const onDisk = readFileSync(filePath, 'utf-8');
    expect(onDisk).toBe(originalContent);
  });

  test('allows valid edit on character file', async () => {
    const charDir = join(tempDir, 'characters');
    mkdirSync(charDir, { recursive: true });
    const filePath = join(charDir, '贾宝玉.md');
    writeFileSync(filePath, '# 贾宝玉\n> 宝玉初见黛玉', 'utf-8');

    const rc = makeRunContext(tempDir);
    const result = await editFileTool.invoke(
      rc,
      JSON.stringify({ path: 'characters/贾宝玉.md', search: '> 宝玉初见黛玉', replace: '> 宝玉与黛玉结缘' }),
    );

    expect(result).toContain('Successfully edited');

    const onDisk = readFileSync(filePath, 'utf-8');
    expect(onDisk).toBe('# 贾宝玉\n> 宝玉与黛玉结缘');
  });
});

describe('directives path blocking', () => {
  test('writeFileTool rejects directives path', async () => {
    const rc = makeRunContext(tempDir);
    const result = await writeFileTool.invoke(
      rc,
      JSON.stringify({ path: 'characters/test.directives.md', content: 'test' }),
    );

    expect(result).toContain('作者指令文件仅限手动编辑');
  });

  test('editFileTool rejects directives path', async () => {
    const rc = makeRunContext(tempDir);
    const result = await editFileTool.invoke(
      rc,
      JSON.stringify({ path: 'characters/test.directives.md', search: 'a', replace: 'b' }),
    );

    expect(result).toContain('作者指令文件仅限手动编辑');
  });

  test('readFileTool allows directives path', async () => {
    const charDir = join(tempDir, 'characters');
    mkdirSync(charDir, { recursive: true });
    const filePath = join(charDir, 'test.directives.md');
    writeFileSync(filePath, '# directives content', 'utf-8');

    const rc = makeRunContext(tempDir);
    const result = await readFileTool.invoke(
      rc,
      JSON.stringify({ path: 'characters/test.directives.md' }),
    );

    expect(result).toContain('directives content');
  });
});

describe('disallowed path blocking', () => {
  test('writeFileTool rejects .working/ path via isSafePath', async () => {
    const rc = makeRunContext(tempDir);
    const result = await writeFileTool.invoke(
      rc,
      JSON.stringify({ path: '.working/agent-logs.jsonl', content: 'test' }),
    );

    expect(result).toContain('Unsafe path');
  });

  test('editFileTool rejects .working/ path via isSafePath', async () => {
    const rc = makeRunContext(tempDir);
    const result = await editFileTool.invoke(
      rc,
      JSON.stringify({ path: '.working/test.md', search: 'a', replace: 'b' }),
    );

    expect(result).toContain('Unsafe path');
  });

  test('readFileTool rejects .working/ path via isSafePath', async () => {
    const rc = makeRunContext(tempDir);
    const result = await readFileTool.invoke(
      rc,
      JSON.stringify({ path: '.working/test.md' }),
    );

    expect(result).toContain('Unsafe path');
  });

  test('globFilesTool rejects .working/ pattern via isAllowedFilePath', async () => {
    const rc = makeRunContext(tempDir);
    const result = await globFilesTool.invoke(
      rc,
      JSON.stringify({ pattern: '.working' }),
    );

    expect(result).toContain('Disallowed path pattern');
  });

  test('globFilesTool rejects .archive/ pattern via isAllowedFilePath', async () => {
    const rc = makeRunContext(tempDir);
    const result = await globFilesTool.invoke(
      rc,
      JSON.stringify({ pattern: '.archive' }),
    );

    expect(result).toContain('Disallowed path pattern');
  });

  test('writeFileTool rejects non-.md path via isAllowedFilePath', async () => {
    const rc = makeRunContext(tempDir);
    const result = await writeFileTool.invoke(
      rc,
      JSON.stringify({ path: 'data.json', content: '{}' }),
    );

    expect(result).toContain('Disallowed file path');
  });

  test('editFileTool rejects non-.md path via isAllowedFilePath', async () => {
    const rc = makeRunContext(tempDir);
    const result = await editFileTool.invoke(
      rc,
      JSON.stringify({ path: 'notes.txt', search: 'a', replace: 'b' }),
    );

    expect(result).toContain('Disallowed file path');
  });

  test('readFileTool rejects non-.md path via isAllowedFilePath', async () => {
    const rc = makeRunContext(tempDir);
    const result = await readFileTool.invoke(
      rc,
      JSON.stringify({ path: 'data.json' }),
    );

    expect(result).toContain('Disallowed file path');
  });

  test('globFilesTool rejects non-.md pattern via isAllowedFilePath', async () => {
    const rc = makeRunContext(tempDir);
    const result = await globFilesTool.invoke(
      rc,
      JSON.stringify({ pattern: '*.json' }),
    );

    expect(result).toContain('Disallowed path pattern');
  });
});
