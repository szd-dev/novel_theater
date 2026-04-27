"use client";

import { useState, useCallback, useEffect, useMemo, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ProjectSelector } from "@/components/chat/project-selector";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { SceneIndicator } from "@/components/chat/scene-indicator";
import { Separator } from "@/components/ui/separator";

interface ProjectChatProps {
  projectId: string;
  onProjectSelect: (id: string) => void;
}

function ProjectChat({ projectId, onProjectSelect }: ProjectChatProps) {
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/narrative",
        body: { projectId },
      }),
    [projectId],
  );

  const { messages, status, sendMessage, stop, setMessages } = useChat({
    transport,
    id: projectId,
    onFinish: ({ messages: currentMessages }) => {
      if (!projectId || currentMessages.length === 0) return;
      fetch("/api/narrative", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, messages: currentMessages }),
      }).catch(() => { /* best-effort save */ });
    },
  });

  const persistMessages = useCallback((msgs: UIMessage[]) => {
    if (!projectId || msgs.length === 0) return;
    fetch("/api/narrative", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, messages: msgs }),
    }).catch(() => { /* best-effort save */ });
  }, [projectId]);

  const handleStop = useCallback(() => {
    // Capture current messages before stopping — onFinish won't fire on abort
    const currentMessages = [...messages];
    stop();
    persistMessages(currentMessages);
  }, [messages, stop, persistMessages]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/narrative?projectId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setMessages(data.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => { cancelled = true; };
  }, [projectId, setMessages]);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      sendMessage({ text });
      setInput("");
    },
    [input, sendMessage],
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
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">自由剧场</h1>
        <span className="text-xs text-muted-foreground">Free Theater</span>
      </header>
      <Separator />
      <div className="flex min-h-0 flex-1 flex-row">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border">
          <ProjectSelector
            currentProjectId={projectId}
            onProjectSelect={onProjectSelect}
            onProjectDelete={handleProjectDelete}
            variant="sidebar"
          />
        </aside>
        <main className="flex min-h-0 flex-1 flex-col">
          <SceneIndicator threadId={projectId} />
          <MessageList messages={messages} status={status} threadId={projectId} />
          <ChatInput
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            status={status}
            onStop={handleStop}
          />
        </main>
      </div>
    </div>
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
    <ProjectChat
      key={projectId}
      projectId={projectId}
      onProjectSelect={handleProjectSelect}
    />
  );
}
