"use client";

import dynamic from "next/dynamic";
import type { ChatStatus } from "ai";
import { Button } from "@/components/ui/button";
import type { MentionData } from "@/components/chat/chat-input/utils";

const ChatInputEditor = dynamic(
  () => import("./chat-input/editor").then((mod) => mod.ChatInputEditor),
  { ssr: false },
);

interface ChatInputProps {
  projectId: string;
  onSend: (text: string, mentions: MentionData[]) => void;
  status: ChatStatus;
  onStop?: () => void;
}

export function ChatInput({
  projectId,
  onSend,
  status,
  onStop,
}: ChatInputProps) {
  const disabled = status === "submitted" || status === "streaming";

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="flex-1">
          <ChatInputEditor
            projectId={projectId}
            onSend={onSend}
            disabled={disabled}
          />
        </div>
        {disabled ? (
          <Button type="button" onClick={onStop} variant="destructive" size="default">
            停止
          </Button>
        ) : null}
      </div>
    </div>
  );
}
