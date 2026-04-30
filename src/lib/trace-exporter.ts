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
  instructions?: string;
  input?: unknown;
  output?: unknown;
  tools?: string[];
  handoffs?: string[];
  duration?: number;
}

function extractSystemPrompt(messages: Array<Record<string, unknown>> | undefined): string | undefined {
  if (!messages) return undefined;
  for (const msg of messages) {
    if (msg.role === "system" || msg.role === "developer") {
      const content = msg.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((p: Record<string, unknown>) => p.type === "input_text" && typeof p.text === "string")
          .map((p: Record<string, unknown>) => p.text)
          .join("\n");
      }
    }
  }
  return undefined;
}

function extractTextFromMessages(messages: Array<Record<string, unknown>> | undefined): string | undefined {
  if (!messages || messages.length === 0) return undefined;
  const roles = messages.map((msg) =>
    typeof msg.role === "string" ? msg.role : "unknown",
  );
  return `${messages.length} message(s): ${roles.join(",")}`;
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
      const instructions = extractSystemPrompt(genData.input);
      return {
        ...base,
        model: genData.model,
        usage: {
          inputTokens: genData.usage?.input_tokens,
          outputTokens: genData.usage?.output_tokens,
        },
        instructions,
        input: extractTextFromMessages(genData.input),
        output: extractTextFromMessages(genData.output),
      };
    }
    case "function": {
      const funcData = data as FunctionSpanData;
      return {
        ...base,
        agent: funcData.name,
        input: funcData.input,
        output: funcData.output,
      };
    }
    default:
      return { ...base };
  }
}

function ensureLogPath(storyDir: string): string {
  const workingDir = join(storyDir, ".working");
  mkdirSync(workingDir, { recursive: true });
  return join(workingDir, "agent-logs.jsonl");
}

export class ProjectTraceExporter implements TracingExporter {
  async export(items: (Trace | Span<SpanData>)[]): Promise<void> {
    console.error(`[TraceExporter] export called with ${items.length} items`);
    try {
      const byStoryDir = new Map<string, Span<SpanData>[]>();

      for (const item of items) {
        if (item.type === "trace") continue;

        const span = item as Span<SpanData>;
        const storyDir = span.traceMetadata?.storyDir as string | undefined;
        console.error(`[TraceExporter] span type=${span.spanData.type} storyDir=${storyDir ?? 'undefined'}`);
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
          console.error(`[TraceExporter] wrote ${lines.length} lines to ${logPath}`);
        }
      }
    } catch (err) {
      console.error("[TraceExporter] export failed:", err);
    }
  }
}
