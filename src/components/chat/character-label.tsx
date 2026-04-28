"use client";

import { AGENT_COLORS } from "@/components/chat/tool-meta";
import { cn } from "@/lib/utils";

const DEFAULT_COLOR = AGENT_COLORS.actor;

interface CharacterLabelProps {
  characterName: string;
  color?: string;
}

export function CharacterLabel({ characterName, color }: CharacterLabelProps) {
  const resolvedColor = color ?? DEFAULT_COLOR;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-4xl px-2 py-0.5",
        "text-xs font-medium whitespace-nowrap"
      )}
      style={{
        color: resolvedColor,
        backgroundColor: `${resolvedColor}15`,
      }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: resolvedColor }}
      />
      {characterName}
    </span>
  );
}
