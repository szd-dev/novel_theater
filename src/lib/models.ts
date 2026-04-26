import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { setOpenAIAPI } from "@openai/agents-openai";
import { setTracingDisabled } from "@openai/agents";

// Our provider only supports /v1/chat/completions, not /v1/responses.
// createOpenAI()('model') defaults to responses API, must use .chat() for chat-completions.
setOpenAIAPI("chat_completions");
setTracingDisabled(true);

export type AgentRole = "gm" | "actor" | "scribe" | "archivist";

export interface ModelConfig {
  provider: "openai" | "anthropic";
  model: string;
}

function envModel(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function inferProvider(modelName: string): "openai" | "anthropic" {
  if (modelName.startsWith("claude-") || modelName.startsWith("anthropic:")) {
    return "anthropic";
  }
  return "openai";
}

function normalizeModelName(modelName: string): string {
  return modelName.replace(/^anthropic:/, "");
}

function resolveModelConfig(role: AgentRole): ModelConfig {
  const defaults: Record<AgentRole, string> = {
    gm: "claude-sonnet-4-20250514",
    actor: "claude-sonnet-4-20250514",
    scribe: "claude-sonnet-4-20250514",
    archivist: "gpt-4o-mini",
  };

  const envKeys: Record<AgentRole, string> = {
    gm: "MODEL_GM",
    actor: "MODEL_ACTOR",
    scribe: "MODEL_SCRIBE",
    archivist: "MODEL_ARCHIVIST",
  };

  const modelName = envModel(envKeys[role], defaults[role]);
  const provider = inferProvider(modelName);
  return { provider, model: normalizeModelName(modelName) };
}

function createModel(config: ModelConfig) {
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  if (config.provider === "anthropic") {
    const provider = createAnthropic(baseURL ? { baseURL } : undefined);
    return provider(config.model);
  }
  // .chat() forces /v1/chat/completions; default provider('model') uses /v1/responses
  const provider = createOpenAI(baseURL ? { baseURL } : undefined);
  return provider.chat(config.model);
}

export function getModel(role: AgentRole) {
  const config = resolveModelConfig(role);
  return aisdk(createModel(config));
}
