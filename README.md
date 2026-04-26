# 自由剧场 v2

基于 AI 多智能体协作的交互式叙事引擎，由 OpenAI Agents JS 和 Next.js 驱动。

## 架构

四位 AI 智能体组成即兴剧团，各司其职：

| 角色 | 模型 | 职责 |
|------|------|------|
| **GM**（导演） | Claude Sonnet 4 | 场景编排、意图解析、流程路由 |
| **Actor**（演员） | Claude Sonnet 4 | 角色附体、行为演绎、对话输出 |
| **Scribe**（书记） | Claude Sonnet 4 | 文学化叙述、场景骨架转小说文本 |
| **Archivist**（场记） | GPT-4o-mini | 状态维护、角色/世界/剧情文件更新 |

技术栈：Next.js 16 · OpenAI Agents JS · Vercel AI SDK · Anthropic · OpenAI · Tailwind CSS · shadcn/ui

## 快速开始

1. 安装依赖：
   ```bash
   bun install
   ```

2. 配置环境变量：
   ```bash
   cp .env.example .env.local
   # 在 .env.local 中填入你的 OpenAI API Key
   ```

3. 启动开发服务器：
   ```bash
   bun dev
   ```

4. 打开 http://localhost:3000 开始使用

## 故事文件

故事数据存储在 `.novel/` 目录下，与 v1 格式完全兼容：

| 文件 | 说明 |
|------|------|
| `world.md` | 世界设定——地点、势力、规则 |
| `style.md` | 风格指南——视角、节奏、语言特色 |
| `timeline.md` | 时间线——纪年、已知时间点、时间规则 |
| `plot.md` | 剧情线——主线与支线 |
| `debts.md` | 传播债务——待回收的伏笔 |
| `chapters.md` | 章节结构 |
| `characters/` | 角色文件（每个角色一个 .md） |
| `scenes/` | 场景记录（按编号命名） |

## API 接口

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/narrative` | POST | 与叙事引擎对话（流式响应） |
| `/api/story` | POST | 故事管理（初始化 / 归档 / 重置） |
| `/api/narrative/status` | GET | 查询当前场景状态 |

## 核心设计

- **Agent-as-Tool 协作**：GM 通过 call_actor/call_scribe/call_archivist 工具调度子智能体，保持中央控制
- **优先级上下文注入**：在场角色(0) > 当前场景(1) > 场景地点(1) > 已知角色(2) > 剧情方向(2) > 角色详情(4)，2000 token 预算自动截断
- **Agent 工具调用**：GM 可多次调用 call_actor 进行角色演绎，然后调用 call_scribe 和 call_archivist 完成场景闭环
- **Archivist 闭环**：场景结束后自动更新角色、世界、剧情、时间线文件，下一轮通过上下文注入反馈给所有智能体

## 测试

```bash
bun test
```

## 项目结构

```
src/
├── app/
│   ├── page.tsx              # 聊天主页面
│   ├── layout.tsx            # 全局布局
│   └── api/
│       ├── narrative/        # 叙事 API（流式桥接层）
│       ├── narrative/status/ # 场景状态查询
│       └── story/            # 故事管理 API
├── agents/
│   ├── gm.ts               # GM Agent（场景编排 + asTool 调度）
│   ├── actor.ts             # Actor Agent（角色演绎）
│   ├── scribe.ts            # Scribe Agent（文学叙述）
│   ├── archivist.ts         # Archivist Agent（状态更新）
│   └── registry.ts          # asTool 注册 + Agent 导出
├── tools/
│   ├── file-tools.ts        # 文件读写工具
│   ├── character-tools.ts   # 角色查询工具
│   └── story-tools.ts       # 故事管理工具
├── session/
│   ├── types.ts             # StorySession 类型
│   └── manager.ts           # MemorySession 管理
├── context/
│   ├── build-story-context.ts # 上下文组装（优先级截断）
│   ├── extract.ts            # Markdown 段落提取
│   ├── character-resolver.ts # 角色名模糊匹配
│   └── token-estimator.ts    # Token 估算
├── prompts/
│   ├── gm.ts                 # GM 系统提示词
│   ├── actor.ts              # Actor 系统提示词
│   ├── scribe.ts             # Scribe 系统提示词
│   ├── archivist.ts          # Archivist 系统提示词
│   └── types.ts              # 提示词状态类型
├── store/
│   ├── story-files.ts        # .novel/ 文件读写
├── lib/
│   ├── models.ts             # OpenAI 模型配置
│   ├── templates.ts          # .novel/ 文件模板
│   ├── retry.ts              # 重试与退避
│   └── utils.ts              # 工具函数
└── components/
    ├── chat/                 # 聊天界面组件
    └── ui/                   # shadcn/ui 基础组件
```
