"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatLayout } from "@/components/chat/chat-layout";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { SceneIndicator } from "@/components/chat/scene-indicator";
import { useEffect, useState, useCallback, useMemo, type FormEvent } from "react";

export default function Home() {
  const [threadId, setThreadId] = useState<string>("");
  const [input, setInput] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("novel-theater-thread-id");
    if (stored) {
      setThreadId(stored);
    } else {
      const newId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setThreadId(newId);
      localStorage.setItem("novel-theater-thread-id", newId);
    }
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/narrative",
        body: { threadId },
      }),
    [threadId]
  );

  const { messages, status, sendMessage, stop } = useChat({ transport });

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      sendMessage({ text });
      setInput("");
    },
    [input, sendMessage]
  );

  return (
    <ChatLayout>
      <SceneIndicator threadId={threadId} />
      <MessageList messages={messages} status={status} />
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        status={status}
        onStop={stop}
      />
    </ChatLayout>
  );
}
