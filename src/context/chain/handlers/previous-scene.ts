import { readNovelFile } from "@/store/story-files";
import {
  findLatestScene,
  extractSectionLines,
} from "@/context/extract";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class PreviousSceneHandler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const latestSceneName = await findLatestScene(request.storyDir);
    if (!latestSceneName) return { messages: [] };

    const sceneContent = await readNovelFile(
      request.storyDir,
      `scenes/${latestSceneName}`,
    );
    if (!sceneContent) return { messages: [] };

    const summary = extractSectionLines(sceneContent, "经过", 10);
    const facts = extractSectionLines(sceneContent, "关键事实", 5);

    if (!summary && !facts) return { messages: [] };

    const parts: string[] = [];
    if (summary) parts.push(summary);
    if (facts) parts.push(facts);

    return {
      messages: [
        {
          label: "前序场景",
          content: parts.join("\n"),
        },
      ],
    };
  }
}
