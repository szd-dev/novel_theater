"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AGENT_NAMES } from "@/components/chat/tool-meta";

type AgentKey = keyof typeof AGENT_NAMES;

interface AgentLabelProps {
  agent: AgentKey;
  isActive?: boolean;
}

const AGENT_COLOR_CLASSES: Record<
  string,
  { text: string; bg: string; dot: string; border: string }
> = {
  gm: {
    text: "text-purple-500",
    bg: "bg-purple-500/10",
    dot: "bg-purple-500",
    border: "border-purple-500/40",
  },
  actor: {
    text: "text-pink-500",
    bg: "bg-pink-500/10",
    dot: "bg-pink-500",
    border: "border-pink-500/40",
  },
  scribe: {
    text: "text-amber-500",
    bg: "bg-amber-500/10",
    dot: "bg-amber-500",
    border: "border-amber-500/40",
  },
  archivist: {
    text: "text-emerald-500",
    bg: "bg-emerald-500/10",
    dot: "bg-emerald-500",
    border: "border-emerald-500/40",
  },
};

export function AgentLabel({ agent, isActive = false }: AgentLabelProps) {
  const name = AGENT_NAMES[agent];
  const colors = AGENT_COLOR_CLASSES[agent] ?? AGENT_COLOR_CLASSES["gm"];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-transparent font-medium",
        colors.text,
        colors.bg,
        isActive && colors.border
      )}
    >
      {isActive && (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full animate-pulse",
            colors.dot
          )}
        />
      )}
      {name}
    </Badge>
  );
}

export { AGENT_NAMES, type AgentKey };
