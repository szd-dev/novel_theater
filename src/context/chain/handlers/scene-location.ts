import { getOrCacheSceneData } from "./scene-context";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class SceneLocationHandler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const { locationDescription } = await getOrCacheSceneData(request);
    if (!locationDescription) return { messages: [] };

    return {
      messages: [{ label: "场景地点", content: locationDescription }],
    };
  }
}