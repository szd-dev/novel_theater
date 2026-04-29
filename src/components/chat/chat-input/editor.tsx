"use client";

import { forwardRef, useState, useMemo } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import {
  BeautifulMentionsPlugin,
  createBeautifulMentionNode,
} from "lexical-beautiful-mentions";
import type { BeautifulMentionComponentProps } from "lexical-beautiful-mentions";

import { useCharacters } from "@/components/chat/use-characters";
import { cn } from "@/lib/utils";
import { editorTheme, MENTION_COLOR } from "./theme";
import type { MentionData } from "./utils";
import { SubmitOnEnterPlugin } from "./plugins/submit-on-enter";
import { AutoResizePlugin } from "./plugins/auto-resize";
import { MentionMenu, MentionMenuItem } from "./mention-menu";

const MentionComponent = forwardRef<
  HTMLDivElement,
  BeautifulMentionComponentProps
>(({ trigger, value, ...other }, ref) => {
  return (
    <div
      {...other}
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-4xl px-2 py-0.5",
        "text-xs font-medium whitespace-nowrap"
      )}
      style={{
        color: MENTION_COLOR,
        backgroundColor: `${MENTION_COLOR}15`,
      }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: MENTION_COLOR }}
      />
      {trigger}
      {value}
    </div>
  );
});

MentionComponent.displayName = "MentionComponent";

const CustomMentionNode = createBeautifulMentionNode(MentionComponent);

interface ChatInputEditorProps {
  projectId: string;
  onSend: (text: string, mentions: MentionData[]) => void;
  disabled: boolean;
}

export function ChatInputEditor({
  projectId,
  onSend,
  disabled,
}: ChatInputEditorProps) {
  const { characters } = useCharacters(projectId);
  const [menuOpen, setMenuOpen] = useState(false);

  const mentionItems = useMemo(
    () => ({
      "@": characters.map((c) => ({ value: c.name, l0: c.l0 })),
    }),
    [characters]
  );

  const initialConfig = useMemo(
    () => ({
      namespace: "ChatInput",
      nodes: [...CustomMentionNode],
      theme: editorTheme,
      onError: (error: Error) => {
        console.error("[Lexical]", error);
      },
    }),
    []
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={cn("relative", disabled && "pointer-events-none opacity-50")}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className="min-h-[40px] max-h-[350px] overflow-y-auto w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 outline-none"
              aria-placeholder="输入你的指令..."
              placeholder={<div />}
            />
          }
          placeholder={
            <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground select-none">
              输入你的指令...
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <BeautifulMentionsPlugin
          items={mentionItems}
          creatable={false}
          allowSpaces={false}
          autoSpace={true}
          menuComponent={MentionMenu}
          menuItemComponent={MentionMenuItem}
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={() => setMenuOpen(false)}
        />
        <HistoryPlugin />
        <ClearEditorPlugin />
        <SubmitOnEnterPlugin onSend={onSend} menuOpen={menuOpen} />
        <AutoResizePlugin />
      </div>
    </LexicalComposer>
  );
}
