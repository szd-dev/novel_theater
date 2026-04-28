"use client";

import { useState, useEffect, useCallback } from "react";
import type { Project } from "@/project/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ProjectSelectorProps {
  currentProjectId: string | null;
  onProjectSelect: (projectId: string) => void;
  onProjectDelete?: (projectId: string) => void;
  variant?: "default" | "sidebar";
}

export function ProjectSelector({
  currentProjectId,
  onProjectSelect,
  onProjectDelete,
  variant = "default",
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setProjects(data.projects);
        }
      }
    } catch {
      // Silently fail — don't block UI
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.project) {
          setNewProjectName("");
          setIsCreating(false);
          await fetchProjects();
          onProjectSelect(data.project.id);
        }
      }
    } catch {
      // Silently fail
    }
  }, [newProjectName, fetchProjects, onProjectSelect]);

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleCreate();
      } else if (e.key === "Escape") {
        setIsCreating(false);
        setNewProjectName("");
      }
    },
    [handleCreate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
        if (res.ok) {
          setDeleteConfirmId(null);
          await fetchProjects();
          onProjectDelete?.(id);
        }
      } catch {
        // Silently fail
      }
    },
    [fetchProjects, onProjectDelete],
  );

  if (variant === "sidebar") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            项目
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setIsCreating(true);
              setNewProjectName("");
            }}
            aria-label="新建项目"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Button>
        </div>

        {isCreating && (
          <div className="px-3 pb-2">
            <div className="flex gap-1">
              <Input
                placeholder="项目名称"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={handleCreateKeyDown}
                className="h-7 text-xs"
              />
              <Button size="xs" onClick={handleCreate} disabled={!newProjectName.trim()}>
                创建
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="space-y-0.5 px-1">
            {projects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "group flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                  project.id === currentProjectId && "bg-muted font-medium",
                )}
                onClick={() => onProjectSelect(project.id)}
              >
                <span className="truncate">{project.name}</span>
                {deleteConfirmId === project.id ? (
                  <Button
                    variant="destructive"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id);
                    }}
                    aria-label="确认删除"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(project.id);
                    }}
                    aria-label="删除项目"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            自由剧场
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            选择或创建一个项目开始创作
          </p>
        </div>

        {isCreating ? (
          <div className="flex gap-2">
            <Input
              placeholder="项目名称"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              autoFocus
            />
            <Button onClick={handleCreate} disabled={!newProjectName.trim()}>
              创建
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIsCreating(false);
                setNewProjectName("");
              }}
            >
              取消
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setIsCreating(true)}
            variant="outline"
            className="w-full"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新建项目
          </Button>
        )}

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-1">
            {projects.length === 0 && !isCreating && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                还没有项目，点击上方按钮创建第一个
              </p>
            )}
            {projects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "group flex items-center justify-between rounded-lg px-3 py-2.5 cursor-pointer hover:bg-muted",
                  project.id === currentProjectId && "bg-muted",
                )}
                onClick={() => onProjectSelect(project.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{project.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {project.id}
                  </p>
                </div>
                {deleteConfirmId === project.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(project.id);
                      }}
                    >
                      确认
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(null);
                      }}
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(project.id);
                    }}
                    aria-label="删除项目"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
