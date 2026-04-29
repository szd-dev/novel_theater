"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CodeMirrorEditor } from "@/components/chat/code-mirror-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

function useManualSave(options: {
  content: string;
  savedContent: string;
  onSave: () => Promise<void>;
  enabled?: boolean;
}) {
  const { content, savedContent, onSave, enabled = true } = options;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const isDirty = content !== savedContent;

  const saveImmediately = useCallback(async () => {
    if (!isDirty || !enabled) return;
    setSaveStatus("saving");
    try {
      await onSaveRef.current();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [isDirty, enabled]);

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

  // Reset status to idle when content matches savedContent
  useEffect(() => {
    if (!isDirty && saveStatus === "saved") {
      setSaveStatus("idle");
    }
  }, [isDirty, saveStatus]);

  // Best-effort save on unmount
  useEffect(() => {
    return () => {
      if (isDirty) {
        onSaveRef.current().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { saveStatus, saveImmediately, isDirty };
}

interface FileEditorSheetProps {
  projectId: string;
  filePath: string;
}

interface ConflictState {
  currentContent: string;
  currentHash: string;
  draft: string;
}

type ActiveTab = "state" | "directives";

const DIRECTIVES_ALLOWED_ROOTS = new Set(["world.md", "plot.md", "timeline.md"]);

function canHaveDirectives(filePath: string): boolean {
  if (filePath.startsWith("characters/")) return true;
  return DIRECTIVES_ALLOWED_ROOTS.has(filePath);
}

function directivesPath(filePath: string): string {
  return filePath.replace(".md", ".directives.md");
}

export function FileEditorSheet({
  projectId,
  filePath,
}: FileEditorSheetProps) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [originalHash, setOriginalHash] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("state");
  const [directivesContent, setDirectivesContent] = useState("");
  const [directivesSavedContent, setDirectivesSavedContent] = useState("");
  const [directivesHash, setDirectivesHash] = useState("");
  const [directivesExists, setDirectivesExists] = useState(false);
  const [directivesLoading, setDirectivesLoading] = useState(false);

  const fileName = filePath.split("/").pop() ?? filePath;
  const hasDirectivesSupport = canHaveDirectives(filePath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setActiveTab("state");

    fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load file: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setContent(data.data.content);
          setSavedContent(data.data.content);
          setOriginalHash(data.data.hash);
        } else {
          setLoadError(data.message ?? "Failed to load file");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load file");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    if (hasDirectivesSupport) {
      setDirectivesLoading(true);
      const dp = directivesPath(filePath);
      fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(dp)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.success) {
            setDirectivesContent(data.data.content);
            setDirectivesSavedContent(data.data.content);
            setDirectivesHash(data.data.hash);
            setDirectivesExists(true);
          } else {
            setDirectivesExists(false);
          }
        })
        .catch(() => {
          if (!cancelled) setDirectivesExists(false);
        })
        .finally(() => {
          if (!cancelled) setDirectivesLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [projectId, filePath, hasDirectivesSupport]);

  const save = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, content, hash: originalHash }),
    });

    if (res.status === 409) {
      const data = await res.json();
      setConflict({
        currentContent: data.currentContent,
        currentHash: data.currentHash,
        draft: content,
      });
    } else if (res.ok) {
      const data = await res.json();
      setOriginalHash(data.hash);
      setSavedContent(content);
      setConflict(null);
    } else {
      throw new Error(`Save failed: ${res.status}`);
    }
  }, [projectId, filePath, content, originalHash]);

  const { saveStatus, saveImmediately, isDirty } = useManualSave({
    content,
    savedContent,
    onSave: save,
    enabled: !loading && !conflict && activeTab === "state",
  });

  const saveDirectives = useCallback(async () => {
    const dp = directivesPath(filePath);
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: dp, content: directivesContent, hash: directivesHash, isDirectives: true }),
    });

    if (res.ok) {
      const data = await res.json();
      setDirectivesHash(data.hash);
      setDirectivesSavedContent(directivesContent);
    } else if (res.status === 409) {
      const data = await res.json();
      setDirectivesContent(data.currentContent);
      setDirectivesHash(data.currentHash);
      setDirectivesSavedContent(data.currentContent);
    } else {
      throw new Error(`Save directives failed: ${res.status}`);
    }
  }, [projectId, filePath, directivesContent, directivesHash]);

  const { saveStatus: directivesSaveStatus, saveImmediately: saveDirectivesImmediately, isDirty: directivesIsDirty } = useManualSave({
    content: directivesContent,
    savedContent: directivesSavedContent,
    onSave: saveDirectives,
    enabled: directivesExists && activeTab === "directives",
  });

  const createDirectives = useCallback(async () => {
    const dp = directivesPath(filePath);
    const emptyContent = `# ${fileName.replace(".md", "")} 作者指令\n\n`;
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: dp, content: emptyContent, isDirectives: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setDirectivesContent(emptyContent);
      setDirectivesSavedContent(emptyContent);
      setDirectivesHash(data.hash);
      setDirectivesExists(true);
    }
  }, [projectId, filePath, fileName]);

  const handleAcceptLatest = useCallback(() => {
    if (!conflict) return;
    setContent(conflict.currentContent);
    setOriginalHash(conflict.currentHash);
    setSavedContent(conflict.currentContent);
    setConflict(null);
  }, [conflict]);

  const handleSwitchToDraft = useCallback(() => {
    if (!conflict) return;
    setContent(conflict.draft);
    setConflict(null);
  }, [conflict]);

  const currentSaveStatus = activeTab === "directives" ? directivesSaveStatus : saveStatus;
  const currentIsDirty = activeTab === "directives" ? directivesIsDirty : isDirty;
  const currentSave = activeTab === "directives" ? saveDirectivesImmediately : saveImmediately;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <span>📄</span>
          <span>{fileName}</span>
          <span className="ml-auto flex items-center gap-2">
            {currentIsDirty && (
              <Button
                variant="outline"
                size="sm"
                onClick={currentSave}
                disabled={currentSaveStatus === "saving"}
                className="h-6 px-2 text-xs"
              >
                {currentSaveStatus === "saving" ? "Saving…" : "Save"}
              </Button>
            )}
            <span className="text-xs font-normal">
              {currentSaveStatus === "saved" && (
                <span className="text-emerald-600">Saved ✓</span>
              )}
              {currentSaveStatus === "error" && (
                <span className="text-destructive">Save failed</span>
              )}
              {currentIsDirty && currentSaveStatus === "idle" && (
                <span className="text-orange-500">Unsaved ●</span>
              )}
            </span>
          </span>
        </SheetTitle>
        <SheetDescription className="flex items-center justify-between">
          <span className="truncate text-xs">{filePath}</span>
          {activeTab === "state" && (
            <button
              type="button"
              onClick={() => setReadOnly((prev) => !prev)}
              className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              {readOnly ? "Read-only" : "Edit"}
            </button>
          )}
        </SheetDescription>
      </SheetHeader>

      {hasDirectivesSupport && (
        <div className="flex gap-1 border-b border-border px-4">
          <button
            type="button"
            onClick={() => setActiveTab("state")}
            className={cn(
              "px-3 py-2 text-sm",
              activeTab === "state" ? "border-b-2 border-foreground font-medium" : "text-muted-foreground",
            )}
          >
            状态
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("directives")}
            className={cn(
              "px-3 py-2 text-sm",
              activeTab === "directives" ? "border-b-2 border-foreground font-medium" : "text-muted-foreground",
            )}
          >
            作者指令 {directivesExists && "📋"}
          </button>
        </div>
      )}

      {activeTab === "state" && conflict && (
        <div className="mx-4 rounded-md border border-orange-500/30 bg-orange-500/10 p-3">
          <p className="text-sm font-medium text-orange-600">
            文件已被其他进程修改
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleAcceptLatest}
              className="rounded-md bg-orange-600 px-3 py-1 text-xs text-white hover:bg-orange-700 transition-colors"
            >
              Accept latest
            </button>
            <button
              type="button"
              onClick={handleSwitchToDraft}
              className="rounded-md border border-border px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors"
            >
              Switch to my draft
            </button>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 px-4 pt-2">
        {activeTab === "state" ? (
          loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : loadError ? (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{loadError}</p>
            </div>
          ) : (
            <div className="h-[calc(100dvh-180px)]">
              <CodeMirrorEditor
                initialValue={content}
                onChange={setContent}
                readOnly={readOnly}
              />
            </div>
          )
        ) : directivesLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : directivesExists ? (
          <div className="h-[calc(100dvh-180px)]">
            <CodeMirrorEditor
              initialValue={directivesContent}
              onChange={setDirectivesContent}
              readOnly={false}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">暂无作者指令</p>
            <button
              type="button"
              onClick={createDirectives}
              className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              创建作者指令
            </button>
          </div>
        )}
      </ScrollArea>
    </>
  );
}
