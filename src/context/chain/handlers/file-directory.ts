import { BaseContextHandler } from "../base-handler";
import type { ContextRequest, ContextResult } from "../types";

const FILE_DIRECTORY = `.novel/
├── world.md          # 世界设定——地点、势力、规则
├── style.md          # 风格指南
├── timeline.md       # 时间线
├── plot.md           # 剧情线
├── debts.md          # 传播债务
├── chapters.md       # 章节结构
├── characters/       # 角色文件（{角色名}.md）
└── scenes/           # 场景记录（s001.md, s002.md, ...）`;

export class FileDirectoryHandler extends BaseContextHandler {
  protected async doHandle(_request: ContextRequest): Promise<ContextResult> {
    return {
      messages: [{ label: "文件目录", content: FILE_DIRECTORY }],
    };
  }
}
