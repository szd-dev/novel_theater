"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, type Ref } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const FILE_TYPE_ICONS: Record<string, string> = {
  "world.md": "🌍",
  "style.md": "🎭",
  "plot.md": "📋",
  "timeline.md": "⏰",
  "debts.md": "💰",
  "chapters.md": "📖",
};

const DEFAULT_FILE_ICON = "📄";

const DIRECTORY_ICONS: Record<string, string> = {
  characters: "👤",
  scenes: "🎬",
};

const ROOT_FILES = ["world.md", "style.md", "plot.md", "timeline.md", "debts.md", "chapters.md"];

interface StoryFileTreeProps {
  projectId: string;
  selectedFilePath: string | null;
  onFileSelect: (path: string) => void;
}

export interface StoryFileTreeRef {
  refresh: () => void;
}

interface FileTreeState {
  root: string[];
  characters: string[];
  scenes: string[];
  directivesFiles: Set<string>;
}

export const StoryFileTree = forwardRef<StoryFileTreeRef, StoryFileTreeProps>(function StoryFileTree({
  projectId,
  selectedFilePath,
  onFileSelect,
}: StoryFileTreeProps, ref: Ref<StoryFileTreeRef>) {
  const [files, setFiles] = useState<FileTreeState>({ root: [], characters: [], scenes: [], directivesFiles: new Set() });
  const [loading, setLoading] = useState(false);
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set());

  const fetchFiles = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [charactersRes, scenesRes, rootDirectivesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/files?pattern=characters`),
        fetch(`/api/projects/${projectId}/files?pattern=scenes`),
        Promise.all(
          ["world.directives.md", "plot.directives.md", "timeline.directives.md"].map(
            (dp) => fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(dp)}`).then((r) => r.json()),
          ),
        ),
      ]);

      const charactersData = charactersRes.ok ? await charactersRes.json() : { files: [] };
      const scenesData = scenesRes.ok ? await scenesRes.json() : { files: [] };

      const characterFiles = (charactersData.success ? charactersData.files : []) as string[];
      const sceneFiles = (scenesData.success ? scenesData.files : []) as string[];

      const directivesNames = new Set<string>();

      const characterDirectives = characterFiles.filter((f) => f.endsWith(".directives.md"));
      for (const df of characterDirectives) {
        directivesNames.add(`characters/${df.replace(".directives.md", ".md")}`);
      }

      const rootDirectivesBase = ["world.md", "plot.md", "timeline.md"];
      for (let i = 0; i < rootDirectivesRes.length; i++) {
        if (rootDirectivesRes[i].success) {
          directivesNames.add(rootDirectivesBase[i]);
        }
      }

      const filteredCharacters = characterFiles.filter((f) => !f.endsWith(".directives.md"));
      const filteredScenes = sceneFiles.filter((f) => !f.endsWith(".directives.md"));

      setFiles({
        root: ROOT_FILES,
        characters: filteredCharacters,
        scenes: filteredScenes,
        directivesFiles: directivesNames,
      });
    } catch {
      // Silently fail — don't block UI
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  useImperativeHandle(ref, () => ({ refresh: fetchFiles }), [fetchFiles]);

  const toggleDir = useCallback((dir: string, open: boolean) => {
    setOpenDirs((prev) => {
      const next = new Set(prev);
      if (open) {
        next.add(dir);
      } else {
        next.delete(dir);
      }
      return next;
    });
  }, []);

  const directories = [
    { name: "characters", files: files.characters },
    { name: "scenes", files: files.scenes },
  ].filter((d) => d.files.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          设定文件
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={fetchFiles}
          disabled={loading}
          aria-label="刷新文件列表"
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="space-y-0.5 px-1">
          {files.root.map((file) => (
            <button
              key={file}
              onClick={() => onFileSelect(file)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                selectedFilePath === file && "bg-muted font-medium",
              )}
            >
              <span className="shrink-0">{FILE_TYPE_ICONS[file] || DEFAULT_FILE_ICON}</span>
              <span className="truncate">{file.replace(".md", "")}</span>
              {files.directivesFiles.has(file) && <span className="ml-auto shrink-0 text-xs" title="有作者指令">📋</span>}
            </button>
          ))}

          {directories.map((dir) => (
            <Collapsible
              key={dir.name}
              open={openDirs.has(dir.name)}
              onOpenChange={(open) => toggleDir(dir.name, open)}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium cursor-pointer hover:bg-muted">
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 transition-transform",
                    openDirs.has(dir.name) && "rotate-90",
                  )}
                />
                <span className="shrink-0">{DIRECTORY_ICONS[dir.name] || "📁"}</span>
                <span className="truncate">{dir.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{dir.files.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-0.5">
                  {dir.files.map((file) => {
                    const filePath = `${dir.name}/${file}`;
                    const hasDirectives = files.directivesFiles.has(filePath);
                    return (
                      <button
                        key={file}
                        onClick={() => onFileSelect(filePath)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md pl-7 pr-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                          selectedFilePath === filePath && "bg-muted font-medium",
                        )}
                      >
                        <span className="shrink-0">{DEFAULT_FILE_ICON}</span>
                        <span className="truncate">{file.replace(".md", "")}</span>
                        {hasDirectives && <span className="ml-auto shrink-0 text-xs" title="有作者指令">📋</span>}
                      </button>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});
