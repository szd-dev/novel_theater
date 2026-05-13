import { readNovelFile } from "@/store/story-files";
import { extractL1 } from "@/context/extract";
import { getOrCacheSceneData } from "./scene-context";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class CharacterL1Handler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const { resolvedSceneChars } = await getOrCacheSceneData(request);

    const l1Details: string[] = [];

    for (const name of resolvedSceneChars) {
      const charContent = await readNovelFile(
        request.storyDir,
        `characters/${name}.md`,
      );
      if (!charContent) continue;

      const l1 = extractL1(charContent, 150);
      if (l1) {
        l1Details.push(l1);
      }
    }

    if (l1Details.length === 0) return { messages: [] };

    return {
      messages: [
        { label: "角色详情", content: l1Details.join("\n") },
      ],
    };
  }
}
