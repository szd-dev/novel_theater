import { run } from '@openai/agents';
import { createAiSdkUiMessageStreamResponse } from '@openai/agents-extensions/ai-sdk-ui';
import type { UIMessage } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

import { gmAgent, setCurrentThreadId } from '@/agents/registry';
import { getStorySession } from '@/session/manager';
import { resolveProjectPath } from '@/lib/project-path';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Missing OPENAI_API_KEY environment variable' },
        { status: 500 },
      );
    }

    const { messages, threadId }: { messages: UIMessage[]; threadId?: string } =
      await req.json();

    const threadIdFinal = threadId || crypto.randomUUID();
    console.log(`[API /narrative] Request start, threadId=${threadIdFinal}, messages=${messages.length}`);

    const storySession = getStorySession(threadIdFinal);
    const storyDir = resolveProjectPath();

    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const input = lastUserMessage
      ? lastUserMessage.parts
          ?.filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('') || ''
      : '';

    if (!input) {
      return NextResponse.json(
        { error: 'No user message found' },
        { status: 400 },
      );
    }

    const streamStart = Date.now();
    setCurrentThreadId(threadIdFinal);
    const stream = await run(gmAgent, input, {
      stream: true,
      context: { storyDir },
      maxTurns: 25,
      session: storySession.gmSession,
      signal: req.signal,
    });
    // Keep threadId set during streaming — customOutputExtractor fires asynchronously
    console.log(`[API /narrative] Agent run started in ${Date.now() - streamStart}ms`);

    return createAiSdkUiMessageStreamResponse(stream);
  } catch (error) {
    setCurrentThreadId(undefined);
    if (req.signal.aborted) {
      console.log('[API /narrative] Request aborted after', Date.now() - startTime, 'ms');
      return NextResponse.json({ error: 'Request aborted' }, { status: 499 });
    }
    console.error('[API /narrative] Error after', Date.now() - startTime, 'ms:', error);
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
