import type { RunResult, Session, StreamedRunResult } from "@openai/agents";
import { run as agentsRun, withTrace as agentsWithTrace } from "@openai/agents";
import type { RunStreamEvent } from "@openai/agents";
import { RunToolCallItem } from "@openai/agents";
import { createAiSdkUiMessageStreamResponse } from "@openai/agents-extensions/ai-sdk-ui";
import { setupTracing } from "@/lib/trace-setup";
import { callAgent, callAgentsParallel, forwardRun } from "@/pipeline/call-agent";
import { clearInteractionLog, appendInteractionLog } from "@/store/interaction-log";
import { createSubSession, addExecutionLog } from "@/session/manager";
import type { ExecutionLog } from "@/session/execution-log";
import { gmAgent } from "@/agents/gm";
import { actorAgent } from "@/agents/actor";
import { scribeAgent } from "@/agents/scribe";
import {
  createCharactersAgent,
  createSceneAgent,
  createWorldAgent,
  createPlotAgent,
  createTimelineAgent,
  createDebtsAgent,
} from "@/agents/archivist/factory";

type AnyRunResult = RunResult<any, any>;

function extractToolCalls(newItems: AnyRunResult['newItems']): string[] {
  return newItems
    .filter(item => item.type === 'tool_call_item')
    .map(item => {
      const rawItem = (item as { rawItem?: { name?: string } }).rawItem;
      return rawItem?.name ?? 'unknown';
    });
}

function buildExecutionLog(
  agentName: string,
  input: string,
  result: AnyRunResult,
  projectId: string,
): ExecutionLog | null {
  return {
    id: crypto.randomUUID(),
    agentName,
    toolCallId: result.agentToolInvocation?.toolCallId,
    input,
    output: String(result.finalOutput ?? ''),
    toolCalls: extractToolCalls(result.newItems),
    timestamp: Date.now(),
    tokenUsage: result.rawResponses.length
      ? {
          inputTokens: result.rawResponses.reduce((sum, r) => sum + (r.usage?.inputTokens ?? 0), 0),
          outputTokens: result.rawResponses.reduce((sum, r) => sum + (r.usage?.outputTokens ?? 0), 0),
        }
      : undefined,
  };
}

/** Schedule step from GM's submit_schedule tool call. */
export interface ScheduleStep {
  character: string;
  direction: string;
}

/** Extracted schedule data from GM result. */
export interface ScheduleData {
  schedule: ScheduleStep[];
  narrativeSummary: string;
}

/** Input for runScenePipeline. */
export interface PipelineInput {
  input: string;
  projectId: string;
  projectDir: string;
}

/** Context for runScenePipeline. */
export interface PipelineContext {
  storyDir: string;
}

/**
 * Extract the schedule from a GM RunResult by finding the submit_schedule tool call.
 * Looks through newItems for RunToolCallItem where rawItem.name === 'submit_schedule'.
 * Parses the arguments JSON string to get { schedule, narrativeSummary }.
 */
export function extractScheduleFromResult(gmResult: AnyRunResult): ScheduleData | null {
  for (const item of gmResult.newItems) {
    if (item.type !== "tool_call_item") continue;
    const toolCallItem = item as RunToolCallItem;
    const rawItem = toolCallItem.rawItem as {
      type: string;
      name?: string;
      arguments?: string;
    };
    if (rawItem.type === "function_call" && rawItem.name === "submit_schedule") {
      try {
        const parsed = JSON.parse(rawItem.arguments ?? "{}");
        if (parsed.schedule && Array.isArray(parsed.schedule) && parsed.schedule.length > 0) {
          return {
            schedule: parsed.schedule,
            narrativeSummary: parsed.narrativeSummary ?? "",
          };
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Extract narrativeSummary from a GM RunResult.
 * Returns the narrativeSummary from submit_schedule, or empty string if not found.
 */
export function extractScheduleMeta(gmResult: AnyRunResult): string {
  const data = extractScheduleFromResult(gmResult);
  return data?.narrativeSummary ?? "";
}

async function runGmPhase(
  input: string,
  storyDir: string,
  projectId: string,
  projectDir: string,
  gmSession: Session,
): Promise<{ events: RunStreamEvent[]; gmResult: AnyRunResult }> {
  const gmStream = await _run(
    gmAgent,
    input,
    {
      stream: true,
      context: { storyDir, projectId, projectDir },
      maxTurns: 25,
      session: gmSession,
    } as Parameters<typeof _run>[2],
  ) as StreamedRunResult<any, any>;

  const events: RunStreamEvent[] = [];
  for await (const event of forwardRun(gmStream)) {
    events.push(event);
  }

  await gmStream.completed;
  const gmResult = gmStream as unknown as AnyRunResult;
  return { events, gmResult };
}

async function* enactPhase(
  schedule: ScheduleStep[],
  storyDir: string,
  projectId: string,
  projectDir: string,
): AsyncGenerator<RunStreamEvent> {
  clearInteractionLog(storyDir);
  const sessionCache = new Map<string, { session: Session; sessionId: string }>();

  for (const step of schedule) {
    try {
      let sessionEntry = sessionCache.get(step.character);
      if (!sessionEntry) {
        const created = createSubSession(projectId, projectDir, "Actor", step.character);
        sessionEntry = { session: created.session, sessionId: created.sessionId };
        sessionCache.set(step.character, sessionEntry);
      }

      const actorCall = callAgent({
        agent: actorAgent,
        input: `${step.character}: ${step.direction}`,
        context: { storyDir, characterName: step.character },
        session: sessionEntry.session,
      });

      for await (const event of actorCall.events) {
        yield event;
      }

      const actorResult = await actorCall.result;
      const actorLog = buildExecutionLog('Actor', `${step.character}: ${step.direction}`, actorResult, projectId);
      if (actorLog) addExecutionLog(projectId, actorLog);
      try {
        appendInteractionLog(storyDir, step.character, String(actorResult.finalOutput ?? ""));
      } catch {
        // Best-effort: don't block sequence on interaction log write failure
      }
    } catch (error) {
      console.error(
        `[Pipeline] Actor "${step.character}" failed:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

async function* scribePhase(
  narrativeSummary: string,
  storyDir: string,
  projectId: string,
): AsyncGenerator<RunStreamEvent> {
  try {
    const scribeCall = callAgent({
      agent: scribeAgent,
      input: narrativeSummary,
      context: { storyDir },
    });

    for await (const event of scribeCall.events) {
      yield event;
    }

    const scribeResult = await scribeCall.result;
    const scribeLog = buildExecutionLog('Scribe', narrativeSummary, scribeResult, projectId);
    if (scribeLog) addExecutionLog(projectId, scribeLog);
    const literaryText = String(scribeResult.finalOutput ?? "");

    yield* archivistDagPhase(narrativeSummary, literaryText, storyDir, projectId);
  } catch (error) {
    console.error(
      "[Pipeline] Scribe failed:",
      error instanceof Error ? error.message : String(error),
    );
    yield* archivistDagPhase(narrativeSummary, "", storyDir, projectId);
  }
}

async function* archivistDagPhase(
  narrativeSummary: string,
  literaryText: string,
  storyDir: string,
  projectId: string,
): AsyncGenerator<RunStreamEvent> {
  const charactersPrompt = `${narrativeSummary}\n\n## 文学文本\n${literaryText}`;

  // Phase 4a: Archivist-Characters (gate)
  const charactersAgent = createCharactersAgent(storyDir);
  try {
    const charactersCall = callAgent({
      agent: charactersAgent,
      input: charactersPrompt,
      context: { storyDir },
    });
    for await (const event of charactersCall.events) {
      yield event;
    }
    const charactersResult = await charactersCall.result;
    const charactersLog = buildExecutionLog('Archivist-Characters', charactersPrompt, charactersResult, projectId);
    if (charactersLog) addExecutionLog(projectId, charactersLog);
  } catch (error) {
    console.error(
      "[Pipeline] Archivist-Characters failed:",
      error instanceof Error ? error.message : String(error),
    );
  }

  // Phase 4b: Archivist [Scene ∥ World ∥ Plot ∥ Timeline] (parallel)
  const parallelConfigs = [
    { agent: createSceneAgent(storyDir), input: charactersPrompt, context: { storyDir } },
    { agent: createWorldAgent(storyDir), input: charactersPrompt, context: { storyDir } },
    { agent: createPlotAgent(storyDir), input: charactersPrompt, context: { storyDir } },
    { agent: createTimelineAgent(storyDir), input: charactersPrompt, context: { storyDir } },
  ];

  try {
    const parallelCall = callAgentsParallel(parallelConfigs);
    for await (const event of parallelCall.events) {
      yield event;
    }
    const parallelResults = await parallelCall.results;
    const parallelNames = ['Archivist-Scene', 'Archivist-World', 'Archivist-Plot', 'Archivist-Timeline'];
    for (let i = 0; i < parallelResults.length; i++) {
      const log = buildExecutionLog(parallelNames[i], charactersPrompt, parallelResults[i], projectId);
      if (log) addExecutionLog(projectId, log);
    }
  } catch (error) {
    console.error(
      "[Pipeline] Archivist parallel (Scene/World/Plot/Timeline) failed:",
      error instanceof Error ? error.message : String(error),
    );
  }

  // Phase 4c: Archivist-Debts (serial last)
  const debtsAgent = createDebtsAgent(storyDir);
  try {
    const debtsCall = callAgent({
      agent: debtsAgent,
      input: charactersPrompt,
      context: { storyDir },
    });
    for await (const event of debtsCall.events) {
      yield event;
    }
    const debtsResult = await debtsCall.result;
    const debtsLog = buildExecutionLog('Archivist-Debts', charactersPrompt, debtsResult, projectId);
    if (debtsLog) addExecutionLog(projectId, debtsLog);
  } catch (error) {
    console.error(
      "[Pipeline] Archivist-Debts failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Create the scene pipeline async generator.
 * Yields RunStreamEvents in order: GM → Actor(s) → Scribe → Archivist DAG.
 */
export async function* createSceneStream(
  input: PipelineInput,
  context: PipelineContext,
  gmSession: Session,
): AsyncGenerator<RunStreamEvent> {
  const { projectId, projectDir } = input;
  const { storyDir } = context;

  setupTracing();

  yield* await _withTrace(
    "Scene Pipeline",
    async (trace) => {
      trace.metadata = { projectId, storyDir };

      async function* innerStream(): AsyncGenerator<RunStreamEvent> {
        // Phase 1: Forward GM stream
        const { events: gmEvents, gmResult } = await runGmPhase(
          input.input, storyDir, projectId, projectDir, gmSession,
        );
        yield* gmEvents;

        // Check for schedule
        const scheduleData = extractScheduleFromResult(gmResult);
        if (!scheduleData) return;

        const { schedule, narrativeSummary } = scheduleData;

        // Phase 2: Enact
        yield* enactPhase(schedule, storyDir, projectId, projectDir);

        // Phase 3 + 4: Scribe → Archivist DAG
        yield* scribePhase(narrativeSummary, storyDir, projectId);

        // Clear interaction log after all phases complete
        clearInteractionLog(storyDir);
      }

      const allEvents: RunStreamEvent[] = [];
      for await (const event of innerStream()) {
        allEvents.push(event);
      }
      return allEvents;
    },
    { metadata: { projectId, storyDir } },
  );
}

/**
 * Run the full scene pipeline: GM → Actor(s) → Scribe → Archivist DAG.
 * Returns a Response suitable for the AI SDK UI stream adapter.
 */
export function runScenePipeline(
  input: PipelineInput,
  context: PipelineContext,
  gmSession: Session,
): Response {
  return createAiSdkUiMessageStreamResponse(createSceneStream(input, context, gmSession));
}

// --- Testability hooks ---

let _run: typeof agentsRun = agentsRun;
let _withTrace = agentsWithTrace;

export function _setRunFn(fn: typeof agentsRun): void {
  _run = fn;
}

export function _resetRunFn(): void {
  _run = agentsRun;
}

export function _setWithTraceFn(fn: typeof agentsWithTrace): void {
  _withTrace = fn;
}

export function _resetWithTraceFn(): void {
  _withTrace = agentsWithTrace;
}
