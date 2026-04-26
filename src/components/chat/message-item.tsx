"use client";

import type { UIMessage } from "ai";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MessageItemProps {
  message: UIMessage;
}

function extractAgentLabel(message: UIMessage): string | null {
  // New: check dynamic-tool parts (Agent-as-Tool pattern)
  for (const part of message.parts) {
    if (part.type === "dynamic-tool") {
      const toolName = (part as { toolName?: string }).toolName;
      if (toolName === "call_actor") return "Actor";
      if (toolName === "call_scribe") return "Scribe";
      if (toolName === "call_archivist") return "Archivist";
    }
  }
  // Legacy: check data-* parts (backward compat)
  for (const part of message.parts) {
    if (part.type.startsWith("data-") && "data" in part) {
      const data = (part as { data: Record<string, unknown> }).data;
      if (typeof data.agent === "string") return data.agent;
    }
  }
  return null;
}

function renderParts(message: UIMessage) {
  if (!message.parts || message.parts.length === 0) {
    return null;
  }

  return message.parts.map((part, i) => {
    if (part.type === "text") {
      return (
        <span key={i} className="whitespace-pre-wrap">
          {part.text}
        </span>
      );
    }
    if (part.type.startsWith("data-")) {
      return null;
    }
    return null;
  });
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";
  const agentLabel = extractAgentLabel(message);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1",
        isUser ? "items-end" : "items-start"
      )}
    >
      {agentLabel && (
        <Badge variant="secondary" className="text-[10px] font-normal">
          {agentLabel}
        </Badge>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {renderParts(message)}
      </div>
    </div>
  );
}
