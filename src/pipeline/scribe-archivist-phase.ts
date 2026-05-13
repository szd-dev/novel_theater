import { run } from "@openai/agents";
import type { RunResult } from "@openai/agents";
import { scribeAgent } from "@/agents/scribe";
import {
  createCharactersAgent,
  createSceneAgent,
  createWorldAgent,
  createPlotAgent,
  createTimelineAgent,
  createDebtsAgent,
} from "@/agents/archivist/factory";
import { assembleAndInject } from "@/context/chain/chain-runner";
import type { ToolProgress } from "@/lib/tool-progress";

type AnyRunResult = RunResult<any, any>;

export interface ScribeArchivistResult {
  scribeOutput: string;
  archivistDone: boolean;
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

async function runArchivistDag(
  narrativeSummary: string,
  literaryText: string,
  storyDir: string,
  onProgress?: (progress: ToolProgress) => void,
  totalSteps?: number,
  abortSignal?: AbortSignal,
): Promise<void> {
  const archivistCtx = await assembleAndInject({
    role: "archivist-characters",
    storyDir,
    runContext: { storyDir },
  });
  const ctxPrefix = archivistCtx.messages.length > 0
    ? archivistCtx.messages.map((m) => `## ${m.label}\n${m.content}`).join("\n\n---\n\n") + "\n\n---\n\n"
    : "";

  const charactersPrompt = `${ctxPrefix}${narrativeSummary}\n\n## 文学文本\n${literaryText}`;

  const charactersAgent = createCharactersAgent(storyDir);
  const charStartTime = Date.now();
  try {
    const charactersResult = await run(
      charactersAgent,
      charactersPrompt,
      { context: { storyDir }, maxTurns: 10, signal: abortSignal },
    );
    logAgentResult('Archivist-Characters', charactersResult, charStartTime);
  } catch (error) {
    console.error(
      `[Pipeline] Archivist-Characters failed after ${Date.now() - charStartTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  onProgress?.({
    status: 'running',
    phase: 'archivist',
    step: (totalSteps ?? 4) - 3,
    total: totalSteps ?? 4,
    current: '角色更新',
  });

  const parallelAgents = [
    { agent: createSceneAgent(storyDir), name: 'Archivist-Scene' },
    { agent: createWorldAgent(storyDir), name: 'Archivist-World' },
    { agent: createPlotAgent(storyDir), name: 'Archivist-Plot' },
    { agent: createTimelineAgent(storyDir), name: 'Archivist-Timeline' },
  ];

  const parallelStartTime = Date.now();
  console.log(`[Pipeline] Archivist parallel (Scene/World/Plot/Timeline) starting`);

  const parallelResults = await Promise.allSettled(
    parallelAgents.map(({ agent }) => run(agent, charactersPrompt, { context: { storyDir }, signal: abortSignal })),
  );

  parallelResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      logAgentResult(parallelAgents[i].name, result.value, parallelStartTime);
    } else {
      console.error(
        `[Pipeline] ${parallelAgents[i].name} failed:`,
        result.reason instanceof Error ? result.reason.message : String(result.reason),
      );
    }
  });

  onProgress?.({
    status: 'running',
    phase: 'archivist',
    step: (totalSteps ?? 4) - 2,
    total: totalSteps ?? 4,
    current: '场景/世界/剧情/时间线',
  });

  const debtsAgent = createDebtsAgent(storyDir);
  const debtsStartTime = Date.now();
  try {
    const debtsResult = await run(
      debtsAgent,
      charactersPrompt,
      { context: { storyDir }, signal: abortSignal },
    );
    logAgentResult('Archivist-Debts', debtsResult, debtsStartTime);
  } catch (error) {
    console.error(
      `[Pipeline] Archivist-Debts failed after ${Date.now() - debtsStartTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  onProgress?.({
    status: 'running',
    phase: 'archivist',
    step: (totalSteps ?? 4) - 1,
    total: totalSteps ?? 4,
    current: '伏笔更新',
  });
}

export async function runScribeAndArchivist(
  narrativeSummary: string,
  storyDir: string,
  opts?: {
    onProgress?: (progress: ToolProgress) => void;
    totalSteps: number;
    abortSignal?: AbortSignal;
  },
): Promise<ScribeArchivistResult> {
  const startTime = Date.now();
  console.log(`[Pipeline] Scribe starting`);

  const scribeCtx = await assembleAndInject({
    role: "scribe",
    storyDir,
    runContext: { storyDir },
  });
  const scribeInput = scribeCtx.messages.length > 0
    ? [...scribeCtx.messages.map((m) => `## ${m.label}\n${m.content}`), narrativeSummary].join("\n\n---\n\n")
    : narrativeSummary;

  let scribeOutput = "";
  try {
    const scribeResult = await run(
      scribeAgent,
      scribeInput,
      {
        context: { storyDir },
        maxTurns: 25,
        signal: opts?.abortSignal,
      },
    );
    logAgentResult('Scribe', scribeResult, startTime);
    scribeOutput = String(scribeResult.finalOutput ?? "");

    opts?.onProgress?.({
      status: 'running',
      phase: 'scribe',
      step: opts.totalSteps - 4,
      total: opts.totalSteps,
      current: 'Scribe',
    });
  } catch (error) {
    console.error(
      `[Pipeline] Scribe failed after ${Date.now() - startTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (opts?.abortSignal?.aborted) {
    return { scribeOutput, archivistDone: false };
  }

  await runArchivistDag(narrativeSummary, scribeOutput, storyDir, opts?.onProgress, opts?.totalSteps, opts?.abortSignal);

  return { scribeOutput, archivistDone: true };
}
