"use client";

import { type ReactElement } from "react";
import type { UIMessage } from "ai";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AgentLabel } from "@/components/chat/agent-label";
import { ToolTag, type DynamicToolState } from "@/components/chat/tool-tag";
import { splitBySteps } from "@/components/chat/message-segments";
import { toolNameToAgentKey } from "@/components/chat/tool-meta";

interface MessageItemProps {
  message: UIMessage;
  onToolClick?: (tool: { toolName: string; input?: Record<string, unknown>; output?: string; error?: string; state?: DynamicToolState }) => void;
}

function extractAgentLabel(message: UIMessage): string | null {
  for (const part of message.parts) {
    if (part.type === "dynamic-tool") {
      const toolName = (part as { toolName?: string }).toolName;
      if (toolName) {
        const key = toolNameToAgentKey(toolName);
        if (key !== "gm") {
          return key.charAt(0).toUpperCase() + key.slice(1);
        }
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
  onToolClick?: (tool: {
    toolName: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
    state?: DynamicToolState;
  }) => void
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
    } else if (part.type === "dynamic-tool") {
      const dp = part as {
        toolName?: string;
        state?: DynamicToolState;
        input?: Record<string, unknown>;
        output?: string;
        error?: string;
        toolCallId?: string;
      };
      toolParts.push(
        <ToolTag
          key={dp.toolCallId ?? `tool-${i}`}
          toolName={dp.toolName ?? ""}
          state={dp.state ?? "input-streaming"}
          input={dp.input}
          onClick={
            onToolClick
              ? () =>
                  onToolClick({
                    toolName: dp.toolName ?? "",
                    input: dp.input,
                    output: dp.output,
                    error: dp.error,
                    state: dp.state,
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
