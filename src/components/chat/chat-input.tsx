"use client";

import type { FormEvent } from "react";
import type { ChatStatus } from "ai";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  status: ChatStatus;
}

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  status,
}: ChatInputProps) {
  const disabled = status === "submitted" || status === "streaming";

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex max-w-3xl items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="输入你的指令..."
          disabled={disabled}
          className="flex-1"
        />
        <Button type="submit" disabled={disabled || !input.trim()} size="default">
          发送
        </Button>
      </form>
    </div>
  );
}
