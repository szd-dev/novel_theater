const runningPipelines = new Set<string>();

export function acquirePipelineLock(projectId: string): boolean {
  if (runningPipelines.has(projectId)) {
    return false;
  }
  runningPipelines.add(projectId);
  return true;
}

export function releasePipelineLock(projectId: string): void {
  runningPipelines.delete(projectId);
}

export function isPipelineRunning(projectId: string): boolean {
  return runningPipelines.has(projectId);
}

export function getRunningPipelineCount(): number {
  return runningPipelines.size;
}

export function _resetPipelineLocks(): void {
  runningPipelines.clear();
}
