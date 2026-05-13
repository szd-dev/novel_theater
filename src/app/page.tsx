"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuiState, useAui, useAuiEvent } from "@assistant-ui/react";
import type { ChatStatus } from "ai";
import { ProjectSelector } from "@/components/chat/project-selector";
import { StoryFileTree, type StoryFileTreeRef } from "@/components/chat/story-file-tree";
import { Thread } from "@/components/assistant-ui/thread";
import type { MentionData } from "@/components/chat/chat-input/utils";
import { SceneIndicator } from "@/components/chat/scene-indicator";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent as SheetContentUI,
} from "@/components/ui/sheet";
import { ToolDetailContent } from "@/components/chat/tool-detail-sheet";
import type { ToolProgress } from "@/lib/tool-progress";
import { FileEditorSheet } from "@/components/chat/file-editor-sheet";
import { ToolProgressProvider } from "@/components/chat/tool-progress-context";
import { ChatRuntimeProvider } from "@/components/chat/chat-runtime-provider";
import { SubmitScheduleUI } from "@/components/chat/submit-schedule-ui";
import { SheetContentProvider, type SheetContent } from "@/components/chat/sheet-context";
import { cn } from "@/lib/utils";

interface ProjectChatProps {
  projectId: string;
  onProjectSelect: (id: string) => void;
}

function ProjectChat({ projectId, onProjectSelect }: ProjectChatProps) {
  const [sheetContent, setSheetContent] = useState<SheetContent>(null);
  const fileTreeRef = useRef<StoryFileTreeRef>(null);

  const api = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const status: ChatStatus = isRunning ? "streaming" : "ready";

  useAuiEvent("thread.runEnd", () => {
    fileTreeRef.current?.refresh();
  });

  const handleStop = useCallback(() => {
    api.thread().cancelRun();
    fileTreeRef.current?.refresh();
  }, [api]);

  const [statusData, setStatusData] = useState<{
    sceneId?: string;
    location?: string;
    toolProgress?: Record<string, ToolProgress>;
  }>({});

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!projectId) {
      setStatusData({});
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/narrative/status?projectId=${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setStatusData({
            sceneId: data.sceneId,
            location: data.location,
            toolProgress: data.toolProgress,
          });
        }
      } catch {
        // Silently fail — don't block chat
      }
    };

    poll();
    const ms = isRunning ? 1000 : 5000;
    intervalRef.current = setInterval(poll, ms);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [projectId, isRunning]);

  const handleSend = useCallback(
    (text: string, _mentions: MentionData[]) => {
      if (!text.trim()) return;
      api.thread().append({
        role: "user",
        content: [{ type: "text", text }],
      });
    },
    [api],
  );

  const handleProjectDelete = useCallback(
    (id: string) => {
      if (id === projectId) {
        onProjectSelect(id);
      }
    },
    [projectId, onProjectSelect],
  );

  return (
    <SheetContentProvider setSheetContent={setSheetContent}>
    <ToolProgressProvider toolProgress={statusData.toolProgress}>
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b border-sidebar-border px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">自由剧场</h1>
        <span className="text-xs text-muted-foreground">Free Theater</span>
      </header>
      <Separator />
      <div className="flex min-h-0 flex-1 flex-row">
        <aside className="bg-background text-foreground flex min-h-0 w-56 shrink-0 flex-col gap-2 overflow-hidden border-r border-sidebar-border py-2">
          <ProjectSelector
            currentProjectId={projectId}
            onProjectSelect={onProjectSelect}
            onProjectDelete={handleProjectDelete}
            variant="sidebar"
          />
          <Separator />
          <StoryFileTree
            ref={fileTreeRef}
            projectId={projectId}
            selectedFilePath={sheetContent?.kind === "file-editor" ? sheetContent.filePath : null}
            onFileSelect={(path) => setSheetContent({ kind: "file-editor", filePath: path, projectId })}
          />
        </aside>
        <main className="flex min-h-0 flex-1 flex-col">
          <SceneIndicator sceneId={statusData.sceneId} location={statusData.location} />
          <Thread
            projectId={projectId}
            onSend={handleSend}
            status={status}
            onStop={handleStop}
          />
          <SubmitScheduleUI />
        </main>
      </div>
      <Sheet open={sheetContent !== null} onOpenChange={(open) => !open && setSheetContent(null)}>
        <SheetContentUI
          side="right"
          className={cn(
            sheetContent?.kind === "file-editor"
              ? "!w-[800px] sm:!max-w-[800px]"
              : "!w-[800px] sm:!max-w-[800px]",
          )}
        >
          {sheetContent?.kind === "tool-detail" && (
            <ToolDetailContent
              toolName={sheetContent.toolName}
              input={sheetContent.input}
              output={sheetContent.output}
              error={sheetContent.error}
              state={sheetContent.state}
            />
          )}
          {sheetContent?.kind === "file-editor" && (
            <FileEditorSheet
              projectId={sheetContent.projectId}
              filePath={sheetContent.filePath}
            />
          )}
        </SheetContentUI>
      </Sheet>
    </div>
    </ToolProgressProvider>
    </SheetContentProvider>
  );
}

export default function Home() {
  const [projectId, setProjectId] = useState<string | null>(null);

  const handleProjectSelect = useCallback((id: string) => {
    setProjectId(id);
  }, []);

  if (!projectId) {
    return (
      <ProjectSelector
        currentProjectId={null}
        onProjectSelect={handleProjectSelect}
      />
    );
  }

  return (
    <ChatRuntimeProvider key={projectId} projectId={projectId}>
      <ProjectChat
        projectId={projectId}
        onProjectSelect={handleProjectSelect}
      />
    </ChatRuntimeProvider>
  );
}
