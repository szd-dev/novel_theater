import { describe, test, expect, beforeEach, jest } from 'bun:test';
import { Agent, RunContext } from '@openai/agents';

import {
  submitScheduleTool,
  _setRunEnactPhase,
  _resetRunEnactPhase,
  _setRunScribeAndArchivist,
  _resetRunScribeAndArchivist,
  _setSetToolProgress,
  _resetSetToolProgress,
  _setClearToolProgress,
  _resetClearToolProgress,
  _setFindLatestScene,
  _resetFindLatestScene,
  _setReadNovelFile,
  _resetReadNovelFile,
  _setWriteNovelFile,
  _resetWriteNovelFile,
} from '@/tools/submit-schedule';

const schedule = [
  { character: '塞莉娅', direction: '走进酒馆，环顾四周' },
];
const narrativeSummary = '塞莉娅初次来到边境小镇的酒馆';

const mockRunEnactPhase = jest.fn();
const mockRunScribeAndArchivist = jest.fn();
const mockSetToolProgress = jest.fn();
const mockClearToolProgress = jest.fn();
const mockFindLatestScene = jest.fn();
const mockReadNovelFile = jest.fn();
const mockWriteNovelFile = jest.fn();

function makeRunContext(overrides: Partial<{
  projectId: string;
  projectDir: string;
  storyDir: string;
}> = {}) {
  const agent = new Agent({ name: 'test-agent' });
  const rc = new RunContext(agent);
  (rc as unknown as Record<string, unknown>).context = {
    projectId: 'test-project',
    projectDir: '/tmp/test-project',
    storyDir: '/tmp/test-project/.novel',
    ...overrides,
  };
  return rc;
}

beforeEach(() => {
  mockRunEnactPhase.mockReset();
  mockRunScribeAndArchivist.mockReset();
  mockSetToolProgress.mockReset();
  mockClearToolProgress.mockReset();
  mockFindLatestScene.mockReset();
  mockReadNovelFile.mockReset();
  mockWriteNovelFile.mockReset();

  mockRunEnactPhase.mockImplementation(async (_schedule, _storyDir, _projectId, _projectDir, opts) => {
    if (opts?.onProgress) {
      for (let i = 0; i < (_schedule as typeof schedule).length; i++) {
        opts.onProgress({
          status: 'running',
          phase: 'actor',
          step: i + 1,
          total: opts.totalSteps,
          current: (_schedule as typeof schedule)[i].character,
        });
      }
    }
    const steps = (_schedule as typeof schedule).map(s => ({
      character: s.character,
      status: 'success' as const,
    }));
    return { steps, interactionLog: '' };
  });

  mockRunScribeAndArchivist.mockImplementation(async (_narrativeSummary, _storyDir, opts) => {
    if (opts?.onProgress) {
      opts.onProgress({
        status: 'running',
        phase: 'scribe',
        step: opts.totalSteps - 4,
        total: opts.totalSteps,
        current: 'Scribe',
      });
      opts.onProgress({
        status: 'running',
        phase: 'archivist',
        step: opts.totalSteps - 3,
        total: opts.totalSteps,
        current: '角色更新',
      });
      opts.onProgress({
        status: 'running',
        phase: 'archivist',
        step: opts.totalSteps - 2,
        total: opts.totalSteps,
        current: '场景/世界/剧情/时间线',
      });
      opts.onProgress({
        status: 'running',
        phase: 'archivist',
        step: opts.totalSteps - 1,
        total: opts.totalSteps,
        current: '伏笔更新',
      });
    }
    return { scribeOutput: '文学化的叙事文本', archivistDone: true };
  });

  mockFindLatestScene.mockImplementation(async () => 's001.md');
  mockReadNovelFile.mockImplementation(async () => '# 场景 s001\n## 地点\n酒馆\n## 时间\n清晨\n');
  mockWriteNovelFile.mockImplementation(async () => {});

  _setRunEnactPhase(mockRunEnactPhase);
  _setRunScribeAndArchivist(mockRunScribeAndArchivist);
  _setSetToolProgress(mockSetToolProgress);
  _setClearToolProgress(mockClearToolProgress);
  _setFindLatestScene(mockFindLatestScene);
  _setReadNovelFile(mockReadNovelFile);
  _setWriteNovelFile(mockWriteNovelFile);
});

describe('submitScheduleTool', () => {
  test('calls runEnactPhase with correct arguments including opts', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockRunEnactPhase).toHaveBeenCalledTimes(1);
    expect(mockRunEnactPhase).toHaveBeenCalledWith(
      schedule,
      '/tmp/test-project/.novel',
      'test-project',
      '/tmp/test-project',
      expect.objectContaining({
        onProgress: expect.any(Function),
        totalSteps: 6,
      }),
    );
  });

  test('calls runScribeAndArchivist with correct arguments including opts', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockRunScribeAndArchivist).toHaveBeenCalledTimes(1);
    expect(mockRunScribeAndArchivist).toHaveBeenCalledWith(
      narrativeSummary,
      '/tmp/test-project/.novel',
      expect.objectContaining({
        onProgress: expect.any(Function),
        totalSteps: 6,
      }),
    );
  });

  test('onProgress triggers progress with callId during actor phase', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockSetToolProgress).toHaveBeenCalledWith(
      'test-project',
      expect.any(String),
      expect.objectContaining({
        status: 'running',
        phase: 'actor',
        step: 1,
        total: 6,
        current: '塞莉娅',
      }),
    );
  });

  test('onProgress triggers progress with callId during scribe phase', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const scribeCall = mockSetToolProgress.mock.calls.find(
      (call: unknown[]) => (call[2] as Record<string, unknown>).phase === 'scribe',
    );
    expect(scribeCall).toBeDefined();
    expect(scribeCall[0]).toBe('test-project');
    expect(scribeCall[2]).toMatchObject({
      status: 'running',
      phase: 'scribe',
      step: 2,
      total: 6,
      current: 'Scribe',
    });
  });

  test('onProgress triggers progress with callId during archivist phase', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const archivistCalls = mockSetToolProgress.mock.calls.filter(
      (call: unknown[]) => (call[2] as Record<string, unknown>).phase === 'archivist',
    );
    expect(archivistCalls.length).toBeGreaterThanOrEqual(1);
    expect(archivistCalls[0][2]).toMatchObject({
      status: 'running',
      phase: 'archivist',
      total: 6,
    });
  });

  test('clears progress with callId on success', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockClearToolProgress).toHaveBeenCalledTimes(1);
    expect(mockClearToolProgress).toHaveBeenCalledWith(
      'test-project',
      expect.stringMatching(/^pipeline-test-project-\d+$/),
    );
  });

  test('returns toolResult with scribeOutput, steps, and callId on success', async () => {
    const rc = makeRunContext();

    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const outer = JSON.parse(result);
    expect(outer.ok).toBe(true);
    expect(typeof outer.data).toBe('string');

    const inner = JSON.parse(outer.data);
    expect(inner.scribeOutput).toBe('文学化的叙事文本');
    expect(inner.steps).toEqual([
      { character: '塞莉娅', status: 'success' },
    ]);
    expect(typeof inner.callId).toBe('string');
    expect(inner.callId).toMatch(/^pipeline-test-project-/);
  });

  test('returns toolError and clears progress on enact phase error', async () => {
    mockRunEnactPhase.mockReset();
    mockRunEnactPhase.mockRejectedValue(new Error('Actor 塞莉娅 failed'));

    const rc = makeRunContext();
    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const outer = JSON.parse(result);
    expect(outer.ok).toBe(false);
    expect(outer.error).toBe('Actor 塞莉娅 failed');

    expect(mockClearToolProgress).toHaveBeenCalledTimes(1);
    expect(mockClearToolProgress).toHaveBeenCalledWith(
      'test-project',
      expect.stringMatching(/^pipeline-test-project-/),
    );
    expect(mockRunScribeAndArchivist).not.toHaveBeenCalled();
  });

  test('returns toolError and clears progress on scribe/archivist error', async () => {
    mockRunScribeAndArchivist.mockReset();
    mockRunScribeAndArchivist.mockRejectedValue(new Error('Scribe timeout'));

    const rc = makeRunContext();
    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const outer = JSON.parse(result);
    expect(outer.ok).toBe(false);
    expect(outer.error).toBe('Scribe timeout');

    expect(mockClearToolProgress).toHaveBeenCalledTimes(1);
    expect(mockClearToolProgress).toHaveBeenCalledWith(
      'test-project',
      expect.stringMatching(/^pipeline-test-project-/),
    );
    expect(mockRunEnactPhase).toHaveBeenCalledTimes(1);
  });

  test('handles non-Error exceptions', async () => {
    mockRunEnactPhase.mockReset();
    mockRunEnactPhase.mockRejectedValue('string error');

    const rc = makeRunContext();
    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const outer = JSON.parse(result);
    expect(outer.ok).toBe(false);
    expect(outer.error).toBe('string error');
    expect(mockClearToolProgress).toHaveBeenCalledTimes(1);
  });

  test('computes storyDir from projectDir when storyDir is not in context', async () => {
    const rc = makeRunContext({ storyDir: undefined });

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockRunEnactPhase).toHaveBeenCalledWith(
      schedule,
      '/tmp/test-project/.novel',
      'test-project',
      '/tmp/test-project',
      expect.objectContaining({
        onProgress: expect.any(Function),
        totalSteps: 6,
      }),
    );
  });

  test('total = schedule.length + 5', async () => {
    const rc = makeRunContext();
    const bigSchedule = [
      { character: 'A', direction: 'a' },
      { character: 'B', direction: 'b' },
      { character: 'C', direction: 'c' },
      { character: 'D', direction: 'd' },
      { character: 'E', direction: 'e' },
    ];

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule: bigSchedule, narrativeSummary }),
    );

    expect(mockSetToolProgress).toHaveBeenCalledWith(
      'test-project',
      expect.any(String),
      expect.objectContaining({
        status: 'running',
        phase: 'actor',
        step: 1,
        total: 10,
      }),
    );

    const scribeCall = mockSetToolProgress.mock.calls.find(
      (call: unknown[]) => (call[2] as Record<string, unknown>).phase === 'scribe',
    );
    expect(scribeCall[2]).toMatchObject({
      phase: 'scribe',
      step: 6,
      total: 10,
    });
  });

  test('progress calls are made in correct order', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const calls = mockSetToolProgress.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(5);

    const phases = calls.map((c: unknown[]) => (c[2] as Record<string, unknown>).phase);
    expect(phases[0]).toBe('actor');
    expect(phases[1]).toBe('scribe');
  });

  test('same callId is used for all progress calls in one invocation', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const callIds = mockSetToolProgress.mock.calls.map((c: unknown[]) => c[1]);
    expect(callIds.length).toBeGreaterThanOrEqual(1);
    expect(new Set(callIds).size).toBe(1);
  });

  test('clearToolProgress uses same callId as setToolProgress', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const progressCallId = mockSetToolProgress.mock.calls[0][1];
    const clearCallId = mockClearToolProgress.mock.calls[0][1];
    expect(clearCallId).toBe(progressCallId);
  });
});
