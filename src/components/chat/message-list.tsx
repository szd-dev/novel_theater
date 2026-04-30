"use client";

import { useEffect, useRef } from "react";
import type { UIMessage, ChatStatus } from "ai";
import type { DynamicToolState } from "@/components/chat/tool-detail-sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageItem } from "@/components/chat/message-item";
import { ProgressIndicator } from "@/components/chat/progress-indicator";
import { TOOL_STEP_MAP } from "@/components/chat/tool-meta";
import { Button } from "@/components/ui/button";

function deriveProgress(messages: UIMessage[], status: ChatStatus) {
  if (status !== "streaming" && status !== "submitted") {
    return { currentStep: undefined, isThinking: false };
  }
  let latestStep: number | undefined;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "dynamic-tool") {
        const toolName = (part as { toolName?: string }).toolName;
        if (toolName && toolName in TOOL_STEP_MAP) {
          latestStep = TOOL_STEP_MAP[toolName];
        }
      }
    }
  }
  return { currentStep: latestStep, isThinking: status === "submitted" };
}

interface MessageListProps {
  messages: UIMessage[];
  status: ChatStatus;
  onToolClick?: (tool: { toolName: string; input?: Record<string, unknown>; output?: string; error?: string; state?: DynamicToolState }) => void;
  error?: Error;
  onClearError?: () => void;
}

export function MessageList({ messages, status, onToolClick, error, onClearError }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { currentStep, isThinking } = deriveProgress(messages, status);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  return (
    <ScrollArea className="flex-1 overflow-hidden">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {messages.length === 0 && (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center text-center">
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              自由剧场
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              输入你的指令，开始一段故事
            </p>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} onToolClick={onToolClick} />
          ))}
          {(status === "submitted" || status === "streaming") && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ProgressIndicator currentStep={currentStep} isThinking={isThinking} />
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              <span className="mt-0.5 shrink-0">⚠</span>
              <div className="flex-1">
                <p className="font-medium">请求失败</p>
                <p className="mt-0.5 text-destructive/80">{error.message}</p>
              </div>
              {onClearError && (
                <Button variant="ghost" size="xs" onClick={onClearError} className="shrink-0">
                  关闭
                </Button>
              )}
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
