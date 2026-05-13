import { readNovelFile } from "@/store/story-files";
import { extractSectionLines } from "@/context/extract";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class PlotDirectionHandler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const plotContent = await readNovelFile(request.storyDir, "plot.md");
    if (!plotContent) return { messages: [] };

    const summary = extractSectionLines(plotContent, "主线", 3);
    if (!summary) return { messages: [] };

    return {
      messages: [{ label: "剧情方向", content: summary }],
    };
  }
}
