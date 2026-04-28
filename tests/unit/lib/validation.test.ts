import { describe, test, expect } from 'bun:test';
import {
  isSafePath,
  isValidCharacterFile,
  isValidSceneFile,
  isDirectivesPath,
  isAllowedFilePath,
} from '@/lib/validation';

describe('isSafePath', () => {
  test('accepts valid relative paths', () => {
    expect(isSafePath('characters/test.md')).toBe(true);
    expect(isSafePath('world.md')).toBe(true);
    expect(isSafePath('scenes/scene-001.md')).toBe(true);
    expect(isSafePath('style.md')).toBe(true);
  });

  test('rejects path traversal', () => {
    expect(isSafePath('../etc/passwd')).toBe(false);
    expect(isSafePath('foo/../../bar')).toBe(false);
  });

  test('rejects absolute paths', () => {
    expect(isSafePath('/absolute/path')).toBe(false);
  });

  test('rejects .working/ prefix', () => {
    expect(isSafePath('.working/logs')).toBe(false);
    expect(isSafePath('.working/latest-interaction.md')).toBe(false);
  });

  test('rejects .archive/ prefix', () => {
    expect(isSafePath('.archive/old')).toBe(false);
    expect(isSafePath('.archive/old/world.md')).toBe(false);
  });
});

describe('isValidCharacterFile', () => {
  test('accepts valid character file', () => {
    expect(isValidCharacterFile('# 林黛玉\n> L0 line')).toBe(true);
    expect(isValidCharacterFile('# Name\n> Some quote\nMore content')).toBe(true);
  });

  test('rejects missing heading', () => {
    expect(isValidCharacterFile('林黛玉\n> L0 line')).toBe(false);
    expect(isValidCharacterFile('## 林黛玉\n> L0 line')).toBe(false);
  });

  test('rejects missing L0 line', () => {
    expect(isValidCharacterFile('# 林黛玉\nSome content')).toBe(false);
  });

  test('rejects empty content', () => {
    expect(isValidCharacterFile('')).toBe(false);
  });
});

describe('isValidSceneFile', () => {
  test('accepts valid scene file with all sections', () => {
    const content = '## 地点\n某处\n## 时间\n某时\n## 在场角色\n某人\n## 初始剧本\n某剧本\n## 经过\n某事';
    expect(isValidSceneFile(content)).toBe(true);
  });

  test('rejects missing sections', () => {
    expect(isValidSceneFile('## 地点\n某处\n## 时间\n某时')).toBe(false);
    expect(isValidSceneFile('## 地点\n某处\n## 时间\n某时\n## 在场角色\n某人')).toBe(false);
    expect(isValidSceneFile('')).toBe(false);
  });

  test('rejects missing 初始剧本', () => {
    expect(isValidSceneFile('## 地点\n某处\n## 时间\n某时\n## 在场角色\n某人\n## 经过\n某事')).toBe(false);
  });
});

describe('isDirectivesPath', () => {
  test('returns true for .directives.md paths', () => {
    expect(isDirectivesPath('characters/test.directives.md')).toBe(true);
    expect(isDirectivesPath('scenes/scene.directives.md')).toBe(true);
  });

  test('returns false for regular .md paths', () => {
    expect(isDirectivesPath('characters/test.md')).toBe(false);
    expect(isDirectivesPath('world.md')).toBe(false);
  });

  test('returns false for directives.md without leading segment', () => {
    expect(isDirectivesPath('directives.md')).toBe(false);
  });
});

describe('isAllowedFilePath', () => {
  test('accepts valid .md paths', () => {
    expect(isAllowedFilePath('world.md')).toBe(true);
    expect(isAllowedFilePath('characters/林黛玉.md')).toBe(true);
    expect(isAllowedFilePath('scenes/scene-001.md')).toBe(true);
    expect(isAllowedFilePath('style.md')).toBe(true);
  });

  test('accepts directory-like patterns (no extension)', () => {
    expect(isAllowedFilePath('characters')).toBe(true);
    expect(isAllowedFilePath('scenes')).toBe(true);
  });

  test('rejects .working/ prefix', () => {
    expect(isAllowedFilePath('.working/agent-logs.jsonl')).toBe(false);
  });

  test('rejects .archive/ prefix', () => {
    expect(isAllowedFilePath('.archive/old/world.md')).toBe(false);
  });

  test('rejects non-.md extensions', () => {
    expect(isAllowedFilePath('data.json')).toBe(false);
    expect(isAllowedFilePath('config.yaml')).toBe(false);
  });

  test('rejects empty/whitespace-only paths', () => {
    expect(isAllowedFilePath('')).toBe(false);
    expect(isAllowedFilePath('   ')).toBe(false);
  });

  test('rejects absolute paths', () => {
    expect(isAllowedFilePath('/absolute.md')).toBe(false);
  });

  test('rejects paths with null bytes', () => {
    expect(isAllowedFilePath('world\0.md')).toBe(false);
  });
});
