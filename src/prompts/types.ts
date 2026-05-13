/**
 * Shared types for the prompt system.
 * Prompt functions are pure: accept a state snapshot, return a system-prompt string.
 */
export interface PromptConfig {
  language?: string; // default: "zh-CN"
  verbosity?: "minimal" | "normal" | "detailed";
}

export interface GMPromptState {
  // reserved for future per-invocation state
}

export interface ActorPromptState {
  // reserved for future per-invocation state
}

export interface ScribePromptState {
  // reserved for future per-invocation state
}

export interface ArchivistPromptState {
  // reserved for future per-invocation state
}

/** ANTI_REVIEW_PROMPT env var → prepended to all agent system prompts if non-empty */
export function getAntiReviewPrefix(): string {
  const prefix = process.env.ANTI_REVIEW_PROMPT?.trim();
  return prefix ? `${prefix}\n\n` : "";
}
