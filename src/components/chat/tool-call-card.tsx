"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ToolCallCardProps {
  toolName: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
}

const TOOL_META: Record<string, { label: string; color: string }> = {
  call_actor: { label: "演员", color: "#EC4899" },
  call_scribe: { label: "书记", color: "#F59E0B" },
  call_archivist: { label: "场记", color: "#10B981" },
  clear_interaction_log: { label: "清除记录", color: "#8B5CF6" },
};

const DEFAULT_META = { label: "工具", color: "#6B7280" };

function getToolMeta(toolName: string) {
  return TOOL_META[toolName] ?? DEFAULT_META;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={cn(
        "shrink-0 transition-transform duration-200 text-muted-foreground",
        expanded && "rotate-180"
      )}
    >
      <path
        d="M3.5 5.25L7 8.75L10.5 5.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ToolCallCard({ toolName, state, input, output, error }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolMeta(toolName);
  const isStreaming = state === "input-streaming";
  const isRunning = state === "input-available";
  const isDone = state === "output-available";
  const isError = state === "output-error";
  const hasExpandableContent = isDone && !!output;

  const statusText = isStreaming
    ? "思考中..."
    : isRunning
      ? "执行中..."
      : isDone
        ? "✓ 已完成"
        : "✗ 错误";

  const statusColor = isStreaming || isRunning
    ? meta.color
    : isDone
      ? "#10B981"
      : "#EF4444";

  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 p-3",
        isStreaming && "animate-pulse"
      )}
      style={{ borderLeftColor: meta.color, borderLeftWidth: "3px" }}
    >
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 text-left",
          hasExpandableContent && "cursor-pointer",
          !hasExpandableContent && "cursor-default"
        )}
        onClick={() => hasExpandableContent && setExpanded((v) => !v)}
        disabled={!hasExpandableContent}
      >
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: meta.color }}
        />
        <span className="text-sm font-medium text-foreground">
          {meta.label}
        </span>
        <span
          className="text-xs"
          style={{ color: statusColor }}
        >
          {statusText}
        </span>
        {hasExpandableContent && <ChevronIcon expanded={expanded} />}
      </button>

      {isRunning && input && Object.keys(input).length > 0 && (
        <div className="mt-1.5 pl-4 text-xs text-muted-foreground truncate">
          {Object.entries(input)
            .slice(0, 2)
            .map(([k, v]) => `${k}: ${typeof v === "string" ? v.slice(0, 40) : String(v).slice(0, 40)}`)
            .join(" · ")}
        </div>
      )}

      {hasExpandableContent && expanded && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md bg-muted/50 p-2.5">
          <pre className="whitespace-pre-wrap text-xs text-foreground leading-relaxed">
            {output}
          </pre>
        </div>
      )}

      {isError && error && (
        <div className="mt-1.5 pl-4 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
