import { setTracingDisabled, addTraceProcessor, BatchTraceProcessor } from "@openai/agents";
import { ProjectTraceExporter } from "@/lib/trace-exporter";

let tracingInitialized = false;

/**
 * Enable tracing and register the ProjectTraceExporter globally.
 * Must be called before any agent run() — overrides setTracingDisabled(true) from models.ts.
 * Safe to call multiple times; only initializes once.
 */
export function setupTracing(): void {
  if (tracingInitialized) return;
  tracingInitialized = true;

  setTracingDisabled(false);
  addTraceProcessor(new BatchTraceProcessor(new ProjectTraceExporter()));
}
