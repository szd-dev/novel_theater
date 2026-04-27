import { join } from 'node:path';
import { run } from '@openai/agents';
import { createAiSdkUiMessageStreamResponse } from '@openai/agents-extensions/ai-sdk-ui';
import type { UIMessage } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

import { gmAgent, setCurrentProjectId } from '@/agents/registry';
import { getOrCreateStorySession } from '@/session/manager';
import { readChatHistory, saveChatHistory } from '@/session/chat-history';
import { getProject } from '@/project/manager';
import { createPromptLogFilter } from '@/lib/prompt-logger';

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

    const { messages, projectId }: { messages: UIMessage[]; projectId?: string } =
      await req.json();

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId' },
        { status: 400 },
      );
    }

    console.log(`[API /narrative] Request start, projectId=${projectId}, messages=${messages.length}`);

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: `Project not found: ${projectId}` },
        { status: 400 },
      );
    }

    const projectDir = project.dataDir;
    const storyDir = join(projectDir, '.novel');
    const storySession = getOrCreateStorySession(projectId, projectDir);

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
    setCurrentProjectId(projectId, projectDir);
    const stream = await run(gmAgent, input, {
      stream: true,
      context: { storyDir },
      maxTurns: 25,
      session: storySession.gmSession,
      callModelInputFilter: createPromptLogFilter(storyDir),
      signal: req.signal,
    });
    // Keep projectId set during streaming — customOutputExtractor fires asynchronously
    console.log(`[API /narrative] Agent run started in ${Date.now() - streamStart}ms`);

    return createAiSdkUiMessageStreamResponse(stream);
  } catch (error) {
    setCurrentProjectId(undefined, undefined);
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Project not found: ${projectId}` }, { status: 400 });
    }

    const messages = await readChatHistory(project.dataDir);
    return NextResponse.json({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { projectId, messages }: { projectId: string; messages: UIMessage[] } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Project not found: ${projectId}` }, { status: 400 });
    }

    await saveChatHistory(project.dataDir, messages);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
