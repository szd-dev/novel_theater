import { describe, test, expect, beforeEach } from 'bun:test';
import {
  setToolProgress,
  getToolProgress,
  clearToolProgress,
  _resetToolProgress,
} from '@/lib/tool-progress';
import type { ToolProgress } from '@/lib/tool-progress';

beforeEach(() => {
  _resetToolProgress();
});

describe('tool-progress', () => {
  test('sets and gets single tool progress', () => {
    const progress: ToolProgress = {
      status: 'running',
      phase: 'analyze',
      step: 1,
      total: 5,
      current: 'Analyzing story structure...',
    };
    setToolProgress('p001', 'gm', progress);
    expect(getToolProgress('p001')).toEqual({ gm: progress });
  });

  test('sets progress for multiple tools on same project', () => {
    const gmProgress: ToolProgress = {
      status: 'completed',
      phase: 'narrate',
      step: 3,
      total: 3,
      current: 'Narration complete',
    };
    const actorProgress: ToolProgress = {
      status: 'running',
      phase: 'dialogue',
      step: 2,
      total: 4,
      current: 'Speaking as Lin Daiyu...',
    };
    setToolProgress('p001', 'gm', gmProgress);
    setToolProgress('p001', 'actor', actorProgress);
    expect(getToolProgress('p001')).toEqual({ gm: gmProgress, actor: actorProgress });
  });

  test('sets progress for multiple projects independently', () => {
    setToolProgress('p001', 'gm', { status: 'completed', phase: 'done', step: 1, total: 1, current: '' });
    setToolProgress('p002', 'actor', { status: 'running', phase: 'start', step: 0, total: 3, current: '' });
    expect(getToolProgress('p001')).toEqual({ gm: { status: 'completed', phase: 'done', step: 1, total: 1, current: '' } });
    expect(getToolProgress('p002')).toEqual({ actor: { status: 'running', phase: 'start', step: 0, total: 3, current: '' } });
  });

  test('clearToolProgress removes only specified tool', () => {
    setToolProgress('p001', 'gm', { status: 'running', phase: 'a', step: 1, total: 2, current: '' });
    setToolProgress('p001', 'actor', { status: 'completed', phase: 'b', step: 2, total: 2, current: '' });
    clearToolProgress('p001', 'gm');
    expect(getToolProgress('p001')).toEqual({ actor: { status: 'completed', phase: 'b', step: 2, total: 2, current: '' } });
  });

  test('clearToolProgress removes project entry when empty', () => {
    setToolProgress('p001', 'gm', { status: 'completed', phase: 'done', step: 1, total: 1, current: '' });
    clearToolProgress('p001', 'gm');
    expect(getToolProgress('p001')).toEqual({});
  });

  test('_resetToolProgress clears everything', () => {
    setToolProgress('p001', 'gm', { status: 'running', phase: 'a', step: 1, total: 1, current: '' });
    setToolProgress('p002', 'actor', { status: 'completed', phase: 'b', step: 1, total: 1, current: '' });
    _resetToolProgress();
    expect(getToolProgress('p001')).toEqual({});
    expect(getToolProgress('p002')).toEqual({});
  });

  test('getToolProgress returns empty object for unknown project', () => {
    expect(getToolProgress('nonexistent')).toEqual({});
  });

  test('clearToolProgress is no-op for unknown project', () => {
    clearToolProgress('nonexistent', 'gm');
    expect(getToolProgress('nonexistent')).toEqual({});
  });
});
