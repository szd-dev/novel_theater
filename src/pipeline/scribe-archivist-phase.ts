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
): Promise<void> {
  const charactersPrompt = `${narrativeSummary}\n\n## 文学文本\n${literaryText}`;

  const charactersAgent = createCharactersAgent(storyDir);
  const charStartTime = Date.now();
  try {
    const charactersResult = await run(
      charactersAgent,
      charactersPrompt,
      { context: { storyDir } },
    );
    logAgentResult('Archivist-Characters', charactersResult, charStartTime);
  } catch (error) {
    console.error(
      `[Pipeline] Archivist-Characters failed after ${Date.now() - charStartTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  const parallelAgents = [
    { agent: createSceneAgent(storyDir), name: 'Archivist-Scene' },
    { agent: createWorldAgent(storyDir), name: 'Archivist-World' },
    { agent: createPlotAgent(storyDir), name: 'Archivist-Plot' },
    { agent: createTimelineAgent(storyDir), name: 'Archivist-Timeline' },
  ];

  const parallelStartTime = Date.now();
  console.log(`[Pipeline] Archivist parallel (Scene/World/Plot/Timeline) starting`);

  const parallelResults = await Promise.allSettled(
    parallelAgents.map(({ agent }) => run(agent, charactersPrompt, { context: { storyDir } })),
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

  const debtsAgent = createDebtsAgent(storyDir);
  const debtsStartTime = Date.now();
  try {
    const debtsResult = await run(
      debtsAgent,
      charactersPrompt,
      { context: { storyDir } },
    );
    logAgentResult('Archivist-Debts', debtsResult, debtsStartTime);
  } catch (error) {
    console.error(
      `[Pipeline] Archivist-Debts failed after ${Date.now() - debtsStartTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function runScribeAndArchivist(
  narrativeSummary: string,
  storyDir: string,
): Promise<ScribeArchivistResult> {
  const startTime = Date.now();
  console.log(`[Pipeline] Scribe starting`);

  let scribeOutput = "";
  try {
    const scribeResult = await run(
      scribeAgent,
      narrativeSummary,
      {
        context: { storyDir },
        maxTurns: 25,
      },
    );
    logAgentResult('Scribe', scribeResult, startTime);
    scribeOutput = String(scribeResult.finalOutput ?? "");
  } catch (error) {
    console.error(
      `[Pipeline] Scribe failed after ${Date.now() - startTime}ms:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  await runArchivistDag(narrativeSummary, scribeOutput, storyDir);

  return { scribeOutput, archivistDone: true };
}
