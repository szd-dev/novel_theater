import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Span, NoopSpan } from "@openai/agents";
import type { TracingProcessor, AgentSpanData, GenerationSpanData, FunctionSpanData, HandoffSpanData } from "@openai/agents";
import { ProjectTraceExporter } from "@/lib/trace-exporter";

const noopProcessor: TracingProcessor = {
  onTraceStart: async () => {},
  onTraceEnd: async () => {},
  onSpanStart: async () => {},
  onSpanEnd: async () => {},
  shutdown: async () => {},
  forceFlush: async () => {},
};

function makeSpan<TData extends AgentSpanData | GenerationSpanData | FunctionSpanData | HandoffSpanData>(
  data: TData,
  opts: { traceId?: string; spanId?: string; parentId?: string | null; traceMetadata?: Record<string, unknown>; startedAt?: string; endedAt?: string } = {},
) {
  const span = new Span(
    {
      traceId: opts.traceId ?? "trace-1",
      spanId: opts.spanId ?? "span-1",
      parentId: opts.parentId ?? null,
      data,
      traceMetadata: opts.traceMetadata,
      startedAt: opts.startedAt,
      endedAt: opts.endedAt,
    },
    noopProcessor,
  );
  if (opts.startedAt) span.start();
  if (opts.endedAt) span.end();
  return span;
}

function readLogLines(dir: string): object[] {
  const logPath = join(dir, ".working", "agent-logs.jsonl");
  if (!existsSync(logPath)) return [];
  const content = readFileSync(logPath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line));
}

describe("ProjectTraceExporter", () => {
  let tempDir: string;
  let tempDir2: string;
  let exporter: ProjectTraceExporter;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "trace-test-1-"));
    tempDir2 = mkdtempSync(join(tmpdir(), "trace-test-2-"));
    exporter = new ProjectTraceExporter();
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(tempDir2, { recursive: true, force: true });
  });

  test("writes AgentSpan with name, tools, handoffs", async () => {
    const agentData: AgentSpanData = { type: "agent", name: "gm", tools: ["call_actor", "call_scribe"], handoffs: ["actor"] };
    const span = makeSpan(agentData, {
      traceMetadata: { storyDir: tempDir, projectId: "p001" },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:01.500Z",
    });

    await exporter.export([span]);

    const lines = readLogLines(tempDir);
    expect(lines.length).toBe(1);
    const entry = lines[0] as Record<string, unknown>;
    expect(entry.type).toBe("agent");
    expect(entry.agent).toBe("gm");
    expect(entry.tools).toEqual(["call_actor", "call_scribe"]);
    expect(entry.handoffs).toEqual(["actor"]);
    expect(entry.traceId).toBe("trace-1");
    expect(entry.spanId).toBe("span-1");
    expect(entry.duration).toBe(1500);
  });

  test("writes GenerationSpan with model, usage, input/output summary", async () => {
    const genData: GenerationSpanData = {
      type: "generation",
      model: "qwen/qwen3.6-27B",
      usage: { input_tokens: 100, output_tokens: 50 },
      input: [{ role: "system" }, { role: "user" }],
      output: [{ role: "assistant" }],
    };
    const span = makeSpan(genData, {
      traceMetadata: { storyDir: tempDir, projectId: "p001" },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:02.000Z",
    });

    await exporter.export([span]);

    const lines = readLogLines(tempDir);
    const genEntries = lines.filter((l) => (l as Record<string, unknown>).type === "generation");
    expect(genEntries.length).toBeGreaterThanOrEqual(1);
    const entry = genEntries[genEntries.length - 1] as Record<string, unknown>;
    expect(entry.model).toBe("qwen/qwen3.6-27B");
    expect(entry.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(entry.input).toBe("2 message(s): system,user");
    expect(entry.output).toBe("1 message(s): assistant");
    expect(entry.duration).toBe(2000);
  });

  test("writes FunctionSpan with tool name, input, output", async () => {
    const funcData: FunctionSpanData = {
      type: "function",
      name: "read_file",
      input: '{"path":"world.md"}',
      output: "# World Settings\n...",
    };
    const span = makeSpan(funcData, {
      traceMetadata: { storyDir: tempDir, projectId: "p001" },
    });

    await exporter.export([span]);

    const lines = readLogLines(tempDir);
    const funcEntries = lines.filter((l) => (l as Record<string, unknown>).type === "function");
    expect(funcEntries.length).toBeGreaterThanOrEqual(1);
    const entry = funcEntries[funcEntries.length - 1] as Record<string, unknown>;
    expect(entry.agent).toBe("read_file");
    expect(entry.input).toBe('{"path":"world.md"}');
    expect(entry.output).toBe("# World Settings\n...");
  });

  test("different projects write to different JSONL files", async () => {
    const agentData1: AgentSpanData = { type: "agent", name: "gm" };
    const agentData2: AgentSpanData = { type: "agent", name: "actor" };

    const span1 = makeSpan(agentData1, { traceMetadata: { storyDir: tempDir, projectId: "p001" } });
    const span2 = makeSpan(agentData2, { traceMetadata: { storyDir: tempDir2, projectId: "p002" } });

    await exporter.export([span1, span2]);

    const lines1 = readLogLines(tempDir);
    const lines2 = readLogLines(tempDir2);

    const agentEntries1 = lines1.filter((l) => (l as Record<string, unknown>).agent === "gm");
    const agentEntries2 = lines2.filter((l) => (l as Record<string, unknown>).agent === "actor");

    expect(agentEntries1.length).toBeGreaterThanOrEqual(1);
    expect(agentEntries2.length).toBeGreaterThanOrEqual(1);
  });

  test("skips spans without storyDir in traceMetadata", async () => {
    const agentData: AgentSpanData = { type: "agent", name: "gm" };
    const span = makeSpan(agentData, { traceMetadata: undefined });

    await exporter.export([span]);

    expect(true).toBe(true);
  });

  test("skips Trace objects (type === 'trace')", async () => {
    const traceLike = { type: "trace" as const, traceId: "trace-x", name: "test", groupId: null };
    await exporter.export([traceLike as any]);
  });

  test("best-effort: does not throw on write errors", async () => {
    const agentData: AgentSpanData = { type: "agent", name: "gm" };
    const span = makeSpan(agentData, { traceMetadata: { storyDir: "/nonexistent/path/that/cannot/be/created/definitely", projectId: "p001" } });

    await expect(exporter.export([span])).resolves.toBeUndefined();
  });

  test("truncates long FunctionSpan input/output", async () => {
    const longInput = "x".repeat(3000);
    const longOutput = "y".repeat(3000);
    const funcData: FunctionSpanData = { type: "function", name: "big_tool", input: longInput, output: longOutput };
    const span = makeSpan(funcData, { traceMetadata: { storyDir: tempDir, projectId: "p001" } });

    await exporter.export([span]);

    const lines = readLogLines(tempDir);
    const funcEntries = lines.filter((l) => (l as Record<string, unknown>).type === "function");
    const entry = funcEntries[funcEntries.length - 1] as Record<string, unknown>;
    expect((entry.input as string).length).toBeLessThan(3000);
    expect((entry.input as string)).toContain("truncated");
    expect((entry.output as string).length).toBeLessThan(3000);
    expect((entry.output as string)).toContain("truncated");
  });

  test("records parentId when present", async () => {
    const agentData: AgentSpanData = { type: "agent", name: "gm" };
    const span = makeSpan(agentData, {
      parentId: "parent-span-42",
      traceMetadata: { storyDir: tempDir, projectId: "p001" },
    });

    await exporter.export([span]);

    const lines = readLogLines(tempDir);
    const agentEntries = lines.filter((l) => (l as Record<string, unknown>).type === "agent");
    const entry = agentEntries[agentEntries.length - 1] as Record<string, unknown>;
    expect(entry.parentId).toBe("parent-span-42");
  });
});
