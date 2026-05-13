"use client";

import { createContext, useContext } from "react";
import type { ToolProgress } from "@/lib/tool-progress";

const ToolProgressContext = createContext<
  Record<string, ToolProgress> | undefined
>(undefined);

interface ToolProgressProviderProps {
  children: React.ReactNode;
  toolProgress?: Record<string, ToolProgress>;
}

export function ToolProgressProvider({
  children,
  toolProgress,
}: ToolProgressProviderProps) {
  return (
    <ToolProgressContext.Provider value={toolProgress}>
      {children}
    </ToolProgressContext.Provider>
  );
}

export function useToolProgress(): Record<string, ToolProgress> | undefined {
  return useContext(ToolProgressContext);
}
