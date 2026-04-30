import { join } from "node:path";
import { mkdirSync, appendFileSync } from "node:fs";
import type { CallModelInputFilter } from "@openai/agents";

/**
 * Creates a callModelInputFilter that logs agent system prompts to JSONL
 * when DEBUG_PROMPTS environment variable is set.
 * Best-effort logging — never throws or blocks the agent run.
 *
 * @deprecated Replaced by ProjectTraceExporter. Will be removed in next version.
 */
export function createPromptLogFilter(storyDir: string): CallModelInputFilter {
  return ({ modelData, agent }) => {
    if (!process.env.DEBUG_PROMPTS) return modelData;

    try {
      const workingDir = join(storyDir, ".working");
      mkdirSync(workingDir, { recursive: true });

      const logPath = join(workingDir, "agent-logs.jsonl");
      const entry = {
        timestamp: new Date().toISOString(),
        agent: agent.name ?? "unknown",
        instructions: modelData.instructions ?? "",
        inputLength: Array.isArray(modelData.input) ? modelData.input.length : 0,
        model: typeof agent.model === "string" ? agent.model : "unknown",
      };

      appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
    } catch {
      // Best-effort: don't block agent run on log write failure
    }

    return modelData;
  };
}
