import { readDirectivesFile } from "@/store/story-files";
import { getOrCacheSceneData } from "./scene-context";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult, ContextMessage } from "../types";

export class DirectivesHandler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const { resolvedSceneChars } = await getOrCacheSceneData(request);
    const messages: ContextMessage[] = [];

    for (const charName of resolvedSceneChars) {
      const content = await readDirectivesFile(
        request.storyDir,
        `characters/${charName}.md`,
      );
      if (content) {
        messages.push({
          label: `${charName} — 作者指令（不可违反）`,
          content,
        });
      }
    }

    const rootDirectives = [
      { path: "world.md", label: "世界设定 — 作者指令" },
      { path: "plot.md", label: "剧情方向 — 作者指令" },
      { path: "timeline.md", label: "时间线 — 作者指令" },
    ];

    for (const { path, label } of rootDirectives) {
      const content = await readDirectivesFile(request.storyDir, path);
      if (content) {
        messages.push({ label, content });
      }
    }

    return { messages };
  }
}
