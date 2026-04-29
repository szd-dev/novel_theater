"use client";

import { useEffect, useRef } from "react";
import {
  $getRoot,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_HIGH,
  CLEAR_EDITOR_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { MentionData } from "../utils";
import { extractMentions } from "../utils";

interface SubmitOnEnterPluginProps {
  onSend: (text: string, mentions: MentionData[]) => void;
  menuOpen: boolean;
}

export function SubmitOnEnterPlugin({
  onSend,
  menuOpen,
}: SubmitOnEnterPluginProps) {
  const [editor] = useLexicalComposerContext();
  const menuOpenRef = useRef(menuOpen);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (menuOpenRef.current) {
          return false;
        }

        const shiftHeld = event?.shiftKey ?? false;
        if (shiftHeld) {
          event?.preventDefault();
          editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
          return true;
        }

        event?.preventDefault();

        let textToSend = "";
        let mentionsToSend: MentionData[] = [];

        editor.read(() => {
          const text = $getRoot().getTextContent().trim();
          if (text.length > 0) {
            textToSend = text;
            mentionsToSend = extractMentions();
          }
        });

        if (textToSend.length > 0) {
          onSend(textToSend, mentionsToSend);
          editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);
        }

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSend]);

  return null;
}
