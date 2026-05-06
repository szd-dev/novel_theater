"use client";

import { Badge } from "@/components/ui/badge";

export interface SceneIndicatorProps {
  sceneId?: string;
  location?: string;
}

export function SceneIndicator({ sceneId, location }: SceneIndicatorProps) {
  if (!location && !sceneId) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b text-sm text-muted-foreground">
      {location && (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">&#x1F4CD;</span>
          {location}
        </span>
      )}
      {sceneId && (
        <Badge variant="outline">
          <span aria-hidden="true">&#x1F4CB;</span>
          {sceneId}
        </Badge>
      )}
    </div>
  );
}
