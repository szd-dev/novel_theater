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
} from '@/tools/submit-schedule';

const mockRunEnactPhase = jest.fn();
const mockRunScribeAndArchivist = jest.fn();
const mockSetToolProgress = jest.fn();
const mockClearToolProgress = jest.fn();

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

const schedule = [
  { character: '塞莉娅', direction: '走进酒馆，环顾四周' },
];
const narrativeSummary = '塞莉娅初次来到边境小镇的酒馆';

beforeEach(() => {
  mockRunEnactPhase.mockReset();
  mockRunScribeAndArchivist.mockReset();
  mockSetToolProgress.mockReset();
  mockClearToolProgress.mockReset();

  mockRunEnactPhase.mockResolvedValue({
    steps: [{ character: '塞莉娅', status: 'success' as const }],
    interactionLog: '',
  });
  mockRunScribeAndArchivist.mockResolvedValue({
    scribeOutput: '文学化的叙事文本',
    archivistDone: true,
  });

  _setRunEnactPhase(mockRunEnactPhase);
  _setRunScribeAndArchivist(mockRunScribeAndArchivist);
  _setSetToolProgress(mockSetToolProgress);
  _setClearToolProgress(mockClearToolProgress);
});

describe('submitScheduleTool', () => {
  test('calls runEnactPhase with correct arguments', async () => {
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
    );
  });

  test('calls runScribeAndArchivist with correct arguments', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockRunScribeAndArchivist).toHaveBeenCalledTimes(1);
    expect(mockRunScribeAndArchivist).toHaveBeenCalledWith(
      narrativeSummary,
      '/tmp/test-project/.novel',
    );
  });

  test('sets progress before enact phase', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockSetToolProgress).toHaveBeenCalledWith(
      'test-project',
      'submit_schedule',
      {
        status: 'running',
        phase: 'actor',
        step: 0,
        total: 4,
        current: '开始',
      },
    );
  });

  test('sets progress before scribe phase', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockSetToolProgress).toHaveBeenCalledWith(
      'test-project',
      'submit_schedule',
      {
        status: 'running',
        phase: 'scribe',
        step: 2,
        total: 4,
        current: 'Scribe',
      },
    );
  });

  test('sets completed progress after archivist', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockSetToolProgress).toHaveBeenCalledWith(
      'test-project',
      'submit_schedule',
      {
        status: 'completed',
        phase: 'archivist',
        step: 4,
        total: 4,
        current: '完成',
      },
    );
  });

  test('clears progress on success', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    expect(mockClearToolProgress).toHaveBeenCalledTimes(1);
    expect(mockClearToolProgress).toHaveBeenCalledWith(
      'test-project',
      'submit_schedule',
    );
  });

  test('returns toolResult with scribeOutput and steps on success', async () => {
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
  });

  test('returns toolError and clears progress on enact phase error', async () => {
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
      'submit_schedule',
    );
    expect(mockRunScribeAndArchivist).not.toHaveBeenCalled();
  });

  test('returns toolError and clears progress on scribe/archivist error', async () => {
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
      'submit_schedule',
    );
    expect(mockRunEnactPhase).toHaveBeenCalledTimes(1);
  });

  test('handles non-Error exceptions', async () => {
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
    );
  });

  test('total = schedule.length + 3', async () => {
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
      'submit_schedule',
      {
        status: 'running',
        phase: 'actor',
        step: 0,
        total: 8,
        current: '开始',
      },
    );
    expect(mockSetToolProgress).toHaveBeenCalledWith(
      'test-project',
      'submit_schedule',
      {
        status: 'running',
        phase: 'scribe',
        step: 6,
        total: 8,
        current: 'Scribe',
      },
    );
  });

  test('progress calls are made in correct order', async () => {
    const rc = makeRunContext();

    await submitScheduleTool.invoke(
      rc,
      JSON.stringify({ schedule, narrativeSummary }),
    );

    const calls = mockSetToolProgress.mock.calls;
    expect(calls).toHaveLength(3);

    expect(calls[0][2].phase).toBe('actor');
    expect(calls[0][2].status).toBe('running');

    expect(calls[1][2].phase).toBe('scribe');
    expect(calls[1][2].status).toBe('running');

    expect(calls[2][2].phase).toBe('archivist');
    expect(calls[2][2].status).toBe('completed');
  });
});
