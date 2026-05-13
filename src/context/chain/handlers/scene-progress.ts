import { globNovelFiles } from "@/store/story-files";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class SceneProgressHandler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const sceneFiles = await globNovelFiles(request.storyDir, "scenes/*.md");
    const sceneCount = sceneFiles.length;
    const currentSceneId =
      sceneCount > 0
        ? `s${String(sceneCount).padStart(3, "0")}`
        : "s001";

    return {
      messages: [
        {
          label: "故事进度",
          content: `场景总数: ${sceneCount}，当前场景: ${currentSceneId}`,
        },
      ],
    };
  }
}
