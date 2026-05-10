import type { LanguageModelV3Prompt, LanguageModelV3GenerateResult, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';

type DebugMiddleware = LanguageModelMiddleware;

let roundCounter = 0;

function resetRoundCounter(): void {
  roundCounter = 0;
}

function nextRound(): number {
  roundCounter++;
  return roundCounter;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactMessage(msg: LanguageModelV3Prompt[number]): Record<string, unknown> {
  const base: Record<string, unknown> = { role: msg.role };
  const content = msg.content;

  if (typeof content === 'string') {
    base.content = content;
  } else if (Array.isArray(content)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    base.parts = (content as any[]).map((part: any) => {
      const pt: string = part.type;
      if (pt === 'text') return { type: 'text', text: part.text };
      if (pt === 'reasoning') return { type: 'reasoning', text: truncate(String(part.text ?? ''), 200) };
      if (pt === 'tool-call') return { type: 'tool-call', toolName: part.toolName, toolCallId: part.toolCallId, input: truncate(JSON.stringify(part.input), 500) };
      if (pt === 'tool-result') return { type: 'tool-result', toolName: part.toolName, toolCallId: part.toolCallId };
      if (pt === 'tool-approval-response') return { type: 'tool-approval-response', approvalId: part.approvalId, approved: part.approved };
      if (pt === 'file') return { type: 'file', mediaType: part.mediaType };
      return { type: pt };
    });
  }

  return base;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + `...(${s.length - max} more chars)`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactContent(content: LanguageModelV3GenerateResult['content']): Array<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (content as any[]).map((part: any) => {
    const pt: string = part.type;
    if (pt === 'text') return { type: 'text', text: truncate(part.text, 200) };
    if (pt === 'reasoning') return { type: 'reasoning', text: truncate(part.text, 200) };
    if (pt === 'tool-call') return { type: 'tool-call', toolName: part.toolName, toolCallId: part.toolCallId, input: truncate(part.input, 300) };
    if (pt === 'tool-result') return { type: 'tool-result', toolName: part.toolName, toolCallId: part.toolCallId };
    if (pt === 'tool-approval-request') return { type: 'tool-approval-request', toolCallId: part.toolCallId, approvalId: part.approvalId };
    if (pt === 'file') return { type: 'file', mediaType: part.mediaType };
    if (pt === 'source') return { type: 'source' };
    return { type: pt };
  });
}

function logRound(label: string, data: Record<string, unknown>): void {
  try {
    console.log(`[AI-Debug] ${label}`, JSON.stringify(data));
  } catch {
    // Best-effort: never throw from debug logging
  }
}

export function createDebugMiddleware(modelId: string): DebugMiddleware {
  return {
    specificationVersion: 'v3',

    async wrapGenerate({ doGenerate, params, model }) {
      const round = nextRound();
      const startTime = Date.now();

      logRound(`Round #${round} INPUT [${modelId}]`, {
        round,
        model: model.modelId,
        type: 'non-stream',
        messages: params.prompt.map(compactMessage),
        maxOutputTokens: params.maxOutputTokens,
        temperature: params.temperature,
      });

      try {
        const result = await doGenerate();

        logRound(`Round #${round} OUTPUT [${modelId}]`, {
          round,
          model: model.modelId,
          type: 'non-stream',
          duration: Date.now() - startTime,
          content: compactContent(result.content),
          finishReason: result.finishReason,
          usage: {
            inputTokens: result.usage.inputTokens?.total,
            outputTokens: result.usage.outputTokens?.total,
          },
        });

        return result;
      } catch (error) {
        logRound(`Round #${round} ERROR [${modelId}]`, {
          round,
          model: model.modelId,
          type: 'non-stream',
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },

    async wrapStream({ doStream, params, model }) {
      const round = nextRound();
      const startTime = Date.now();

      logRound(`Round #${round} INPUT [${modelId}]`, {
        round,
        model: model.modelId,
        type: 'stream',
        messages: params.prompt.map(compactMessage),
        maxOutputTokens: params.maxOutputTokens,
        temperature: params.temperature,
      });

      try {
        const result = await doStream();

        const [consumerStream, debugStream] = result.stream.tee();

        collectStreamParts(round, model.modelId, startTime, debugStream);

        return {
          ...result,
          stream: consumerStream,
        };
      } catch (error) {
        logRound(`Round #${round} ERROR [${modelId}]`, {
          round,
          model: model.modelId,
          type: 'stream',
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  } as LanguageModelMiddleware;
}

async function collectStreamParts(
  round: number,
  modelId: string,
  startTime: number,
  stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<void> {
  const texts: string[] = [];
  const toolCalls: Array<{ toolName: string; input: string }> = [];
  let finishReason = '';
  let usage: { inputTokens?: number; outputTokens?: number } = {};
  let error: string | undefined;

  try {
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value.type === 'text-delta') {
        texts.push(value.delta);
      } else if (value.type === 'tool-input-start') {
        toolCalls.push({ toolName: value.toolName, input: '' });
      } else if (value.type === 'tool-input-delta') {
        const tc = toolCalls[toolCalls.length - 1];
        if (tc) tc.input += value.delta;
      } else if (value.type === 'finish') {
        finishReason = value.finishReason?.unified ?? '';
        usage = {
          inputTokens: value.usage?.inputTokens?.total,
          outputTokens: value.usage?.outputTokens?.total,
        };
      } else if (value.type === 'error') {
        error = String(value.error ?? 'unknown stream error');
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    logRound(`Round #${round} OUTPUT [${modelId}]`, {
      round,
      model: modelId,
      type: 'stream',
      duration: Date.now() - startTime,
      text: truncate(texts.join(''), 500),
      toolCalls: toolCalls.map((tc) => ({
        toolName: tc.toolName,
        input: truncate(tc.input, 300),
      })),
      finishReason,
      usage,
      error: error || undefined,
    });
  }
}

export { resetRoundCounter };
