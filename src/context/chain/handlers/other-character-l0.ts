import { getOrCacheSceneData } from "./scene-context";
import { getOrCacheL0Map } from "./character-l0";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class OtherCharacterL0Handler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const { resolvedSceneChars } = await getOrCacheSceneData(request);
    const allCharL0Map = await getOrCacheL0Map(request);

    const otherCharL0: string[] = [];
    const sortedEntries = [...allCharL0Map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    for (const [name, l0] of sortedEntries) {
      const isInScene = resolvedSceneChars.some(
        (cn) => cn === name || cn.includes(name),
      );
      if (!isInScene) {
        otherCharL0.push(`${name}：${l0}`);
      }
    }

    if (otherCharL0.length === 0) return { messages: [] };

    return {
      messages: [
        { label: "已知角色", content: otherCharL0.join("\n") },
      ],
    };
  }
}
