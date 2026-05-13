import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

export class CharacterFileHandler extends BaseContextHandler {
  protected async doHandle(request: ContextRequest): Promise<ContextResult> {
    if (!request.characterFile) return { messages: [] };

    return {
      messages: [
        {
          label: `角色文件 — ${request.characterName ?? ""}`,
          content: request.characterFile,
        },
      ],
    };
  }
}
