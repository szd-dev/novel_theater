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
  test('sets and gets single call progress', () => {
    const progress: ToolProgress = {
      status: 'running',
      phase: 'analyze',
      step: 1,
      total: 5,
      current: 'Analyzing story structure...',
    };
    setToolProgress('p001', 'call_test_001', progress);
    expect(getToolProgress('p001')).toEqual({ call_test_001: progress });
  });

  test('sets progress for multiple calls on same project', () => {
    const firstProgress: ToolProgress = {
      status: 'completed',
      phase: 'narrate',
      step: 3,
      total: 3,
      current: 'Narration complete',
    };
    const secondProgress: ToolProgress = {
      status: 'running',
      phase: 'dialogue',
      step: 2,
      total: 4,
      current: 'Speaking as Lin Daiyu...',
    };
    setToolProgress('p001', 'call_test_001', firstProgress);
    setToolProgress('p001', 'call_test_002', secondProgress);
    expect(getToolProgress('p001')).toEqual({ call_test_001: firstProgress, call_test_002: secondProgress });
  });

  test('sets progress for multiple projects independently', () => {
    setToolProgress('p001', 'call_test_001', { status: 'completed', phase: 'done', step: 1, total: 1, current: '' });
    setToolProgress('p002', 'call_test_002', { status: 'running', phase: 'start', step: 0, total: 3, current: '' });
    expect(getToolProgress('p001')).toEqual({ call_test_001: { status: 'completed', phase: 'done', step: 1, total: 1, current: '' } });
    expect(getToolProgress('p002')).toEqual({ call_test_002: { status: 'running', phase: 'start', step: 0, total: 3, current: '' } });
  });

  test('clearToolProgress removes only specified callId', () => {
    setToolProgress('p001', 'call_test_001', { status: 'running', phase: 'a', step: 1, total: 2, current: '' });
    setToolProgress('p001', 'call_test_002', { status: 'completed', phase: 'b', step: 2, total: 2, current: '' });
    clearToolProgress('p001', 'call_test_001');
    expect(getToolProgress('p001')).toEqual({ call_test_002: { status: 'completed', phase: 'b', step: 2, total: 2, current: '' } });
  });

  test('clearToolProgress removes project entry when empty', () => {
    setToolProgress('p001', 'call_test_001', { status: 'completed', phase: 'done', step: 1, total: 1, current: '' });
    clearToolProgress('p001', 'call_test_001');
    expect(getToolProgress('p001')).toEqual({});
  });

  test('_resetToolProgress clears everything', () => {
    setToolProgress('p001', 'call_test_001', { status: 'running', phase: 'a', step: 1, total: 1, current: '' });
    setToolProgress('p002', 'call_test_002', { status: 'completed', phase: 'b', step: 1, total: 1, current: '' });
    _resetToolProgress();
    expect(getToolProgress('p001')).toEqual({});
    expect(getToolProgress('p002')).toEqual({});
  });

  test('getToolProgress returns empty object for unknown project', () => {
    expect(getToolProgress('nonexistent')).toEqual({});
  });

  test('clearToolProgress is no-op for unknown project', () => {
    clearToolProgress('nonexistent', 'call_test_001');
    expect(getToolProgress('nonexistent')).toEqual({});
  });

  test('getToolProgress with callId returns single ToolProgress', () => {
    const progress: ToolProgress = {
      status: 'running',
      phase: 'analyze',
      step: 1,
      total: 5,
      current: 'Analyzing...',
    };
    setToolProgress('p001', 'call_test_001', progress);
    setToolProgress('p001', 'call_test_002', { status: 'completed', phase: 'done', step: 1, total: 1, current: '' });
    expect(getToolProgress('p001', 'call_test_001')).toEqual(progress);
  });

  test('getToolProgress with unknown callId returns undefined', () => {
    setToolProgress('p001', 'call_test_001', { status: 'running', phase: 'a', step: 1, total: 2, current: '' });
    expect(getToolProgress('p001', 'nonexistent')).toBeUndefined();
  });

  test('getToolProgress with callId on unknown project returns undefined', () => {
    expect(getToolProgress('nonexistent', 'call_test_001')).toBeUndefined();
  });
});
