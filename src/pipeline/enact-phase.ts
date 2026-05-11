import { run } from "@openai/agents";
import type { RunResult, Session } from "@openai/agents";
import { clearInteractionLog, appendInteractionLog } from "@/store/interaction-log";
import { createSubSession } from "@/session/manager";
import { actorAgent } from "@/agents/actor";
import type { ToolProgress } from "@/lib/tool-progress";

type AnyRunResult = RunResult<any, any>;

export interface ScheduleStep {
  character: string;
  direction: string;
}

export interface EnactStep {
  character: string;
  status: "success" | "error";
  error?: string;
}

export interface EnactResult {
  steps: EnactStep[];
  interactionLog: string;
}

function logAgentResult(agentName: string, result: AnyRunResult, startTime: number): void {
  const duration = Date.now() - startTime;
  const toolCalls = result.newItems
    .filter(item => item.type === 'tool_call_item')
    .map(item => {
      const rawItem = (item as { rawItem?: { name?: string } }).rawItem;
      return rawItem?.name ?? 'unknown';
    });
  const inputTokens = result.rawResponses.reduce((s, r) => s + (r.usage?.inputTokens ?? 0), 0);
  const outputTokens = result.rawResponses.reduce((s, r) => s + (r.usage?.outputTokens ?? 0), 0);
  const output = String(result.finalOutput ?? '').slice(0, 100);

  console.log(
    `[Pipeline] ${agentName} completed in ${duration}ms, ` +
    `tools: [${toolCalls.join(', ')}], ` +
    `output: ${output}..., ` +
    `tokens: ${inputTokens}in/${outputTokens}out`,
  );
}

export async function runEnactPhase(
  schedule: ScheduleStep[],
  storyDir: string,
  projectId: string,
  projectDir: string,
  opts?: { onProgress?: (progress: ToolProgress) => void; totalSteps: number; abortSignal?: AbortSignal },
): Promise<EnactResult> {
  console.log(`[Pipeline] Enact phase: ${schedule.length} step(s)`);
  clearInteractionLog(storyDir);

  const sessionCache = new Map<string, { session: Session; sessionId: string }>();
  const steps: EnactStep[] = [];

  for (const [i, step] of schedule.entries()) {
    if (opts?.abortSignal?.aborted) {
      console.log(`[Pipeline] Enact phase aborted before "${step.character}"`);
      break;
    }

    const startTime = Date.now();
    console.log(`[Pipeline] Actor "${step.character}" starting`);

    opts?.onProgress?.({
      status: 'running',
      phase: 'actor',
      step: i + 1,
      total: opts.totalSteps,
      current: step.character,
    });

    try {
      let sessionEntry = sessionCache.get(step.character);
      if (!sessionEntry) {
        const created = createSubSession(projectId, projectDir, "Actor", step.character);
        sessionEntry = { session: created.session, sessionId: created.sessionId };
        sessionCache.set(step.character, sessionEntry);
      }

      const actorResult = await run(
        actorAgent,
        `${step.character}: ${step.direction}`,
        {
          context: { storyDir, characterName: step.character },
          session: sessionEntry.session,
          maxTurns: 10,
          signal: opts?.abortSignal,
        },
      );

      logAgentResult(`Actor(${step.character})`, actorResult, startTime);

      try {
        appendInteractionLog(storyDir, step.character, String(actorResult.finalOutput ?? ""));
      } catch {
        // Best-effort: don't block sequence on interaction log write failure
      }

      steps.push({ character: step.character, status: "success" });
    } catch (error) {
      console.error(
        `[Pipeline] Actor "${step.character}" failed after ${Date.now() - startTime}ms:`,
        error instanceof Error ? error.message : String(error),
      );
      steps.push({
        character: step.character,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { steps, interactionLog: "" };
}
