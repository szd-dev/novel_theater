import { readNovelFile } from "@/store/story-files";
import {
  findLatestScene,
  extractCharactersInScene,
  extractSceneLocation,
  extractLocationFromWorld,
} from "@/context/extract";
import { findCharacterByName } from "@/context/character-resolver";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class SceneContextHandler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const latestSceneName = await findLatestScene(request.storyDir);
    if (!latestSceneName) {
      return {
        messages: [{ label: "当前场景", content: "故事尚未开始" }],
      };
    }

    const sceneContent = await readNovelFile(
      request.storyDir,
      `scenes/${latestSceneName}`,
    );
    if (!sceneContent) return { messages: [] };

    return {
      messages: [{ label: "当前场景", content: sceneContent }],
    };
  }
}

async function getOrCacheSceneData(
  request: ContextRequest,
): Promise<{
  sceneContent: string | null;
  charactersInScene: string[];
  resolvedSceneChars: string[];
  locationDescription: string;
}> {
  const cacheKey = "sceneData";
  const cached = request._cache.get(cacheKey) as
    | ReturnType<typeof getOrCacheSceneData>
    | undefined;
  if (cached) return cached;

  const latestSceneName = await findLatestScene(request.storyDir);
  const sceneContent = latestSceneName
    ? await readNovelFile(request.storyDir, `scenes/${latestSceneName}`)
    : null;

  const charactersInScene = sceneContent
    ? extractCharactersInScene(sceneContent)
    : [];

  const resolvedSceneChars: string[] = [];
  for (const rawName of charactersInScene) {
    const resolved = await findCharacterByName(request.storyDir, rawName);
    resolvedSceneChars.push(resolved || rawName);
  }

  let locationDescription = "";
  if (sceneContent) {
    const sceneLocation = extractSceneLocation(sceneContent);
    if (sceneLocation) {
      const worldContent = await readNovelFile(request.storyDir, "world.md");
      if (worldContent) {
        locationDescription = extractLocationFromWorld(worldContent, sceneLocation);
      }
    }
  }

  const data = {
    sceneContent,
    charactersInScene,
    resolvedSceneChars,
    locationDescription,
  };
  request._cache.set(cacheKey, data);
  return data;
}

export { getOrCacheSceneData };
