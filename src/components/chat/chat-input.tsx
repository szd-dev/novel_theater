"use client";

import { type FormEvent, useRef, useState } from "react";
import type { ChatStatus } from "ai";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  status: ChatStatus;
  onStop?: () => void;
}

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  status,
  onStop,
}: ChatInputProps) {
  const disabled = status === "submitted" || status === "streaming";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [composing, setComposing] = useState(false);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex max-w-3xl items-end gap-2"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            onInputChange(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !composing) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).form?.requestSubmit();
            }
          }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          placeholder="输入你的指令..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none max-h-40 overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {disabled ? (
          <Button type="button" onClick={onStop} variant="destructive" size="default">
            停止
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} size="default">
            发送
          </Button>
        )}
      </form>
    </div>
  );
}
