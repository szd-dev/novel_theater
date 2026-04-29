"use client";

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

const MIN_HEIGHT = 40;
const MAX_HEIGHT = 350;

export function AutoResizePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const updateHeight = () => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return;

      rootElement.style.height = "auto";
      const scrollHeight = rootElement.scrollHeight;
      const clamped = Math.max(MIN_HEIGHT, Math.min(scrollHeight, MAX_HEIGHT));
      rootElement.style.height = `${clamped}px`;

      if (scrollHeight > MAX_HEIGHT) {
        rootElement.style.overflowY = "auto";
      } else {
        rootElement.style.overflowY = "hidden";
      }
    };

    updateHeight();
    return editor.registerUpdateListener(() => {
      requestAnimationFrame(updateHeight);
    });
  }, [editor]);

  return null;
}
