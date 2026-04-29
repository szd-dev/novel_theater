import { AGENT_COLORS } from "@/components/chat/tool-meta";
import type { BeautifulMentionsTheme } from "lexical-beautiful-mentions";

export const MENTION_COLOR = AGENT_COLORS.actor;

export const editorTheme: {
  paragraph: string;
  beautifulMentions: BeautifulMentionsTheme;
} = {
  paragraph: "mb-0",
  beautifulMentions: {
    "@": "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-sm font-medium whitespace-nowrap",
    "@Focused": "outline-none ring-2 ring-ring ring-offset-2",
  },
};
