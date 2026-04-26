import type { UIMessage } from "ai";
import type { AgentKey } from "@/components/chat/agent-label";

export interface Segment {
  agent: AgentKey;
  parts: UIMessage["parts"];
}

function toolNameToAgentKey(toolName: string): AgentKey {
  if (toolName === "call_actor") return "actor";
  if (toolName === "call_scribe") return "scribe";
  if (toolName === "call_archivist") return "archivist";
  return "gm";
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

    if (part.type === "dynamic-tool") {
      const dp = part as { toolName?: string };
      if (dp.toolName) {
        currentAgent = toolNameToAgentKey(dp.toolName);
      }
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
