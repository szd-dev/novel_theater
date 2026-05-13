"use client";

import type { UIMessage } from "ai";
import type {
  ThreadHistoryAdapter,
  MessageFormatAdapter,
  MessageFormatRepository,
  MessageFormatItem,
  MessageStorageEntry,
} from "@assistant-ui/react";

export function createHistoryAdapter(projectId: string): ThreadHistoryAdapter {
  return {
    async load() {
      return { messages: [] };
    },
    async append(_item) {
      // no-op: useChatRuntime uses withFormat instead
    },
    withFormat<TMessage, TStorageFormat extends Record<string, unknown>>(
      fmt: MessageFormatAdapter<TMessage, TStorageFormat>,
    ) {
      return {
        async load(): Promise<MessageFormatRepository<TMessage>> {
          try {
            const res = await fetch(
              `/api/narrative?projectId=${encodeURIComponent(projectId)}`,
            );
            if (!res.ok) {
              console.error(
                `[HistoryAdapter] Failed to load messages, status=${res.status}`,
              );
              return { messages: [] };
            }
            const data = await res.json();
            const rawMessages: UIMessage[] = data.messages ?? [];

            const messages: MessageFormatItem<TMessage>[] = rawMessages.map(
              (msg) => {
                const { id: _id, ...content } = msg;
                const entry: MessageStorageEntry<TStorageFormat> = {
                  id: msg.id,
                  parent_id: null,
                  format: fmt.format,
                  content: content as unknown as TStorageFormat,
                };
                return fmt.decode(entry);
              },
            );

            return { messages };
          } catch (err) {
            console.error("[HistoryAdapter] Error loading messages:", err);
            return { messages: [] };
          }
        },
        async append(item: MessageFormatItem<TMessage>): Promise<void> {
          try {
            // Fetch existing messages
            const res = await fetch(
              `/api/narrative?projectId=${encodeURIComponent(projectId)}`,
            );
            const data = await res.json();
            const existingMessages: UIMessage[] = data.messages ?? [];

            // Decode the new item to get the UIMessage
            const decoded = fmt.decode({
              id: fmt.getId(item.message),
              parent_id: item.parentId,
              format: fmt.format,
              content: fmt.encode(item),
            });

            // Append and save
            existingMessages.push(decoded.message as unknown as UIMessage);

            await fetch("/api/narrative", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId,
                messages: existingMessages,
              }),
            });
          } catch (err) {
            console.error("[HistoryAdapter] Error appending message:", err);
          }
        },
      };
    },
  };
}