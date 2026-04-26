/**
 * Shared types for the prompt system.
 * Prompt functions are pure: accept a state snapshot, return a system-prompt string.
 */
export interface PromptConfig {
  language?: string; // default: "zh-CN"
  verbosity?: "minimal" | "normal" | "detailed";
}

export interface GMPromptState {
  currentSceneId?: string;
  currentLocation?: string;
  currentTime?: string;
  activeCharacter?: string;
  storyContext?: string; // from buildStoryContext()
}

export interface ActorPromptState {
  /** Full character .md content */
  characterFile?: string;
  storyContext?: string; // from buildStoryContext()
  /** Formatted interaction log entries */
  interactionLog?: string;
}

export interface ScribePromptState {
  /** From style.md */
  styleGuide?: string;
  /** Formatted interaction log */
  interactionLog?: string;
  storyContext?: string; // from buildStoryContext()
}

export interface ArchivistPromptState {
  /** Structured narrative summary from GM */
  narrativeSummary?: string;
  /** Literary text from Scribe */
  literaryText?: string;
  storyContext?: string; // from buildStoryContext()
}
