"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AGENT_COLORS, AGENT_NAMES } from "@/components/chat/tool-meta";

type AgentKey = keyof typeof AGENT_COLORS;

interface AgentLabelProps {
  agent: AgentKey;
  isActive?: boolean;
}

export function AgentLabel({ agent, isActive = false }: AgentLabelProps) {
  const color = AGENT_COLORS[agent];
  const name = AGENT_NAMES[agent];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-transparent font-medium",
        isActive && "border-current/20"
      )}
      style={{
        color,
        backgroundColor: `${color}15`,
        borderColor: isActive ? `${color}40` : "transparent",
      }}
    >
      {isActive && (
        <span
          className="size-1.5 shrink-0 rounded-full animate-pulse"
          style={{ backgroundColor: color }}
        />
      )}
      {name}
    </Badge>
  );
}

export { AGENT_COLORS, AGENT_NAMES, type AgentKey };
