"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AgentLabel, type AgentKey } from "@/components/chat/agent-label";
import { ToolCallCard } from "@/components/chat/tool-call-card";
import { splitBySteps } from "@/components/chat/message-segments";
import { SessionModal } from "@/components/chat/session-modal";

interface MessageItemProps {
  message: UIMessage;
  threadId?: string;
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
      const dp = part as {
        toolName?: string;
        state?: "input-streaming" | "input-available" | "output-available" | "output-error";
        input?: Record<string, unknown>;
        output?: string;
        error?: string;
      };
      return (
        <ToolCallCard
          key={i}
          toolName={dp.toolName ?? ""}
          state={dp.state ?? "input-streaming"}
          input={dp.input}
          output={dp.output}
          error={dp.error}
        />
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
      const dp = part as {
        toolName?: string;
        state?: "input-streaming" | "input-available" | "output-available" | "output-error";
        input?: Record<string, unknown>;
        output?: string;
        error?: string;
      };
      return (
        <ToolCallCard
          key={i}
          toolName={dp.toolName ?? ""}
          state={dp.state ?? "input-streaming"}
          input={dp.input}
          output={dp.output}
          error={dp.error}
        />
      );
    }
    return null;
  });
}

export function MessageItem({ message, threadId }: MessageItemProps) {
  const isUser = message.role === "user";
  const agentLabel = extractAgentLabel(message);
  const segments = !isUser ? splitBySteps(message) : [];
  const [showSession, setShowSession] = useState(false);
  const hasToolCalls = message.parts.some((p) => p.type === "dynamic-tool");

  if (isUser || segments.length <= 1) {
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
          {!isUser && hasToolCalls && threadId && (
            <button
              onClick={() => setShowSession(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="查看执行日志"
            >
              📋
            </button>
          )}
        </div>
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
        {threadId && (
          <SessionModal
            threadId={threadId}
            open={showSession}
            onOpenChange={setShowSession}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        {hasToolCalls && threadId && (
          <button
            onClick={() => setShowSession(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
            title="查看执行日志"
          >
            📋
          </button>
        )}
      </div>
      {segments.map((segment, i) => (
        <div key={i} className="flex flex-col gap-1">
          <AgentLabel agent={segment.agent} />
          <div className="max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed bg-muted text-foreground">
            {renderSegmentParts(segment.parts)}
          </div>
        </div>
      ))}
      {threadId && (
        <SessionModal
          threadId={threadId}
          open={showSession}
          onOpenChange={setShowSession}
        />
      )}
    </div>
  );
}
