import { readNovelFile } from "@/store/story-files";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class StyleGuideHandler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const styleGuide =
      request.styleGuide ??
      (await readNovelFile(request.storyDir, "style.md"));

    if (!styleGuide) return { messages: [] };

    return {
      messages: [{ label: "风格指南", content: styleGuide }],
    };
  }
}
