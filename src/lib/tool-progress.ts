export interface ToolProgress {
  status: 'running' | 'completed';
  phase: string;
  step: number;
  total: number;
  current: string;
}

// Outer Map key: projectId, Inner Map key: callId
const store = new Map<string, Map<string, ToolProgress>>();

export function setToolProgress(
  projectId: string,
  callId: string,
  progress: ToolProgress,
): void {
  let inner = store.get(projectId);
  if (!inner) {
    inner = new Map<string, ToolProgress>();
    store.set(projectId, inner);
  }
  inner.set(callId, progress);
}

export function getToolProgress(
  projectId: string,
): Record<string, ToolProgress>;
export function getToolProgress(
  projectId: string,
  callId: string,
): ToolProgress | undefined;
export function getToolProgress(
  projectId: string,
  callId?: string,
): Record<string, ToolProgress> | ToolProgress | undefined {
  const inner = store.get(projectId);
  if (!inner) return callId ? undefined : {};
  if (callId) return inner.get(callId);
  return Object.fromEntries(inner);
}

export function clearToolProgress(
  projectId: string,
  callId: string,
): void {
  const inner = store.get(projectId);
  if (!inner) return;
  inner.delete(callId);
  if (inner.size === 0) {
    store.delete(projectId);
  }
}

export function _resetToolProgress(): void {
  store.clear();
}
