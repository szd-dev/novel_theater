import { NextRequest, NextResponse } from 'next/server';

import { getExecutionLogs } from '@/session/manager';

export async function GET(request: NextRequest) {
  const threadId = request.nextUrl.searchParams.get('threadId');

  if (!threadId) {
    return NextResponse.json(
      { success: false, message: 'threadId is required' },
      { status: 400 },
    );
  }

  try {
    const logs = getExecutionLogs(threadId);
    const summaries = logs.map(log => ({
      id: log.id,
      agentName: log.agentName,
      toolCallId: log.toolCallId,
      input: log.input.slice(0, 200),
      output: log.output ? log.output.slice(0, 200) : undefined,
      timestamp: log.timestamp,
      duration: log.duration,
      toolCalls: log.toolCalls,
      tokenUsage: log.tokenUsage,
    }));
    return NextResponse.json({ success: true, logs: summaries });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to get execution logs' },
      { status: 500 },
    );
  }
}
