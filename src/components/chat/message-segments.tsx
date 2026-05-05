import type { UIMessage } from "ai";
import { toolNameToAgentKey, type AgentKey } from "@/components/chat/tool-meta";
import { isDynamicToolPart } from "@/components/chat/types";

export interface Segment {
  agent: AgentKey;
  parts: UIMessage["parts"];
}

export function splitBySteps(message: UIMessage): Segment[] {
  const segments: Segment[] = [];
  let currentAgent: AgentKey = "gm";
  let currentParts: UIMessage["parts"] = [];

  for (const part of message.parts) {
    if (part.type === "step-start") {
      if (currentParts.length > 0) {
        segments.push({ agent: currentAgent, parts: currentParts });
      }
      currentParts = [];
      currentAgent = "gm";
      continue;
    }

    if (isDynamicToolPart(part) && part.toolName) {
      currentAgent = toolNameToAgentKey(part.toolName);
    }

    currentParts.push(part);
  }

  if (currentParts.length > 0) {
    segments.push({ agent: currentAgent, parts: currentParts });
  }

  if (segments.length === 0) {
    segments.push({ agent: "gm", parts: [] });
  }

  return segments;
}
