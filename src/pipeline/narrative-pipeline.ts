import type { RunResult, Session, StreamedRunResult } from "@openai/agents";
import { run as agentsRun, withTrace as agentsWithTrace } from "@openai/agents";
import type { RunStreamEvent } from "@openai/agents";
import { RunToolCallItem } from "@openai/agents";
import { createAiSdkUiMessageStreamResponse } from "@openai/agents-extensions/ai-sdk-ui";
import { setupTracing } from "@/lib/trace-setup";
import { callAgent, callAgentsParallel, forwardRun } from "@/pipeline/call-agent";
import { clearInteractionLog, appendInteractionLog } from "@/store/interaction-log";
import { createSubSession } from "@/session/manager";
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

export interface ScheduleStep {
  character: string;
  direction: string;
}

export interface ScheduleData {
  schedule: ScheduleStep[];
  narrativeSummary: string;
}

export interface PipelineInput {
  input: string;
  projectId: string;
  projectDir: string;
}

export interface PipelineContext {
  storyDir: string;
}

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
  const startTime = Date.now();
  console.log(`[Pipeline] GM starting, input: "${input.slice(0, 80)}..."`);

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
  logAgentResult('GM', gmResult, startTime);

  return { events, gmResult };
}

async function* enactPhase(
  schedule: ScheduleStep[],
  storyDir: string,
  projectId: string,
  projectDir: string,
): AsyncGenerator<RunStreamEvent> {
  console.log(`[Pipeline] Enact phase: ${schedule.length} step(s)`);
  clearInteractionLog(storyDir);
  const sessionCache = new Map<string, { session: Session; sessionId: string }>();

  for (const step of schedule) {
    const startTime = Date.now();
    console.log(`[Pipeline] Actor "${step.character}" starting`);
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
        runOptions: { maxTurns: 10 },
      });

      for await (const event of actorCall.events) {
        yield event;
      }

      const actorResult = await actorCall.result;
      logAgentResult(`Actor(${step.character})`, actorResult, startTime);
      try {
        appendInteractionLog(storyDir, step.character, String(actorResult.finalOutput ?? ""));
      } catch {
        // Best-effort: don't block sequence on interaction log write failure
      }
    } catch (error) {
      console.error(
        `[Pipeline] Actor "${step.character}" failed after ${Date.now() - startTime}ms:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

async function* scribePhase(
  narrativeSummary: string,
  storyDir: string,
): AsyncGenerator<RunStreamEvent> {
  const startTime = Date.now();
  console.log(`[Pipeline] Scribe starting`);
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
    logAgentResult('Scribe', scribeResult, startTime);
    const literaryText = String(scribeResult.finalOutput ?? "");

    yield* archivistDagPhase(narrativeSummary, literaryText, storyDir);
  } catch (error) {
    console.error(
      `[Pipeline] Scribe failed after ${Date.now() - startTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
    yield* archivistDagPhase(narrativeSummary, "", storyDir);
  }
}

async function* archivistDagPhase(
  narrativeSummary: string,
  literaryText: string,
  storyDir: string,
): AsyncGenerator<RunStreamEvent> {
  const charactersPrompt = `${narrativeSummary}\n\n## 文学文本\n${literaryText}`;

  const charactersAgent = createCharactersAgent(storyDir);
  let charStartTime = Date.now();
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
    logAgentResult('Archivist-Characters', charactersResult, charStartTime);
  } catch (error) {
    console.error(
      `[Pipeline] Archivist-Characters failed after ${Date.now() - charStartTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  const parallelConfigs = [
    { agent: createSceneAgent(storyDir), input: charactersPrompt, context: { storyDir } },
    { agent: createWorldAgent(storyDir), input: charactersPrompt, context: { storyDir } },
    { agent: createPlotAgent(storyDir), input: charactersPrompt, context: { storyDir } },
    { agent: createTimelineAgent(storyDir), input: charactersPrompt, context: { storyDir } },
  ];

  const parallelStartTime = Date.now();
  console.log(`[Pipeline] Archivist parallel (Scene/World/Plot/Timeline) starting`);
  try {
    const parallelCall = callAgentsParallel(parallelConfigs);
    for await (const event of parallelCall.events) {
      yield event;
    }
    const parallelResults = await parallelCall.results;
    const parallelNames = ['Archivist-Scene', 'Archivist-World', 'Archivist-Plot', 'Archivist-Timeline'];
    for (let i = 0; i < parallelResults.length; i++) {
      logAgentResult(parallelNames[i], parallelResults[i], parallelStartTime);
    }
  } catch (error) {
    console.error(
      `[Pipeline] Archivist parallel failed after ${Date.now() - parallelStartTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  const debtsAgent = createDebtsAgent(storyDir);
  const debtsStartTime = Date.now();
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
    logAgentResult('Archivist-Debts', debtsResult, debtsStartTime);
  } catch (error) {
    console.error(
      `[Pipeline] Archivist-Debts failed after ${Date.now() - debtsStartTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

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
        const { events: gmEvents, gmResult } = await runGmPhase(
          input.input, storyDir, projectId, projectDir, gmSession,
        );
        yield* gmEvents;

        const scheduleData = extractScheduleFromResult(gmResult);
        if (!scheduleData) return;

        const { schedule, narrativeSummary } = scheduleData;

        yield* enactPhase(schedule, storyDir, projectId, projectDir);

        yield* scribePhase(narrativeSummary, storyDir);

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
