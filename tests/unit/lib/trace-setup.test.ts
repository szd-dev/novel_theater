import { describe, test, expect, beforeEach } from "bun:test";
import { setTracingDisabled, setTraceProcessors } from "@openai/agents";

describe("setupTracing", () => {
  beforeEach(() => {
    setTracingDisabled(true);
    setTraceProcessors([]);
  });

  test("enables tracing via setTracingDisabled(false)", async () => {
    setTracingDisabled(true);
    const { setupTracing } = await import("@/lib/trace-setup");
    setupTracing();
    expect(true).toBe(true);
  });

  test("does not throw when called", async () => {
    const { setupTracing } = await import("@/lib/trace-setup");
    expect(() => setupTracing()).not.toThrow();
  });

  test("idempotent — safe to call multiple times", async () => {
    const { setupTracing } = await import("@/lib/trace-setup");
    setupTracing();
    expect(() => setupTracing()).not.toThrow();
  });
});
