import type { Agent, RunResult, Session, StreamedRunResult } from "@openai/agents";
import { run as agentsRun } from "@openai/agents";
import type { RunStreamEvent } from "@openai/agents";
import { RunItemStreamEvent, RunToolCallItem, RunToolCallOutputItem } from "@openai/agents";

type AnyRunResult = RunResult<any, any>;
type AnyStreamedRunResult = StreamedRunResult<any, any>;
type RunFn = typeof agentsRun;

let _run: RunFn = agentsRun;

export function _setRunFn(fn: RunFn): void {
  _run = fn;
}

export function _resetRunFn(): void {
  _run = agentsRun;
}

export interface AgentCallConfig {
  agent: Agent;
  input: string;
  context?: Record<string, string>;
  session?: Session;
  runOptions?: Record<string, unknown>;
}

export interface AgentCall {
  events: AsyncGenerator<RunStreamEvent>;
  result: Promise<AnyRunResult>;
}

function buildRunOptions(config: AgentCallConfig): Record<string, unknown> {
  const options: Record<string, unknown> = { maxTurns: 25, ...config.runOptions };
  if (config.context) {
    options.context = config.context;
    if (config.context.storyDir) {
      options.traceMetadata = { storyDir: config.context.storyDir, ...(config.runOptions?.traceMetadata as Record<string, string> ?? {}) };
    }
  }
  if (config.session) options.session = config.session;
  return options;
}

function emitToolCalled(config: AgentCallConfig, toolCallId: string): RunItemStreamEvent {
  const rawItem = {
    type: "function_call" as const,
    callId: toolCallId,
    name: config.agent.name,
    arguments: JSON.stringify({ input: config.input }),
  };
  return new RunItemStreamEvent("tool_called", new RunToolCallItem(rawItem, config.agent));
}

function emitToolOutput(
  config: AgentCallConfig,
  toolCallId: string,
  output: string,
): RunItemStreamEvent {
  const rawItem = {
    type: "function_call_result" as const,
    callId: toolCallId,
    name: config.agent.name,
    status: "completed" as const,
    output,
  };
  return new RunItemStreamEvent(
    "tool_output",
    new RunToolCallOutputItem(rawItem, config.agent, output),
  );
}

export function callAgent(config: AgentCallConfig): AgentCall {
  let resolveResult: (value: AnyRunResult) => void;
  let rejectResult: (reason: unknown) => void;
  const resultPromise = new Promise<AnyRunResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  async function* events(): AsyncGenerator<RunStreamEvent> {
    const toolCallId = crypto.randomUUID();

    yield emitToolCalled(config, toolCallId);

    try {
      const result = await _run(
        config.agent,
        config.input,
        buildRunOptions(config) as Parameters<typeof _run>[2],
      );
      resolveResult(result);

      const output = result.finalOutput != null ? String(result.finalOutput) : "";
      yield emitToolOutput(config, toolCallId, output);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      rejectResult(error);
      // Emit tool output with error so UI doesn't hang on "thinking" forever
      yield emitToolOutput(config, toolCallId, `Error: ${errorMessage}`);
      throw error;
    }
  }

  return { events: events(), result: resultPromise };
}

export function callAgentsParallel(configs: AgentCallConfig[]): {
  events: AsyncGenerator<RunStreamEvent>;
  results: Promise<AnyRunResult[]>;
} {
  let resolveResults: (value: AnyRunResult[]) => void;
  let rejectResults: (reason: unknown) => void;
  const resultsPromise = new Promise<AnyRunResult[]>((resolve, reject) => {
    resolveResults = resolve;
    rejectResults = reject;
  });

  const toolCallIds = configs.map(() => crypto.randomUUID());

  async function* events(): AsyncGenerator<RunStreamEvent> {
    for (let i = 0; i < configs.length; i++) {
      yield emitToolCalled(configs[i], toolCallIds[i]);
    }

    const settled = await Promise.allSettled(
      configs.map((config) =>
        _run(config.agent, config.input, buildRunOptions(config) as Parameters<typeof _run>[2]),
      ),
    );

    const results: AnyRunResult[] = [];
    const errors: PromiseRejectedResult[] = [];

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        results[i] = r.value;
      } else {
        errors.push(r);
        results[i] = undefined as unknown as AnyRunResult;
      }
    }

    for (let i = 0; i < configs.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled") {
        const output = r.value.finalOutput != null ? String(r.value.finalOutput) : "";
        yield emitToolOutput(configs[i], toolCallIds[i], output);
      } else {
        const errorMessage = r.reason instanceof Error ? r.reason.message : String(r.reason);
        yield emitToolOutput(configs[i], toolCallIds[i], `Error: ${errorMessage}`);
      }
    }

    if (errors.length > 0) {
      rejectResults(errors[0].reason);
      throw errors[0].reason;
    }

    resolveResults(results);
  }

  return { events: events(), results: resultsPromise };
}

export async function* forwardRun(stream: AnyStreamedRunResult): AsyncGenerator<RunStreamEvent> {
  for await (const event of stream) {
    yield event;
  }
}
