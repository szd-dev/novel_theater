import { join } from "node:path";
import { mkdirSync, appendFileSync } from "node:fs";
import type { TracingExporter, Trace, Span, SpanData, AgentSpanData, GenerationSpanData, FunctionSpanData } from "@openai/agents";

interface TraceLogEntry {
  timestamp: string;
  traceId: string;
  spanId: string;
  parentId: string | null;
  type: string;
  agent?: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  input?: string;
  output?: string;
  tools?: string[];
  handoffs?: string[];
  duration?: number;
}

function extractEntry(span: Span<SpanData>): TraceLogEntry | null {
  const data = span.spanData;
  const startedAt = span.startedAt ? new Date(span.startedAt).getTime() : null;
  const endedAt = span.endedAt ? new Date(span.endedAt).getTime() : null;
  const duration = startedAt != null && endedAt != null ? endedAt - startedAt : undefined;

  const base: TraceLogEntry = {
    timestamp: new Date().toISOString(),
    traceId: span.traceId,
    spanId: span.spanId,
    parentId: span.parentId,
    type: data.type,
    duration,
  };

  switch (data.type) {
    case "agent": {
      const agentData = data as AgentSpanData;
      return {
        ...base,
        agent: agentData.name,
        tools: agentData.tools,
        handoffs: agentData.handoffs,
      };
    }
    case "generation": {
      const genData = data as GenerationSpanData;
      return {
        ...base,
        model: genData.model,
        usage: {
          inputTokens: genData.usage?.input_tokens,
          outputTokens: genData.usage?.output_tokens,
        },
        input: summarizeMessages(genData.input),
        output: summarizeMessages(genData.output),
      };
    }
    case "function": {
      const funcData = data as FunctionSpanData;
      return {
        ...base,
        agent: funcData.name,
        input: truncate(funcData.input, 2000),
        output: truncate(funcData.output, 2000),
      };
    }
    default:
      return { ...base };
  }
}

function summarizeMessages(messages: Array<Record<string, unknown>> | undefined): string | undefined {
  if (!messages || messages.length === 0) return undefined;
  const count = messages.length;
  const roles = messages.map((m) => m.role ?? "unknown").join(",");
  return `${count} message(s): ${roles}`;
}

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen) + `… [truncated, ${value.length} chars total]`;
}

function ensureLogPath(storyDir: string): string {
  const workingDir = join(storyDir, ".working");
  mkdirSync(workingDir, { recursive: true });
  return join(workingDir, "agent-logs.jsonl");
}

/**
 * ProjectTraceExporter implements TracingExporter from @openai/agents.
 * Writes span data to {storyDir}/.working/agent-logs.jsonl per project.
 * Reads projectId and storyDir from the Trace's metadata field.
 * Best-effort writing — never throws, never blocks Agent execution.
 */
export class ProjectTraceExporter implements TracingExporter {
  async export(items: (Trace | Span<SpanData>)[]): Promise<void> {
    try {
      const byStoryDir = new Map<string, Span<SpanData>[]>();

      for (const item of items) {
        if (item.type === "trace") continue;

        const span = item as Span<SpanData>;
        const storyDir = span.traceMetadata?.storyDir as string | undefined;
        if (!storyDir) continue;

        const existing = byStoryDir.get(storyDir);
        if (existing) {
          existing.push(span);
        } else {
          byStoryDir.set(storyDir, [span]);
        }
      }

      for (const [storyDir, spans] of byStoryDir) {
        const logPath = ensureLogPath(storyDir);
        const lines: string[] = [];

        for (const span of spans) {
          const entry = extractEntry(span);
          if (entry) {
            lines.push(JSON.stringify(entry));
          }
        }

        if (lines.length > 0) {
          appendFileSync(logPath, lines.join("\n") + "\n", "utf-8");
        }
      }
    } catch {
      // Best-effort: don't throw on write errors
    }
  }
}
