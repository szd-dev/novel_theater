import type { AgentInputItem } from '@openai/agents';

function isUserMessage(item: AgentInputItem): boolean {
  const i = item as Record<string, unknown>;
  return i.type === 'message' && i.role === 'user';
}

function isSubmitScheduleCall(item: AgentInputItem): boolean {
  const i = item as Record<string, unknown>;
  return (i.type === 'hosted_tool_call' || i.type === 'function_call')
    && i.name === 'submit_schedule';
}

export function findTruncationPoint(items: AgentInputItem[]): number {
  const scheduleIdxs: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (isSubmitScheduleCall(items[i])) scheduleIdxs.push(i);
  }

  if (scheduleIdxs.length < 2) return 0;

  const targetIdx = scheduleIdxs[scheduleIdxs.length - 2];

  for (let i = targetIdx - 1; i >= 0; i--) {
    if (isUserMessage(items[i])) return i;
  }

  return 0;
}
