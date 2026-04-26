"use client";

import type { UIMessage } from "ai";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AgentLabel, AGENT_COLORS, type AgentKey } from "@/components/chat/agent-label";
import { splitBySteps, type Segment } from "@/components/chat/message-segments";

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

function getAgentKey(toolName: string): AgentKey {
  if (toolName === "call_actor") return "actor";
  if (toolName === "call_scribe") return "scribe";
  if (toolName === "call_archivist") return "archivist";
  return "gm";
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
    if (part.type === "step-start") {
      return null;
    }
    if (part.type === "dynamic-tool") {
      const dp = part as { toolName?: string; state?: string; output?: string; input?: unknown };
      const toolName = dp.toolName ?? "";
      const state = dp.state ?? "";
      const agentKey = getAgentKey(toolName);

      if (state === "output-available") {
        return (
          <div key={i} className="flex flex-col gap-1">
            <AgentLabel agent={agentKey} />
            {dp.output && (
              <span className="whitespace-pre-wrap text-sm">{String(dp.output)}</span>
            )}
          </div>
        );
      }

      if (state === "output-error") {
        return (
          <div key={i} className="flex flex-col gap-1">
            <AgentLabel agent={agentKey} />
            <span className="text-sm text-destructive">Error</span>
          </div>
        );
      }

      return (
        <div key={i} className="flex items-center gap-1.5">
          <AgentLabel agent={agentKey} isActive={true} />
        </div>
      );
    }
    return null;
  });
}

function renderSegmentParts(parts: UIMessage["parts"]) {
  if (!parts || parts.length === 0) return null;
  return parts.map((part, i) => {
    if (part.type === "text") {
      return (
        <span key={i} className="whitespace-pre-wrap">
          {part.text}
        </span>
      );
    }
    if (part.type.startsWith("data-")) return null;
    if (part.type === "step-start") return null;
    if (part.type === "dynamic-tool") {
      const dp = part as { toolName?: string; state?: string; output?: string };
      if (dp.state === "output-available" && dp.output) {
        return (
          <span key={i} className="whitespace-pre-wrap text-sm">
            {String(dp.output)}
          </span>
        );
      }
      if (dp.state === "output-error") {
        return (
          <span key={i} className="text-sm text-destructive">Error</span>
        );
      }
      return null;
    }
    return null;
  });
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";
  const agentLabel = extractAgentLabel(message);
  const segments = !isUser ? splitBySteps(message) : [];

  if (isUser || segments.length <= 1) {
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

  return (
    <div className="flex w-full flex-col items-start gap-2">
      {segments.map((segment, i) => (
        <div key={i} className="flex flex-col gap-1">
          <AgentLabel agent={segment.agent} />
          <div className="max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed bg-muted text-foreground">
            {renderSegmentParts(segment.parts)}
          </div>
        </div>
      ))}
    </div>
  );
}
