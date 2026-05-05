export interface ToolProgress {
  status: 'running' | 'completed';
  phase: string;
  step: number;
  total: number;
  current: string;
}

const store = new Map<string, Map<string, ToolProgress>>();

export function setToolProgress(
  projectId: string,
  toolName: string,
  progress: ToolProgress,
): void {
  let inner = store.get(projectId);
  if (!inner) {
    inner = new Map<string, ToolProgress>();
    store.set(projectId, inner);
  }
  inner.set(toolName, progress);
}

export function getToolProgress(
  projectId: string,
): Record<string, ToolProgress> {
  const inner = store.get(projectId);
  if (!inner) return {};
  return Object.fromEntries(inner);
}

export function clearToolProgress(
  projectId: string,
  toolName: string,
): void {
  const inner = store.get(projectId);
  if (!inner) return;
  inner.delete(toolName);
  if (inner.size === 0) {
    store.delete(projectId);
  }
}

export function _resetToolProgress(): void {
  store.clear();
}
