import { NextRequest, NextResponse } from 'next/server';

import { getExecutionLog } from '@/session/manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ logId: string }> },
) {
  const threadId = request.nextUrl.searchParams.get('threadId');
  const { logId } = await params;

  if (!threadId) {
    return NextResponse.json(
      { success: false, message: 'threadId is required' },
      { status: 400 },
    );
  }

  if (!logId) {
    return NextResponse.json(
      { success: false, message: 'logId is required' },
      { status: 400 },
    );
  }

  try {
    const log = getExecutionLog(threadId, logId);
    if (!log) {
      return NextResponse.json(
        { success: false, message: 'Execution log not found' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, log });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to get execution log' },
      { status: 500 },
    );
  }
}
