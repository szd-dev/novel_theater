import type { LexicalNode, ElementNode } from "lexical";
import { $getRoot } from "lexical";
import { $isBeautifulMentionNode } from "lexical-beautiful-mentions";
import type { BeautifulMentionNode, BeautifulMentionsItemData } from "lexical-beautiful-mentions";

export interface MentionData {
  trigger: string;
  value: string;
  data?: Record<string, BeautifulMentionsItemData>;
}

function collectMentionNodes(node: LexicalNode): BeautifulMentionNode[] {
  const mentions: BeautifulMentionNode[] = [];

  if ($isBeautifulMentionNode(node)) {
    mentions.push(node);
  }

  if ("getChildren" in node) {
    for (const child of (node as ElementNode).getChildren()) {
      mentions.push(...collectMentionNodes(child));
    }
  }

  return mentions;
}

/**
 * Extract all @mentions from the current editor state.
 * MUST be called inside `editor.read()` or `editor.update()`.
 */
export function extractMentions(): MentionData[] {
  const root = $getRoot();
  const nodes = collectMentionNodes(root);
  return nodes.map((node) => ({
    trigger: node.getTrigger(),
    value: node.getValue(),
    data: node.getData(),
  }));
}
