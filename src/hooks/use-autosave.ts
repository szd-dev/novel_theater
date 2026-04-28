"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseAutosaveOptions {
  content: string;
  savedContent: string;
  onSave: () => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

interface UseAutosaveReturn {
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveImmediately: () => Promise<void>;
  isDirty: boolean;
}

export function useAutosave({
  content,
  savedContent,
  onSave,
  delay = 1500,
  enabled = true,
}: UseAutosaveOptions): UseAutosaveReturn {
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const isDirty = content !== savedContent;

  const saveImmediately = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isDirty) return;

    setSaveStatus("saving");
    const startTime = Date.now();
    try {
      await onSaveRef.current();
      const elapsed = Date.now() - startTime;
      // Ensure "Saving..." shows for at least 600ms
      if (elapsed < 600) {
        await new Promise((resolve) => setTimeout(resolve, 600 - elapsed));
      }
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [isDirty]);

  // Debounced auto-save
  useEffect(() => {
    if (!isDirty || !enabled) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      saveImmediately();
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content, isDirty, enabled, delay, saveImmediately]);

  // Reset status to idle when content matches savedContent
  useEffect(() => {
    if (!isDirty && saveStatus === "saved") {
      setSaveStatus("idle");
    }
  }, [isDirty, saveStatus]);

  // Cmd+S / Ctrl+S keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveImmediately();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveImmediately]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (isDirty) {
        onSaveRef.current().catch(() => {
          /* best-effort save on unmount */
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { saveStatus, saveImmediately, isDirty };
}
