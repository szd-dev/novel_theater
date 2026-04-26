"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";

interface SceneState {
  currentSceneId: string;
  currentLocation: string;
  currentTime: string;
  activeCharacter: string;
}

interface SceneIndicatorProps {
  threadId?: string;
}

export function SceneIndicator({ threadId }: SceneIndicatorProps) {
  const [scene, setScene] = useState<SceneState | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!threadId) return;
    try {
      const res = await fetch(`/api/narrative/status?threadId=${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setScene(data);
      }
    } catch {
      // Silently fail — don't block chat
    }
  }, [threadId]);

  useEffect(() => {
    fetchStatus();
    // Poll every 5 seconds (debounced to avoid API spam)
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!scene || (!scene.currentLocation && !scene.currentSceneId)) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b text-sm text-muted-foreground">
      {scene.currentLocation && (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">&#x1F4CD;</span>
          {scene.currentLocation}
        </span>
      )}
      {scene.currentTime && (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">&#x23F0;</span>
          {scene.currentTime}
        </span>
      )}
      {scene.currentSceneId && (
        <Badge variant="outline">
          <span aria-hidden="true">&#x1F4CB;</span>
          {scene.currentSceneId}
        </Badge>
      )}
      {scene.activeCharacter && (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">&#x1F4A1;</span>
          {scene.activeCharacter}
        </span>
      )}
    </div>
  );
}
