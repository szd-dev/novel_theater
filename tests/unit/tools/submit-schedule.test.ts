import { describe, test, expect } from 'bun:test';
import { Agent, RunContext } from '@openai/agents';
import { submitScheduleTool } from '@/tools/submit-schedule';

function makeRunContext() {
  const agent = new Agent({ name: 'test-agent' });
  return new RunContext(agent);
}

describe('submitScheduleTool', () => {
  test('returns accepted confirmation for valid input', async () => {
    const rc = makeRunContext();
    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({
        schedule: [
          { character: '塞莉娅', direction: '走进酒馆，环顾四周' },
          { character: '老酒保', direction: '擦拭酒杯，抬头看来人' },
        ],
        narrativeSummary: '塞莉娅初次来到边境小镇的酒馆',
      }),
    );

    const parsed = JSON.parse(JSON.parse(result).data);
    expect(parsed.accepted).toBe(true);
    expect(parsed.steps).toBe(2);
    expect(parsed.message).toContain('请勿输出叙事内容');
  });

  test('returns correct step count for single item', async () => {
    const rc = makeRunContext();
    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({
        schedule: [{ character: '塞莉娅', direction: '独白' }],
        narrativeSummary: '简短独白场景',
      }),
    );

    const parsed = JSON.parse(JSON.parse(result).data);
    expect(parsed.accepted).toBe(true);
    expect(parsed.steps).toBe(1);
  });

  test('returns correct step count for max items (10)', async () => {
    const rc = makeRunContext();
    const schedule = Array.from({ length: 10 }, (_, i) => ({
      character: `角色${i + 1}`,
      direction: `指示${i + 1}`,
    }));
    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({
        schedule,
        narrativeSummary: '大型群像场景',
      }),
    );

    const parsed = JSON.parse(JSON.parse(result).data);
    expect(parsed.accepted).toBe(true);
    expect(parsed.steps).toBe(10);
  });

  test('rejects empty schedule (0 items) via Zod validation', async () => {
    const rc = makeRunContext();
    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({
        schedule: [],
        narrativeSummary: '空场景',
      }),
    );
    expect(result).toContain('InvalidToolInputError');
  });

  test('rejects schedule with more than 10 items via Zod validation', async () => {
    const rc = makeRunContext();
    const schedule = Array.from({ length: 11 }, (_, i) => ({
      character: `角色${i + 1}`,
      direction: `指示${i + 1}`,
    }));
    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({
        schedule,
        narrativeSummary: '超出限制的场景',
      }),
    );
    expect(result).toContain('InvalidToolInputError');
  });

  test('result is wrapped in toolResult format', async () => {
    const rc = makeRunContext();
    const result = await submitScheduleTool.invoke(
      rc,
      JSON.stringify({
        schedule: [{ character: '塞莉娅', direction: '测试' }],
        narrativeSummary: '测试',
      }),
    );

    const outer = JSON.parse(result);
    expect(outer.ok).toBe(true);
    expect(typeof outer.data).toBe('string');

    const inner = JSON.parse(outer.data);
    expect(inner.accepted).toBe(true);
    expect(inner.steps).toBe(1);
    expect(inner.message).toContain('请勿输出叙事内容');
  });
});
