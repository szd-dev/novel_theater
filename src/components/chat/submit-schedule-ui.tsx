"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { getHeadlineValue, AGENT_COLORS } from "./tool-meta";
import { Calendar, Drama, ScrollText, Package, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToolProgress } from "@/components/chat/tool-progress-context";
import { useSheetContent } from "@/components/chat/sheet-context";
import type { ToolProgress } from "@/lib/tool-progress";

const GM_PURPLE = AGENT_COLORS.gm;

const PHASE_LABELS: Record<string, string> = {
  actor: "角色演绎",
  scribe: "文学叙事",
  archivist: "归档更新",
};

const PHASE_ICONS: Record<string, React.ElementType> = {
  actor: Drama,
  scribe: ScrollText,
  archivist: Package,
};

function isErrorResult(result: unknown): result is string {
  return typeof result === "string" && result.startsWith("Error:");
}

function getErrorText(result: unknown, statusError: unknown): string {
  if (isErrorResult(result)) {
    return result.slice(6).trim();
  }
  if (statusError instanceof Error) {
    return statusError.message;
  }
  if (typeof statusError === "string") {
    return statusError;
  }
  return "";
}

export const SubmitScheduleUI = makeAssistantToolUI({
  toolName: "submit_schedule",
  render: ({ args, result, status, toolCallId }) => {
    const toolProgress = useToolProgress();
    const progress: ToolProgress | undefined = toolCallId
      ? toolProgress?.[toolCallId]
      : undefined;

    const isRunning = status.type === "running";
    const isError =
      status.type === "incomplete" ||
      status.type === "requires-action" ||
      (status.type === "complete" && isErrorResult(result));

    const schedule = args?.schedule as
      | Array<{ character?: string; direction?: string }>
      | undefined;
    const hasMultipleCharacters =
      Array.isArray(schedule) && schedule.length > 1;

    const showProgress =
      hasMultipleCharacters &&
      isRunning &&
      progress != null &&
      progress.status === "running";

    const phaseKey = progress?.phase ?? "";
    const phaseLabel = PHASE_LABELS[phaseKey] ?? phaseKey;
    const PhaseIconComponent = PHASE_ICONS[phaseKey] ?? Settings;
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

    const baseClassName =
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium";

    if (showProgress) {
      return (
        <div className="flex flex-col gap-1">
          <div
            className={baseClassName}
            style={{
              color: GM_PURPLE,
              backgroundColor: `${GM_PURPLE}15`,
            }}
          >
            <span
              className="size-1.5 shrink-0 rounded-full animate-pulse"
              style={{ backgroundColor: GM_PURPLE }}
            />
            <Calendar className="size-3 shrink-0" />
            <span>排程中...</span>
          </div>
          <div
            className="w-full max-w-[200px] rounded-md p-1.5"
            style={{ backgroundColor: `${phaseColor}10` }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <PhaseIconComponent className="size-3 shrink-0" />
                <span className="text-xs font-medium truncate">
                  {phaseLabel}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {progress.current}
                </span>
              </div>
              <span
                className="text-xs tabular-nums shrink-0"
                style={{ color: phaseColor }}
              >
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
        </div>
      );
    }

    if (isRunning) {
      return (
        <div
          className={baseClassName}
          style={{
            color: GM_PURPLE,
            backgroundColor: `${GM_PURPLE}15`,
          }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full animate-pulse"
            style={{ backgroundColor: GM_PURPLE }}
          />
          <Calendar className="size-3 shrink-0" />
          <span>排程中...</span>
        </div>
      );
    }

    if (isError) {
      const errorText = getErrorText(
        result,
        status.type === "incomplete" ? status.error : undefined,
      );

      return (
        <div
          className={cn(baseClassName, "max-w-full flex-wrap")}
          style={{
            color: "#EF4444",
            backgroundColor: "#EF444415",
          }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: "#EF4444" }}
          />
          <Calendar className="size-3 shrink-0" />
          <span>排程失败</span>
          {errorText && (
            <span className="opacity-70 truncate max-w-[200px]">
              {errorText}
            </span>
          )}
        </div>
      );
    }

    const headline = getHeadlineValue(
      "submit_schedule",
      args as Record<string, unknown>,
    );

    const setSheetContent = useSheetContent();

    return (
      <button
        type="button"
        className={cn(baseClassName, "cursor-pointer")}
        style={{
          color: "#10B981",
          backgroundColor: "#10B98115",
        }}
        onClick={() =>
          setSheetContent({
            kind: "tool-detail",
            toolName: "submit_schedule",
            input: args as Record<string, unknown>,
            output: typeof result === "string" ? result : JSON.stringify(result),
            state: "output-available",
          })
        }
      >
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: "#10B981" }}
        />
        <Calendar className="size-3 shrink-0" />
        <span>{headline ? `排程 · ${headline}` : "排程"}</span>
      </button>
    );
  },
});
