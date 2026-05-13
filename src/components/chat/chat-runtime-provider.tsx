"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";
import { createHistoryAdapter } from "./history-adapter";

/**
 * Detects failed tool calls encoded as `{"ok":false,...}` in the output
 * and fixes their state to `output-error` so the AI SDK converter
 * properly marks them with `isError: true`.
 */
function fixToolErrorStates(message: UIMessage): UIMessage {
  return {
    ...message,
    parts: message.parts?.map((part) => {
      if (
        part.type === "dynamic-tool" &&
        part.state === "output-available" &&
        part.output
      ) {
        try {
          const parsed = JSON.parse(part.output as string);
          if (
            parsed &&
            typeof parsed === "object" &&
            "ok" in parsed &&
            parsed.ok === false
          ) {
            return {
              ...part,
              output: undefined,
              state: "output-error" as const,
              errorText:
                typeof parsed.error === "string"
                  ? parsed.error
                  : undefined,
            };
          }
        } catch {
          // Not JSON output — keep as-is
        }
      }
      return part;
    }),
  };
}

interface ChatRuntimeProviderProps {
  children: React.ReactNode;
  projectId: string;
}

function ChatRuntimeProviderInner({
  children,
  projectId,
  messages: initialMessages,
}: ChatRuntimeProviderProps & { messages: UIMessage[] }) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/narrative",
        body: { projectId },
      }),
    [projectId],
  );

  const history = useMemo(() => createHistoryAdapter(projectId), [projectId]);

  const handleError = useCallback((err: Error) => {
    console.error("[Chat] Stream error:", err);
  }, []);

  const runtime = useChatRuntime({
    transport,
    messages: initialMessages,
    adapters: { history },
    onError: handleError,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

export function ChatRuntimeProvider({ children, projectId }: ChatRuntimeProviderProps) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    setInitialMessages(null);
    let cancelled = false;
    fetch(`/api/narrative?projectId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setInitialMessages((data.messages ?? []).map(fixToolErrorStates));
      })
      .catch((err) => {
        console.error("[Chat] Failed to load history:", err);
        if (!cancelled) setInitialMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (initialMessages === null) {
    return null;
  }

  return (
    <ChatRuntimeProviderInner projectId={projectId} messages={initialMessages}>
      {children}
    </ChatRuntimeProviderInner>
  );
}
