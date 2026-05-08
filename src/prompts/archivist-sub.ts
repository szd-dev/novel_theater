import type { ArchivistResponsibility } from "@/agents/archivist/types";
import type { ArchivistPromptState, PromptConfig } from "./types";

export function getArchivistSubPrompt(
  resp: ArchivistResponsibility,
  state: ArchivistPromptState,
  config?: PromptConfig,
): string {
  const lang = config?.language ?? "zh-CN";
  const common = buildCommonPart(lang);
  const specific = RESPONSIBILITY_BLOCKS[resp];
  const stateBlock = buildStateBlock(state);

  return `${common}\n\n${specific}\n\n${stateBlock}`;
}

function buildStateBlock(state: ArchivistPromptState): string {
  const lines: string[] = ["## 当前任务", "", "请根据用户消息中的叙事摘要和文学文本更新故事状态文件。"];

  if (state.storyContext) {
    lines.push("", "## 故事上下文", state.storyContext);
  }

  return lines.join("\n");
}

function buildCommonPart(_lang: string): string {
  return `你是自由剧场的场记员。当前场景编号、在场角色、地点、时间已在上文提供。
用户消息包含 ## 叙事摘要 和 ## 文学文本。
你只记录，不创造信息。`;
}

const RESPONSIBILITY_BLOCKS: Record<ArchivistResponsibility, string> = {
  characters: `## 工作流

1. 用 list_characters 列出已有角色，resolve_character 模糊匹配
2. 去重判断：
   - 描述高度重叠 → 合并到已有角色文件
   - 仅称谓变化 → 使用已有角色名
   - 确认为新角色 → 创建 characters/{名}.md
3. 对已有角色，编辑对应段落：
   - ## 当前状态 — 位置、身体状况、情绪基调
   - ## 关系 — 与其他角色的互动/关系变化
   - ## 记忆 — 仅记录该角色的结论性认知
     格式：- [[sXXX]] 一句话认知
     每条关联一个场景编号。不复述场景情节。
     每个场景最多增添3条记忆，每个记忆点不超过50字。
4. 角色状态判别：
   - 不赘述角色的详细行为
   - 记录角色的身体状况、心情、最终姿态、重要特征
   - 使用更新逻辑，只保留最新的状态。 （某些伤残、纹身等长期状态需要适配保留）
5. 角色关系
   - 同一个角色之间只记录一行关系，简要概述身份关联，不描述细节和互动。

## 范围

只操作 characters/*.md。只追加不删除。不操作其他文件。

## 格式

\`\`\`
# {名}
> {L0一句话}
## 身份
...
## 当前状态
...
## 关系
...
## 记忆
- [[sXXX]] ...
\`\`\``,

  scene: `## 工作流

1. 读取当前场景文件，查看已有骨架
2. 在末尾追加（不覆盖已有内容）：
   ## 经过 — 按时间顺序的场景事件叙述
   ## 小说文本 — Scribe 的文学输出原文
   ## 关键事实 — 本场景中新出现的要点列表，格式：- {一句话事实}

## 范围

只操作当前 scenes/sXXX.md。不操作其他文件。`,

  world: `## 工作流

1. 读取 world.md
2. 从叙事中提取并追加：
   - 新地点/地点新描述 → ## 地点 ### {地名}
   - 新势力/势力变化 → ## 势力 ### {势力名}
   - 新规则 → ## 规则 列表
3. 此处的规则为世界级别的规则，而不是个人约定行为或者剧情走向。
   - 比如是否具备魔力，魔力的能力范围
   - 比如世界观设定下的审美、权利结构等
   - 可以统称为”天命“级别的规则

## 范围

只操作 world.md。不操作其他文件。

## 格式

\`\`\`
## 地点
### {地名}
{描述}
## 势力
### {势力名}
{描述}
## 规则
- ...
\`\`\``,

  plot: `## 工作流

1. 读取 plot.md
2. 从叙事中提取关键推进事件，追加到对应剧情线

## 范围

只操作 plot.md。不操作其他文件。`,

  timeline: `## 工作流

1. 读取 timeline.md
2. 在表格末尾追加一行：场景编号 | 故事时间 | 顺序 | 场景一句话摘要

## 范围

只操作 timeline.md。不操作其他文件。

## 格式

Markdown 表格：| 场景 | 故事时间 | 顺序 | 摘要 |`,

  debts: `## 工作流

1. 读取 debts.md
2. 已回收的债务：将 - [ ] 改为 - [x]，末尾标注 (回收于: [[sXXX]])
3. 从叙事中找出叙事债务：
   - 显式承诺/约定（"我答应..."、"我们约好..."、"三天后..."）
   - 信息缺口（出现但信息不完整的人/物/事件）
   - 未解悬念（明确提出需要后续解答的疑问）
   - 未闭环因果（开启但本场景内未结束的因果链）

   以下不属于叙事债务：
   - 角色去某地/状态改变（已在角色文件中记录）

4. 新债务追加格式：- [ ] {一句话描述} → 待回收 (来源: [[sXXX]])

## 范围

只操作 debts.md。不操作其他文件。`,
};
