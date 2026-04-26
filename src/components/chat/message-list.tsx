"use client";

import { useEffect, useRef } from "react";
import type { UIMessage, ChatStatus } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageItem } from "@/components/chat/message-item";
import { ProgressIndicator } from "@/components/chat/progress-indicator";

const TOOL_STEP_MAP: Record<string, number> = {
  call_actor: 1,
  call_scribe: 2,
  call_archivist: 3,
};

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
  threadId?: string;
}

export function MessageList({ messages, status, threadId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { currentStep, isThinking } = deriveProgress(messages, status);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  return (
    <ScrollArea className="flex-1">
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
            <MessageItem key={message.id} message={message} threadId={threadId} />
          ))}
          {(status === "submitted" || status === "streaming") && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ProgressIndicator currentStep={currentStep} isThinking={isThinking} />
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
