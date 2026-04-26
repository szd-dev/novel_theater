"use client";

import { AGENT_COLORS, type AgentKey } from "@/components/chat/agent-label";
import { cn } from "@/lib/utils";

const PIPELINE_STEPS = [
  { key: "gm" as AgentKey, label: "GM" },
  { key: "actor" as AgentKey, label: "Actor" },
  { key: "scribe" as AgentKey, label: "Scribe" },
  { key: "archivist" as AgentKey, label: "Archivist" },
] as const;

interface ProgressIndicatorProps {
  currentStep?: number;
  isThinking?: boolean;
}

export function ProgressIndicator({
  currentStep,
  isThinking = false,
}: ProgressIndicatorProps) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {PIPELINE_STEPS.map((step, index) => {
        const isCompleted = currentStep != null && index < currentStep;
        const isCurrent = currentStep === index;
        const color = AGENT_COLORS[step.key];

        return (
          <div key={step.key} className="inline-flex items-center gap-1.5">
            {index > 0 && (
              <span
                className={cn(
                  "w-3 h-px",
                  isCompleted ? "opacity-60" : "opacity-20"
                )}
                style={{ backgroundColor: isCompleted ? color : undefined }}
              />
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-4xl px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all duration-300",
                isCurrent && "ring-1"
              )}
              style={{
                color: isCompleted || isCurrent ? color : "var(--muted-foreground)",
                backgroundColor: isCompleted || isCurrent ? `${color}15` : "transparent",
                "--tw-ring-color": isCurrent ? `${color}40` : undefined,
              } as React.CSSProperties}
            >
              {isCurrent && isThinking && (
                <span className="relative flex size-1.5">
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="relative inline-flex size-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </span>
              )}
              {isCurrent && !isThinking && (
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              {step.label}
            </span>
          </div>
        );
      })}

      {isThinking && (
        <span className="ml-2 text-xs text-muted-foreground animate-pulse">
          Thinking...
        </span>
      )}
    </div>
  );
}

export { PIPELINE_STEPS };
