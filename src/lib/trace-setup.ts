import { setTracingDisabled, setTraceProcessors, BatchTraceProcessor } from "@openai/agents";
import { ProjectTraceExporter } from "@/lib/trace-exporter";

let tracingInitialized = false;

/**
 * Enable tracing and register the ProjectTraceExporter globally.
 * Must be called before any agent run() — overrides setTracingDisabled(true) from models.ts.
 * Safe to call multiple times; only initializes once.
 *
 * Uses setTraceProcessors (not addTraceProcessor) to replace the default
 * OpenAI remote tracing exporter, which would otherwise attempt to send
 * traces to api.openai.com and fail with ETIMEDOUT in self-hosted setups.
 */
export function setupTracing(): void {
  if (tracingInitialized) return;
  tracingInitialized = true;

  setTracingDisabled(false);
  setTraceProcessors([new BatchTraceProcessor(new ProjectTraceExporter())]);
}
