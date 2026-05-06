import { describe, test, expect, beforeEach } from "bun:test";
import {
  acquirePipelineLock,
  releasePipelineLock,
  isPipelineRunning,
  getRunningPipelineCount,
  _resetPipelineLocks,
} from "@/pipeline/guard";

function lock(projectId: string): boolean {
  return acquirePipelineLock(projectId);
}

function unlock(projectId: string): void {
  releasePipelineLock(projectId);
}

describe("pipeline guard", () => {
  beforeEach(() => {
    _resetPipelineLocks();
  });

  test("acquirePipelineLock returns true for a new project", () => {
    expect(lock("p001")).toBe(true);
  });

  test("acquirePipelineLock returns false for a project that is already running", () => {
    expect(lock("p001")).toBe(true);
    expect(lock("p001")).toBe(false);
  });

  test("releasePipelineLock allows re-acquire after unlock", () => {
    expect(lock("p001")).toBe(true);
    unlock("p001");
    expect(lock("p001")).toBe(true);
  });

  test("releasePipelineLock is idempotent", () => {
    unlock("p001");
    unlock("p001");
    expect(lock("p001")).toBe(true);
  });

  test("different projects do not block each other", () => {
    expect(lock("p001")).toBe(true);
    expect(lock("p002")).toBe(true);
    expect(lock("p003")).toBe(true);
  });

  test("isPipelineRunning reflects actual state", () => {
    expect(isPipelineRunning("p001")).toBe(false);
    lock("p001");
    expect(isPipelineRunning("p001")).toBe(true);
    unlock("p001");
    expect(isPipelineRunning("p001")).toBe(false);
  });

  test("getRunningPipelineCount tracks active pipelines", () => {
    expect(getRunningPipelineCount()).toBe(0);
    lock("p001");
    expect(getRunningPipelineCount()).toBe(1);
    lock("p002");
    expect(getRunningPipelineCount()).toBe(2);
    unlock("p001");
    expect(getRunningPipelineCount()).toBe(1);
  });

  test("_resetPipelineLocks clears all locks", () => {
    lock("p001");
    lock("p002");
    _resetPipelineLocks();
    expect(getRunningPipelineCount()).toBe(0);
    expect(isPipelineRunning("p001")).toBe(false);
    expect(isPipelineRunning("p002")).toBe(false);
  });
});
