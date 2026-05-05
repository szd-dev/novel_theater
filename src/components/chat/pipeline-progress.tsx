"use client";

import { useState, useEffect, useRef } from "react";
import { AGENT_COLORS } from "@/components/chat/tool-meta";

interface ToolProgress {
  status: "running" | "completed" | "idle";
  phase: string;
  step: number;
  total: number;
  current: string;
}

interface StatusResponse {
  toolProgress?: Record<string, ToolProgress>;
}

interface PipelineProgressProps {
  projectId: string;
  isActive: boolean;
}

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

export function PipelineProgress({ projectId, isActive }: PipelineProgressProps) {
  const [progress, setProgress] = useState<ToolProgress | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    async function poll() {
      try {
        const res = await fetch(`/api/narrative/status?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) return;
        const data: StatusResponse = await res.json();
        const submitProgress = data.toolProgress?.submit_schedule;
        if (submitProgress && submitProgress.status === "running") {
          setProgress(submitProgress);
        } else {
          setProgress(null);
        }
      } catch {}
    }

    poll();
    intervalRef.current = setInterval(poll, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, projectId]);

  if (!isActive || !progress) {
    return null;
  }

  const phaseKey = progress.phase;
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

  const percentage = Math.min(100, Math.max(0, (progress.step / progress.total) * 100));

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex size-5 items-center justify-center rounded-md text-xs"
            style={{ backgroundColor: `${phaseColor}20` }}
          >
            {phaseIcon}
          </span>
          <span className="text-sm font-medium text-foreground">{phaseLabel}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {progress.step} / {progress.total}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {phaseKey === "actor" ? progress.current : phaseLabel}
        </span>
        <span className="text-xs font-medium tabular-nums" style={{ color: phaseColor }}>
          {Math.round(percentage)}%
        </span>
      </div>

      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${percentage}%`,
            backgroundColor: phaseColor,
          }}
        />
      </div>
    </div>
  );
}
