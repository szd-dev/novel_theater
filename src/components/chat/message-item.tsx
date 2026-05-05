"use client";

import { type ReactElement } from "react";
import type { UIMessage } from "ai";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AgentLabel } from "@/components/chat/agent-label";
import { ToolTag } from "@/components/chat/tool-tag";
import { splitBySteps } from "@/components/chat/message-segments";
import { toolNameToAgentKey } from "@/components/chat/tool-meta";
import { isDynamicToolPart, type ToolClickPayload } from "@/components/chat/types";

interface MessageItemProps {
  message: UIMessage;
  onToolClick?: (tool: ToolClickPayload) => void;
}

function extractAgentLabel(message: UIMessage): string | null {
  for (const part of message.parts) {
    if (isDynamicToolPart(part) && part.toolName) {
      const key = toolNameToAgentKey(part.toolName);
      if (key !== "gm") {
        return key.charAt(0).toUpperCase() + key.slice(1);
      }
    }
  }
  for (const part of message.parts) {
    if (part.type.startsWith("data-") && "data" in part) {
      const data = (part as { data: Record<string, unknown> }).data;
      if (typeof data.agent === "string") return data.agent;
    }
  }
  return null;
}

interface SeparatedParts {
  textParts: ReactElement[];
  toolParts: ReactElement[];
}

function separateParts(
  parts: UIMessage["parts"],
  onToolClick?: (tool: ToolClickPayload) => void
): SeparatedParts {
  const textParts: ReactElement[] = [];
  const toolParts: ReactElement[] = [];

  parts.forEach((part, i) => {
    if (part.type === "text") {
      const text = part.text;
      if (!text || !text.trim()) return;
      textParts.push(
        <span key={`text-${i}`} className="whitespace-pre-wrap">
          {text}
        </span>
      );
    } else if (isDynamicToolPart(part)) {
      toolParts.push(
        <ToolTag
          key={part.toolCallId ?? `tool-${i}`}
          toolName={part.toolName ?? ""}
          state={part.state ?? "input-streaming"}
          input={part.input}
          onClick={
            onToolClick
              ? () =>
                  onToolClick({
                    toolName: part.toolName ?? "",
                    input: part.input,
                    output: part.output,
                    error: part.error,
                    state: part.state,
                  })
              : () => {}
          }
        />
      );
    }
  });

  return { textParts, toolParts };
}

export function MessageItem({ message, onToolClick }: MessageItemProps) {
  const isUser = message.role === "user";
  const agentLabel = extractAgentLabel(message);
  const segments = !isUser ? splitBySteps(message) : [];

  if (isUser || segments.length <= 1) {
    const { textParts, toolParts } = separateParts(
      message.parts,
      !isUser ? onToolClick : undefined
    );

    return (
      <div
        className={cn(
          "flex w-full flex-col gap-1",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div className="flex items-center gap-2">
          {agentLabel && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {agentLabel}
            </Badge>
          )}
        </div>
        {textParts.length > 0 && (
          <div
            className={cn(
              "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            )}
          >
            {textParts}
          </div>
        )}
        {toolParts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{toolParts}</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-2">
      {segments.map((segment, i) => {
        const { textParts, toolParts } = separateParts(
          segment.parts,
          onToolClick
        );
        return (
          <div key={i} className="flex flex-col gap-1">
            <AgentLabel agent={segment.agent} />
            {textParts.length > 0 && (
              <div className="max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed bg-muted text-foreground">
                {textParts}
              </div>
            )}
            {toolParts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{toolParts}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
