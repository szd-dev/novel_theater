"use client";

import { useState, useCallback } from "react";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";

function countByType(parts: UIMessage["parts"]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of parts) {
    counts[p.type] = (counts[p.type] ?? 0) + 1;
  }
  return counts;
}

function SpikeChat({ projectId }: { projectId: string }) {
  const [transport] = useState(
    () =>
      new AssistantChatTransport({
        api: "/api/narrative",
        body: { projectId },
      }),
  );

  const runtime = useChatRuntime({
    transport,
    id: `spike-${projectId}`,
    onFinish: useCallback(({ messages }: { messages: UIMessage[] }) => {
      const allParts = messages.flatMap((m) => m.parts);
      const partTypes = [...new Set(allParts.map((p) => p.type))];
      console.log("[SPIKE] Unique part types:", partTypes);
      console.log("[SPIKE] Part type counts:", countByType(allParts));
      const nonTextParts = allParts.filter((p) => p.type !== "text");
      if (nonTextParts.length > 0) {
        console.log("[SPIKE] Non-text parts:", JSON.stringify(nonTextParts, null, 2));
      }
      console.log("[SPIKE] Total messages:", messages.length, "Total parts:", allParts.length);
    }, []),
    onError: useCallback((error: Error) => {
      console.error("[SPIKE] Stream error:", error);
    }, []),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <header className="flex shrink-0 items-center gap-3 px-4 py-3 border-b border-border">
          <h1 className="text-lg font-semibold">SPIKE: Assistant UI Transport Test</h1>
          <span className="text-xs text-muted-foreground">projectId={projectId}</span>
        </header>
        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-2">
            <ThreadPrimitive.Messages>
              {({ message }) => (
                <MessagePrimitive.Root
                  key={message.id}
                  className="mb-4"
                >
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    {message.role === "user" ? "You" : "Assistant"}
                  </div>
                  <MessagePrimitive.Parts />
                </MessagePrimitive.Root>
              )}
            </ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>
          <div className="shrink-0 border-t border-border px-4 py-3">
            <ComposerPrimitive.Root>
              <div className="flex items-center gap-2">
                <ComposerPrimitive.Input
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Send a message to test the transport..."
                  autoFocus
                />
                <ComposerPrimitive.Send className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
                  Send
                </ComposerPrimitive.Send>
              </div>
            </ComposerPrimitive.Root>
          </div>
        </ThreadPrimitive.Root>
      </div>
      <div className="fixed bottom-4 right-4 rounded bg-black/80 px-3 py-1.5 text-xs text-green-400 font-mono">
        Open DevTools Console for part type logs
      </div>
    </AssistantRuntimeProvider>
  );
}

export default function SpikePage() {
  const [projectIdInput, setProjectIdInput] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);

  if (!projectId) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-xl font-semibold">SPIKE: Assistant UI Transport</h1>
          <p className="text-sm text-muted-foreground">Enter a project ID to begin testing</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (projectIdInput.trim()) setProjectId(projectIdInput.trim());
            }}
            className="flex gap-2"
          >
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-64"
              placeholder="Project ID (e.g. p001)"
              value={projectIdInput}
              onChange={(e) => setProjectIdInput(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Start Spike
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <SpikeChat projectId={projectId} />;
}
