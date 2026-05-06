"use client";

import { getToolMeta, getHeadlineValue, AGENT_COLORS } from "@/components/chat/tool-meta";
import type { AgentKey } from "@/components/chat/tool-meta";
import type { DynamicToolState } from "@/components/chat/types";
import type { ToolProgress } from "@/lib/tool-progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<string, string> = {
  actor: "角色演绎",
  scribe: "文学叙事",
  archivist: "归档更新",
};

const PHASE_ICONS: Record<string, string> = {
  actor: "🎭",
  scribe: "📝",
  archivist: "📦",
};

interface ToolTagProps {
  toolName: string;
  state: DynamicToolState;
  input?: Record<string, unknown>;
  onClick?: () => void;
  progress?: ToolProgress;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export function ToolTag({ toolName, state, input, onClick, progress }: ToolTagProps) {
  const meta = getToolMeta(toolName);
  const headline =
    state === "output-available"
      ? getHeadlineValue(toolName, input ?? {})
      : "";

  const dotColor =
    state === "output-available"
      ? "#10B981"
      : state === "output-error"
        ? "#EF4444"
        : meta.color;

  const dotClassName = cn(
    "size-1.5 shrink-0 rounded-full",
    state === "input-streaming" && "animate-pulse"
  );

  let label: string;
  switch (state) {
    case "input-streaming":
      label = `${meta.icon} 思考中...`;
      break;
    case "input-available":
      label = `${meta.icon} 执行中...`;
      break;
    case "output-available":
      label = headline
        ? `${meta.icon} ${meta.label} · ${headline}`
        : `${meta.icon} ${meta.label}`;
      break;
    case "output-error":
      label = `${meta.icon} 错误`;
      break;
  }

  const hasTooltip = input && Object.keys(input).length > 0;

  const showProgress =
    toolName === "submit_schedule" &&
    progress &&
    progress.status === "running";

  const phaseKey = progress?.phase ?? "";
  const phaseLabel = PHASE_LABELS[phaseKey] ?? phaseKey;
  const phaseIcon = PHASE_ICONS[phaseKey] ?? "⚙️";
  const phaseColor =
    phaseKey === "actor"
      ? AGENT_COLORS.actor
      : phaseKey === "scribe"
        ? AGENT_COLORS.scribe
        : phaseKey === "archivist"
          ? AGENT_COLORS.archivist
          : "#6B7280";

  const percentage = showProgress
    ? Math.round((progress.step / progress.total) * 100)
    : 0;

  return (
    <>
      <TooltipProvider delay={300}>
        <Tooltip>
          <TooltipTrigger
            render={(props) => (
              <button
                {...props}
                type="button"
                onClick={onClick}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors hover:opacity-80"
                style={{
                  color: meta.color,
                  backgroundColor: `${meta.color}15`,
                }}
              >
                <span
                  className={dotClassName}
                  style={{ backgroundColor: dotColor }}
                />
                {label}
              </button>
            )}
          />
          {hasTooltip && (
            <TooltipContent side="top" sideOffset={4}>
              {Object.entries(input!)
                .slice(0, 3)
                .map(([key, value]) => (
                  <div key={key} className="flex gap-1">
                    <span className="opacity-60">{key}:</span>
                    <span>{truncate(typeof value === "object" && value !== null ? JSON.stringify(value) : String(value), 50)}</span>
                  </div>
                ))}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      {showProgress && (
        <div className="mt-1 w-full max-w-[200px] rounded-md p-1.5" style={{ backgroundColor: `${phaseColor}10` }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-xs shrink-0">{phaseIcon}</span>
              <span className="text-xs font-medium truncate">{phaseLabel}</span>
              <span className="text-xs text-muted-foreground truncate">{progress.current}</span>
            </div>
            <span className="text-xs tabular-nums shrink-0" style={{ color: phaseColor }}>
              {progress.step}/{progress.total}
            </span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${percentage}%`,
                backgroundColor: phaseColor,
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
