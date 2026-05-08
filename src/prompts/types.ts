/**
 * Shared types for the prompt system.
 * Prompt functions are pure: accept a state snapshot, return a system-prompt string.
 */
export interface PromptConfig {
  language?: string; // default: "zh-CN"
  verbosity?: "minimal" | "normal" | "detailed";
}

export interface GMPromptState {
  storyContext?: string; // from buildStoryContext()
}

export interface ActorPromptState {
  /** Full character .md content */
  characterFile?: string;
  storyContext?: string; // from buildStoryContext()
}

export interface ScribePromptState {
  /** From style.md */
  styleGuide?: string;
  storyContext?: string; // from buildStoryContext()
}

export interface ArchivistPromptState {
  storyContext?: string; // from buildStoryContext()
}

/** ANTI_REVIEW_PROMPT env var → prepended to all agent system prompts if non-empty */
export function getAntiReviewPrefix(): string {
  const prefix = process.env.ANTI_REVIEW_PROMPT?.trim();
  return prefix ? `${prefix}\n\n` : "";
}
