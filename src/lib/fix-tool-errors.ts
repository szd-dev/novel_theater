import type { UIMessage } from "ai";

/**
 * Fixes stale `state` fields on dynamic-tool parts loaded from chat history.
 *
 * Problem: When tool outputs arrive via streaming, the ai-sdk-stream adapter
 * correctly emits `tool-output-error` events, which set `state: "output-error"`.
 * However, older (or pre-fix) history was saved with `state: "output-available"`
 * even when the output was `{"ok":false,"error":"..."}`.
 *
 * assistant-ui's AISDKMessageConverter only checks the `state` field to
 * determine `isError` — it never inspects the output content. So stale
 * `output-available` states cause error cards to render as success.
 *
 * This function corrects the state field by inspecting the output content,
 * ensuring that parts with error-shaped outputs get `state: "output-error"`
 * and `errorText` populated. Also deduplicates messages by id (keeps last).
 */
export function fixToolErrorStates(messages: UIMessage[]): UIMessage[] {
  const deduped = deduplicateById(messages);
  return deduped.map((msg) => {
    if (!msg.parts) return msg;

    let needsFix = false;
    const fixedParts = msg.parts.map((part) => {
      if (
        part.type === "dynamic-tool" &&
        part.state === "output-available" &&
        typeof part.output === "string"
      ) {
        const errorText = parseOutputError(part.output);
        if (errorText !== null) {
          needsFix = true;
          const { output: _output, ...rest } = part;
          return {
            ...rest,
            state: "output-error" as const,
            errorText,
          };
        }
      }
      return part;
    });

    return needsFix ? { ...msg, parts: fixedParts } : msg;
  });
}

function parseOutputError(output: string): string | null {
  try {
    const parsed = JSON.parse(output);
    if (
      parsed != null &&
      typeof parsed === "object" &&
      "ok" in parsed &&
      parsed.ok === false
    ) {
      return typeof parsed.error === "string"
        ? parsed.error
        : "工具执行失败";
    }
  } catch {}
  return null;
}

function deduplicateById(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>();
  const result: UIMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const id = messages[i].id;
    if (!seen.has(id)) {
      seen.add(id);
      result.unshift(messages[i]);
    }
  }
  return result;
}
