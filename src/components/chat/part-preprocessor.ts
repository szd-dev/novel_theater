import type { UIMessage } from "ai";

import type { DynamicToolPart } from "./types";
import { isDynamicToolPart } from "./types";

/**
 * Preprocesses UIMessage parts to convert custom "dynamic-tool" parts
 * to "data-dynamic-tool" parts that assistant-ui can render.
 *
 * assistant-ui silently skips unknown part types. By converting our custom
 * dynamic-tool parts to the data-* convention, we enable assistant-ui to
 * pass them through for custom rendering by adapters like `convertDataPart`.
 *
 * All other part types (text, step-start, etc.) pass through unchanged.
 *
 * All original DynamicToolPart fields are preserved in the `data` object:
 * toolName, state, input, output, error, errorText, toolCallId, title,
 * providerExecuted, preliminary.
 */
export function preprocessParts(parts: Readonly<UIMessage["parts"]>): UIMessage["parts"] {
  return parts.map((part) => {
    if (isDynamicToolPart(part)) {
      const { type: _type, ...rest } = part as DynamicToolPart;
      return {
        type: "data-dynamic-tool" as const,
        data: rest as Record<string, unknown>,
      } as UIMessage["parts"][number];
    }
    return part;
  });
}
