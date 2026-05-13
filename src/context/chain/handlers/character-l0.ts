import { globNovelFiles, readNovelFile } from "@/store/story-files";
import { extractL0 } from "@/context/extract";
import { getOrCacheSceneData } from "./scene-context";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class CharacterL0Handler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const { resolvedSceneChars } = await getOrCacheSceneData(request);
    const allCharL0Map = await getOrCacheL0Map(request);

    const sceneCharL0: string[] = [];
    const sortedEntries = [...allCharL0Map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    for (const [name, l0] of sortedEntries) {
      const isInScene = resolvedSceneChars.some(
        (cn) => cn === name || cn.includes(name),
      );
      if (isInScene) {
        sceneCharL0.push(`${name}：${l0}`);
      }
    }

    if (sceneCharL0.length === 0) return { messages: [] };

    return {
      messages: [
        { label: "在场角色", content: sceneCharL0.join("\n") },
      ],
    };
  }
}

async function getOrCacheL0Map(
  request: ContextRequest,
): Promise<Map<string, string>> {
  const cacheKey = "allCharL0Map";
  const cached = request._cache.get(cacheKey) as Map<string, string> | undefined;
  if (cached) return cached;

  const allCharL0Map = new Map<string, string>();
  const charEntries = await globNovelFiles(request.storyDir, "characters");
  for (const entry of charEntries) {
    const charName = entry.replace("characters/", "").replace(".md", "");
    const content = await readNovelFile(request.storyDir, entry);
    if (!content) continue;
    const l0 = extractL0(content);
    if (l0) allCharL0Map.set(charName, l0);
  }

  request._cache.set(cacheKey, allCharL0Map);
  return allCharL0Map;
}

export { getOrCacheL0Map };
