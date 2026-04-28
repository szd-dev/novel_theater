# 自由剧场 (Novel Theater)

基于 AI 多智能体协作的交互式叙事引擎，由 OpenAI Agents JS 和 Next.js 驱动。

与手动维护世界设定的 AI 角色扮演工具不同，自由剧场让你**只管讲故事，世界交给 AI 维护**：

- **剧情由你定义**：你决定故事走向、角色命运、情节转折，AI 不会越俎代庖
- **世界自动维护**：Archivist 自动更新角色状态、世界设定、剧情线、时间线，无需手动编辑任何文件
- **角色独立演绎**：每个角色由独立 Actor 智能体附体，拥有自己的会话记忆，场景运作自然流畅
- **文学化输出**：Scribe 将交互骨架转为小说文本，产出可直接阅读的文学叙事

## 架构

四位 AI 智能体组成即兴剧团，各司其职：

| 角色 | 推荐模型 | 职责 |
|------|----------|------|
| **GM**（导演） | Qwen (qwen/qwen3.6-27B) | 场景编排、意图解析、流程路由 |
| **Actor**（演员） | DeepSeek (deepseek/deepseek-v4-flash) | 角色附体、行为演绎、对话输出 |
| **Scribe**（书记） | DeepSeek (deepseek/deepseek-v4-flash) | 文学化叙述、场景骨架转小说文本 |
| **Archivist**（场记） | Qwen (qwen/qwen3.6-27B) | 状态维护、角色/世界/剧情文件更新 |

GM 和 Archivist 使用 Qwen（强 Agent / 工具调用能力），Actor 和 Scribe 使用 DeepSeek（强对话 / 创作能力）。每个角色的模型均可通过环境变量覆盖。

技术栈：Next.js 16 · OpenAI Agents JS · Vercel AI SDK · Anthropic · OpenAI · Tailwind CSS v4 · shadcn/ui · Zod v4

## 快速开始

1. 安装依赖：
   ```bash
   bun install
   ```

2. 配置环境变量：
   ```bash
   cp .env.example .env.local
   # 在 .env.local 中填入你的 API Key 和模型配置
   ```

3. 启动开发服务器：
   ```bash
   bun dev
   ```

4. 打开 http://localhost:4477 开始使用

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `OPENAI_API_KEY` | ✅ | — | API Key |
| `OPENAI_BASE_URL` | — | `https://api.openai.com/v1` | API Base URL（DeepSeek/Qwen 等兼容接口） |
| `MODEL_GM` | — | `qwen/qwen3.6-27B` | GM 模型（强 Agent 能力） |
| `MODEL_ACTOR` | — | `deepseek/deepseek-v4-flash` | Actor 模型（强对话能力） |
| `MODEL_SCRIBE` | — | `deepseek/deepseek-v4-flash` | Scribe 模型（强对话能力） |
| `MODEL_ARCHIVIST` | — | `qwen/qwen3.6-27B` | Archivist 模型（强 Agent 能力） |
| `PROJECT_DIR` | — | `.novel` | 故事文件目录名 |
| `DATA_STORE_DIR` | — | `./.data_store` | 项目数据存储根目录 |
| `DEBUG_PROMPTS` | — | — | 设为 `1` 启用 Agent 系统提示词日志 |

## 故事文件

故事数据存储在项目目录的 `.novel/` 下：

| 文件/目录 | 说明 |
|-----------|------|
| `world.md` | 世界设定——地点、势力、规则 |
| `style.md` | 风格指南——视角、节奏、语言特色 |
| `timeline.md` | 时间线——纪年、已知时间点、时间规则 |
| `plot.md` | 剧情线——主线与支线 |
| `debts.md` | 传播债务——待回收的伏笔 |
| `chapters.md` | 章节结构 |
| `characters/*.md` | 角色文件（`# 角色名` 标题 + `>` L0 引用行 + 详细段落） |
| `scenes/*.md` | 场景记录（包含 `## 地点`、`## 时间`、`## 在场角色`、`## 经过` 段落） |
| `.working/latest-interaction.md` | 本幕交互记录（自动追加，场景结束时清除） |
| `.working/agent-logs.jsonl` | Agent 提示词调试日志（需启用 `DEBUG_PROMPTS=1`） |

## 项目管理

应用支持多项目管理。项目数据存储在 `DATA_STORE_DIR` 下：

```
.data_store/
└── projects/
    ├── p001/
    │   ├── project.json       # 项目元信息（id, name, createdAt, dataDir）
    │   ├── .novel/            # 故事文件
    │   └── .sessions/         # 会话持久化
    │       ├── index.json     # 会话索引
    │       ├── gm-main/       # GM 主会话
    │       └── subagent/      # 子智能体会话
    └── p002/
        └── ...
```

## 核心设计

- **Agent-as-Tool 协作**：GM 通过 `call_actor` / `call_scribe` / `call_archivist` 工具调度子智能体，保持中央控制
- **优先级上下文注入**：在场角色(0) > 当前场景(1) > 场景地点(1) > 已知角色(2) > 剧情方向(2) > 角色详情(4)，2000 token 预算自动截断
- **交互记录**：Actor 输出自动追加到 `.working/latest-interaction.md`，场景结束后由 GM 调用 `clear_interaction_log` 清除
- **Archivist 闭环**：场景结束后自动更新角色、世界、剧情、时间线文件，下一轮通过上下文注入反馈给所有智能体
- **文件会话持久化**：`FileSession` 将对话历史写入磁盘（原子写入），支持进程重启后会话恢复和子智能体会话复用
- **执行日志**：每次子智能体调用自动记录 token 用量、工具调用链，便于调试和成本追踪

## 测试

```bash
bun test                  # 运行所有测试
bun test tests/unit/      # 仅运行单元测试
bun test tests/integration/  # 仅运行集成测试
```

测试框架使用 Bun 内置测试（`bun:test`），文件系统测试使用真实临时目录，不使用 mock。

## 未来计划

短期（大概率会做）
- 完善GM调度中的问题（session复用，固定流程用代码封装，降低调度负担等）
- UI体验优化
- 支持手动修改设定以及设定集合的导入导出
- 优化各个Agent的Prompt

长期（梦想）
- plan-executor结构的长程剧情演绎
- 基于演绎脚本的图片-漫画-短视频生成

长期

## License

[MIT](./LICENSE)
