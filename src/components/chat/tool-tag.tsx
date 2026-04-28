"use client";

import { getToolMeta, getHeadlineValue } from "@/components/chat/tool-meta";
import type { AgentKey } from "@/components/chat/tool-meta";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DynamicToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

interface ToolTagProps {
  toolName: string;
  state: DynamicToolState;
  input?: Record<string, unknown>;
  onClick?: () => void;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export function ToolTag({ toolName, state, input, onClick }: ToolTagProps) {
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

  return (
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
                  <span>{truncate(String(value), 50)}</span>
                </div>
              ))}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export { type AgentKey };
