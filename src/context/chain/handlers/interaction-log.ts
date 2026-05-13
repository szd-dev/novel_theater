import { readInteractionLog } from "@/store/interaction-log";
import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class InteractionLogHandler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    const log = readInteractionLog(request.storyDir);
    if (!log || !log.trim()) return { messages: [] };

    return {
      messages: [{ label: "本幕交互记录", content: log }],
    };
  }
}
