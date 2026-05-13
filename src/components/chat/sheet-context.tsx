"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ToolClickPayload } from "@/components/chat/types";

export type SheetContent =
  | {
      kind: "tool-detail";
      toolName: string;
      input?: Record<string, unknown>;
      output?: string;
      error?: string;
      state?: ToolClickPayload["state"];
    }
  | { kind: "file-editor"; filePath: string; projectId: string }
  | null;

export type SetSheetContent = (content: SheetContent) => void;

const SheetContentContext = createContext<SetSheetContent>(() => {});

export function useSheetContent(): SetSheetContent {
  return useContext(SheetContentContext);
}

interface SheetContentProviderProps {
  children: ReactNode;
  setSheetContent: SetSheetContent;
}

export function SheetContentProvider({
  children,
  setSheetContent,
}: SheetContentProviderProps) {
  return (
    <SheetContentContext.Provider value={setSheetContent}>
      {children}
    </SheetContentContext.Provider>
  );
}
