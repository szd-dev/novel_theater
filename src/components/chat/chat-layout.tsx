"use client";

import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

interface ChatLayoutProps {
  children: ReactNode;
}

export function ChatLayout({ children }: ChatLayoutProps) {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">
          自由剧场
        </h1>
        <span className="text-xs text-muted-foreground">
          Free Theater
        </span>
      </header>
      <Separator />
      <div className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
