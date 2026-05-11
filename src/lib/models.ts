import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import type { ModelSettings } from "@openai/agents-core/model";
import { setOpenAIAPI } from "@openai/agents-openai";
import { retryPolicies, setTracingDisabled } from "@openai/agents";
import { wrapLanguageModel } from "ai";
import { createDebugMiddleware } from "@/lib/ai-debug-middleware";

// Our provider only supports /v1/chat/completions, not /v1/responses.
// createOpenAI()('model') defaults to responses API, must use .chat() for chat-completions.
setOpenAIAPI("chat_completions");
setTracingDisabled(true);

export type AgentRole = "gm" | "actor" | "scribe" | "archivist";

export interface ModelConfig {
  provider: "openai" | "anthropic" | "deepseek";
  model: string;
}

function envModel(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function inferProvider(modelName: string): "openai" | "anthropic" | "deepseek" {
  if (modelName.startsWith("claude-") || modelName.startsWith("anthropic:")) {
    return "anthropic";
  }
  if (modelName.startsWith("deepseek/") || modelName.startsWith("deepseek:")) {
    return "deepseek";
  }
  return "openai";
}

function normalizeModelName(modelName: string): string {
  return modelName.replace(/^(anthropic|deepseek):/, "");
}

function resolveModelConfig(role: AgentRole): ModelConfig {
  const defaults: Record<AgentRole, string> = {
    gm: "qwen/qwen3.6-27B",
    actor: "deepseek/deepseek-v4-flash",
    scribe: "deepseek/deepseek-v4-flash",
    archivist: "qwen/qwen3.6-27B",
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
  if (config.provider === "deepseek") {
    const provider = createDeepSeek(
      baseURL
        ? { baseURL, apiKey: process.env.OPENAI_API_KEY || "unset" }
        : { apiKey: process.env.OPENAI_API_KEY || "unset" }
    );
    return provider(config.model);
  }
  // .chat() forces /v1/chat/completions; default provider('model') uses /v1/responses
  const provider = createOpenAI(baseURL ? { baseURL } : undefined);
  return provider.chat(config.model);
}

export function getModel(role: AgentRole) {
  const config = resolveModelConfig(role);
  const langModel = createModel(config);
  const wrapped = process.env.DEBUG_AI_ROUNDS
    ? wrapLanguageModel({
        model: langModel,
        middleware: createDebugMiddleware(config.model),
      })
    : langModel;
  return aisdk(wrapped);
}

/**
 * Returns model settings with provider-specific configuration.
 * DeepSeek V4 models require thinking to be explicitly marked as enabled
 * so the aisdk bridge correctly merges reasoning_content with tool_calls
 * in multi-turn conversations.
 */
export function getModelSettings(role: AgentRole): ModelSettings {
  const config = resolveModelConfig(role);

  const baseSettings: ModelSettings = {
    retry: {
      maxRetries: 3,
      backoff: {
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        multiplier: 2,
        jitter: true,
      },
      policy: retryPolicies.networkError(),
    },
  };

  if (config.provider === "deepseek") {
    return {
      ...baseSettings,
      providerData: {
        deepseek: {
          thinking: { type: "enabled" as const },
        },
      },
    };
  }
  return baseSettings;
}
