# 自由剧场 v2 — 架构方案

**本文档已过时，仅供参考，具体实现以用户诉求为准**

> 基于 OpenAI Agents JS + Vercel AI SDK UI 的交互式叙事系统

## 1. 项目定位

**自由剧场**是一个多 Agent 协作的交互式叙事引擎。用户作为"导演"发出指令，系统中的四个 Agent（GM/Actor/Scribe/Archivist）即兴协作，产出文学性小说文本。

### 1.1 核心编排模型：Agent-as-Tool

本方案采用 **Agent-as-Tool** 编排模式，而非图路由模式。

**为什么不用 LangGraph**：LangGraph 要求 LLM 输出结构化路由决策（`Command(goto: "actor")`），这与即兴剧场的编排需求根本冲突——GM 应该自然对话、按需调用 subagent，而不是在每次输出时做显式路由决策。图路由模式强迫 GM 同时扮演"即兴导演"和"工作流引擎"两个角色，认知模式完全不同。

**Agent-as-Tool 的核心思路**：GM 是一个拥有工具循环的 Agent，它的工具列表中包含 `call_actor`、`call_scribe`、`call_archivist` 三个工具——每个工具背后是一个完整的 sub-agent。GM 想调 Actor 就调，不想调就不调；简单问候直接回复，复杂场景自然调用工具链。路由从工具调用行为中自然涌现，不需要显式决策。

```
图路由模式（LangGraph）:
  GM → 输出结构化决策 Command(goto: "actor", maxTurns: 2)
  ↑ GM 被迫同时做文学输出和路由决策

Agent-as-Tool 模式:
  GM → "塞莉娅沉默了，烛火在她眼中摇曳……"
       [call_actor({ character: "塞莉娅", direction: "对希尔薇的话做出反应" })]
       "希尔薇的回答让空气凝固——"
       [call_actor({ character: "希尔薇", direction: "回应塞莉娅的沉默" })]
       [call_scribe({ interactionLog: [...] })]
  ↑ GM 始终在做同一件事：讲故事。路由从工具调用中自然涌现
```

### 1.2 解决的痛点

| 旧痛点 | 根因 | 新方案 |
|--------|------|--------|
| Agent 编排靠 698 行自然语言 prompt | OpenCode 无编程式编排 | GM prompt 精简 + `asTool()` 注册 subagent |
| Agent 间只能传自由文本 | `task()` 返回 text summary | `customOutputExtractor` 控制返回内容 |
| 无并行 Agent 调用 | `task()` 串行阻塞 | `Runner` 支持并行工具调用 |
| 会话恢复不可靠 | `task_id` best-effort | `Session` 后端（SQLite/Redis/MongoDB）可靠持久化 |
| 流式输出受限 | MCP 工具结果非流式 | `createAiSdkUiMessageStreamResponse` 完整流式 |
| 上下文注入对所有 Agent 一视同仁 | `chat.system.transform` 无 Agent 感知 | 每个 sub-agent 独立 prompt + 独立上下文注入 |
| GM 负担过重（编排+创作合一） | OpenCode 无 subagent 分层 | GM 专注创作 + 框架处理工具循环 |
| 子 Agent 无法跨调用保持状态 | 无 session 概念 | `Session` 后端自动管理子 Agent 对话历史 |

---

## 2. 技术选型

| 层 | 技术 | 职责 |
|----|------|------|
| **前端** | Next.js + `@ai-sdk/react` (`useChat`) | 聊天 UI、流式渲染、用户交互 |
| **流式桥接** | `@openai/agents-extensions/ai-sdk-ui` | Agent run stream → AI SDK UIMessage 格式转换 |
| **编排** | `@openai/agents` (`Agent`, `asTool`, `Runner`) | Agent 定义、subagent 注册、工具循环、Session 管理 |
| **LLM 调用** | `@openai/agents-extensions/ai-sdk` (`aisdk()`) | 桥接任意 Vercel AI SDK model（OpenAI/Anthropic/Google/Ollama） |
| **Session 持久化** | `@openai/agents` (`SQLiteSession`/`RedisSession`) | 子 Agent 对话历史、跨调用状态延续 |
| **文件 I/O** | Node.js `fs` / Bun.file() | `.novel/` 目录读写 |
| **运行时** | Bun / Node.js | TypeScript 运行时 |

### 2.1 关键包依赖

```
@openai/agents                    — 核心 SDK（Agent, Runner, Session, tool, asTool）
@openai/agents-extensions/ai-sdk  — LLM 提供商桥接（aisdk() 函数）
@openai/agents-extensions/ai-sdk-ui — 流式 UI 桥接（createAiSdkUiMessageStreamResponse）
ai                                — Vercel AI SDK 核心（UIMessage 类型）
@ai-sdk/react                     — useChat hook
@ai-sdk/openai                    — OpenAI provider
@ai-sdk/anthropic                 — Anthropic provider
zod                               — 工具参数 schema
```

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户浏览器                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Next.js Page                                               │   │
│  │  useChat() → 消息列表 + 输入框 + 流式渲染                     │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
└─────────────────────────────┼──────────────────────────────────────┘
                              │ HTTP POST /api/narrative
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API Route Layer                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  /api/narrative/route.ts                                    │   │
│  │  const stream = await run(gmAgent, input, { stream: true });│   │
│  │  return createAiSdkUiMessageStreamResponse(stream);         │   │
│  │  ↑ 两行代码：执行 agent run + 转成 AI SDK 流式响应            │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
└─────────────────────────────┼──────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 OpenAI Agents JS 编排层                               │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  GM Agent (ToolLoopAgent)                                     │   │
│  │                                                                │   │
│  │  system prompt: 即兴导演 + buildStoryContext() 注入的故事上下文  │   │
│  │                                                                │   │
│  │  tools:                                                        │   │
│  │    ├── call_actor → actorAgent.asTool()                        │   │
│  │    │     Runner.run(actorAgent, { session })                   │   │
│  │    │     ↑ Session 自动管理，同一角色复用同一 session            │   │
│  │    ├── call_scribe → scribeAgent.asTool()                      │   │
│  │    └── call_archivist → archivistAgent.asTool()                │   │
│  │                                                                │   │
│  │  GM 自然对话，按需调用工具，工具循环直到输出最终文本             │   │
│  │  简单问候 → GM 直接回复，不调用任何工具                        │   │
│  │  复杂场景 → GM 自然调用 call_actor → call_scribe → ...         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Sub-agents (独立 Agent 实例，各自有完整 tool loop)            │   │
│  │                                                                │   │
│  │  actorAgent                                                    │   │
│  │    tools: resolve_character, read_file                         │   │
│  │    session: SQLiteSession → 同一角色跨调用保持状态              │   │
│  │                                                                │   │
│  │  scribeAgent                                                   │   │
│  │    tools: read_file (style.md, world.md)                      │   │
│  │                                                                │   │
│  │  archivistAgent                                                │   │
│  │    tools: read_file, write_file, edit_file, resolve_character  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Session 后端                                                  │   │
│  │  SQLiteSession / RedisSession / MongoDBSession                │   │
│  │  • 主对话 session：GM 的完整对话历史                           │   │
│  │  • 子 session（per 角色）：Actor 的对话历史 + 工具调用记录      │   │
│  │  • 跨调用状态延续：同一角色 resume 时自动恢复上下文             │   │
│  │  • 双层可观测：主对话看摘要，子 session 查详情                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     状态存储层 (.novel/)                              │
│                                                                      │
│  .novel/                                                             │
│  ├── world.md          世界设定（地点、势力、规则）                    │
│  ├── style.md          风格指南                                      │
│  ├── timeline.md       时间线                                        │
│  ├── plot.md           剧情线                                        │
│  ├── debts.md          传播债务                                      │
│  ├── chapters.md       章节索引                                      │
│  ├── characters/       角色文件（每角色一个 .md）                     │
│  │   ├── 塞莉娅.md                                                    │
│  │   └── 希尔薇.md                                                    │
│  └── scenes/           场景文件（递增编号）                           │
│      ├── s001.md                                                      │
│      └── s002.md                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 分层设计

### 4.1 前端层

**职责**：用户交互、流式渲染、消息管理

**技术**：Next.js App Router + `@ai-sdk/react` 的 `useChat` hook

**核心功能**：
- 聊天消息列表（用户消息 + 叙事文本）
- 流式输出渲染（逐字显示叙事文本）
- 工具调用显示（显示 GM 调用了哪个 subagent）
- 场景状态指示器（当前地点/时间/场景编号）
- 子 Session 详情查看（切换到 Actor/Scribe/Archivist 的执行记录）
- 故事管理操作（新建/归档/重置，通过独立 API 调用）

**关键实现**：
```typescript
import { useChat } from '@ai-sdk/react';

function NarrativeChat() {
  const { messages, sendMessage, status } = useChat({
    api: '/api/narrative',
  });
  // messages: UIMessage[] — 包含 text parts + tool call parts
  // GM 调用 call_actor 时，前端能看到工具调用过程
  // 流式文本逐字渲染
}
```

### 4.2 API 桥接层

**职责**：执行 Agent Run + 转换流式响应

**技术**：Next.js Route Handler + `@openai/agents-extensions/ai-sdk-ui`

**核心实现**：
```typescript
import { run } from '@openai/agents';
import { createAiSdkUiMessageStreamResponse } from '@openai/agents-extensions/ai-sdk-ui';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await run(gmAgent, messages, {
    stream: true,
    session: storySession,  // Session 后端自动管理
  });

  return createAiSdkUiMessageStreamResponse(stream);
  // ↑ 一行代码：把整个 agent run（包含多轮工具调用、subagent 调用）
  //   转成 AI SDK 兼容的流式响应，直接接 useChat()
}
```

**不做**：
- 不含业务逻辑
- 不做状态管理
- 不做消息格式转换（`createAiSdkUiMessageStreamResponse` 自动处理）

### 4.3 编排层（OpenAI Agents JS）

**职责**：Agent 定义、subagent 注册、工具循环、Session 管理

这是系统的核心——**你真正写的代码主要在这一层**。

#### 4.3.1 GM Agent（核心编排者）

GM 是一个拥有完整工具循环的 Agent。它自然对话，按需调用 subagent 工具。Runner 自动管理工具循环：LLM 输出 → 如有工具调用则执行 → LLM 继续 → 直到无工具调用。

```typescript
import { Agent, Runner } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions/ai-sdk';
import { anthropic } from '@ai-sdk/anthropic';

const gmAgent = new Agent({
  name: 'GM',
  model: aisdk(anthropic('claude-sonnet-4-20250514')),
  instructions: GM_SYSTEM_PROMPT,  // 即兴导演 prompt

  tools: [
    // 三个 subagent 工具——GM 自然调用，路由隐式涌现
    actorAgent.asTool({
      toolName: 'call_actor',
      toolDescription: '调用演员进行角色表演。传入角色名和场景指示。',
      customOutputExtractor: (result) => {
        // 返回给 GM 的摘要（不是完整表演文本）
        return String(result.finalOutput ?? '');
      },
    }),

    scribeAgent.asTool({
      toolName: 'call_scribe',
      toolDescription: '调用书记将交互记录转为文学文本。',
      customOutputExtractor: (result) => String(result.finalOutput ?? ''),
    }),

    archivistAgent.asTool({
      toolName: 'call_archivist',
      toolDescription: '调用场记员更新故事状态文件。',
      customOutputExtractor: (result) => String(result.finalOutput ?? ''),
    }),
  ],
});
```

**GM 的行为模式**：

| 用户输入 | GM 行为 | 工具调用 |
|---------|--------|---------|
| "你好" | 直接回复问候 | 无 |
| "塞莉娅决定逃离" | 叙述 + 调用 Actor | `call_actor({ character: "塞莉娅", direction: "..." })` |
| "希尔薇会怎么说？" | 调用另一个 Actor | `call_actor({ character: "希尔薇", direction: "..." })` |
| 场景互动结束 | 调用 Scribe 叙述 | `call_scribe({ interactionLog: "..." })` |
| 叙事完成 | 调用 Archivist 更新状态 | `call_archivist({ narrativeSummary: "..." })` |

**关键**：GM 不需要做显式路由决策——"调不调 Actor"和"说什么"是同一个 LLM 输出中的自然行为，不需要 `Command(goto: "actor")` 这种结构化决策。

#### 4.3.2 Actor Agent（角色附体）

Actor 是一个独立的 Agent，拥有自己的工具循环和 Session。

```typescript
const actorAgent = new Agent({
  name: 'Actor',
  model: aisdk(anthropic('claude-sonnet-4-20250514')),
  instructions: ACTOR_SYSTEM_PROMPT,  // 角色附体 prompt

  tools: [
    resolveCharacterTool,  // resolve_character — 查找角色文件
    readFileTool,          // read_file — 读取角色/场景文件
  ],
});
```

**Session 复用**：同一场景中，GM 多次调用同一角色的 Actor 时，通过 `Session` 后端自动恢复对话历史——Actor 记得自己之前说过什么、情绪状态如何。

```typescript
// Runner 自动管理 session
const result = await Runner.run(actorAgent, input, {
  session: characterSession,  // SQLiteSession 按 character 区分
});
// 第二次调用同一角色时，session 自动恢复
```

**与 OpenCode `task_id` 的对照**：

| | OpenCode | OpenAI Agents JS |
|---|---|---|
| Session 创建 | `task(actor)` 自动创建 | `Runner.run(actorAgent)` 自动创建 |
| Session 恢复 | `task(actor, task_id="ses_abc123")` | `Runner.run(actorAgent, { session })` 自动恢复 |
| Session 持久化 | 内存级（进程重启丢失） | SQLite/Redis/MongoDB（持久化） |
| Session 查看 | TUI 切换到子 session | 查 Session 后端数据 |

#### 4.3.3 Scribe Agent（文学化叙述）

```typescript
const scribeAgent = new Agent({
  name: 'Scribe',
  model: aisdk(anthropic('claude-sonnet-4-20250514')),
  instructions: SCRIBE_SYSTEM_PROMPT,  // 文学化叙述 prompt

  tools: [
    readFileTool,  // 读取 style.md, world.md, 角色文件
  ],
});
```

#### 4.3.4 Archivist Agent（状态更新）

```typescript
const archivistAgent = new Agent({
  name: 'Archivist',
  model: aisdk(anthropic('claude-haiku-4-20250414')),  // 结构化任务，低成本模型
  instructions: ARCHIVIST_SYSTEM_PROMPT,  // 状态更新 prompt

  tools: [
    readFileTool,          // 读取当前状态文件
    writeFileTool,         // 写入文件
    editFileTool,          // 编辑文件
    resolveCharacterTool,  // 角色查找
    globFilesTool,         // 列出目录文件
  ],
});
```

### 4.4 上下文注入层

**从旧系统迁移的核心逻辑**——`buildStoryContext()` 及其依赖函数。

#### 迁移清单

以下函数从旧 `index.ts` 直接搬入新项目的 `src/context/` 目录，**零改动**：

| 函数 | 功能 | 行数 |
|------|------|------|
| `estimateTokens()` | 中文 token 估算（chars/3） | 3 |
| `readNovelFile()` | 安全读取 .novel/ 文件 | 5 |
| `extractL0()` | 提取角色一句话身份（`> ` 开头行） | 6 |
| `extractL1()` | 提取角色关键章节摘要（优先级截断） | 30 |
| `findCharacterByName()` | 三级模糊匹配（精确→子串→L0描述） | 28 |
| `listAllCharacters()` | 列出所有角色及 L0 | 18 |
| `findLatestScene()` | 查找最新场景文件 | 15 |
| `extractCharactersInScene()` | 提取场景"在场角色"列表 | 26 |
| `extractSectionLines()` | 提取指定 Markdown 章节前 N 行 | 20 |
| `extractSceneSummary()` | 提取场景"经过"摘要 | 18 |
| `extractLocationFromWorld()` | 从 world.md 提取地点描述 | 30 |
| `extractSceneLocation()` | 提取场景地点名 | 3 |
| `buildStoryContext()` | 优先级上下文组装 + token 预算截断 | 90 |

**总计 ~290 行**，占旧代码 38%，直接复用。

#### 注入方式

旧系统：`chat.system.transform` hook 自动注入，所有 Agent 一视同仁。

新系统：**每个 Agent 的 `instructions` 中动态引用**，按需注入不同内容。

```typescript
// GM Agent — 注入完整故事上下文
const gmAgent = new Agent({
  instructions: async (context) => {
    const storyContext = await buildStoryContext(storyDir);
    return `${GM_SYSTEM_PROMPT}\n\n${storyContext}`;
  },
});

// Actor Agent — 注入角色详情 + 交互记录
const actorAgent = new Agent({
  instructions: async (context) => {
    // 根据 GM 传入的 character 参数，注入对应角色文件
    const characterContext = await buildCharacterContext(characterName);
    return `${ACTOR_SYSTEM_PROMPT}\n\n${characterContext}`;
  },
});
```

### 4.5 Session 管理层

#### 4.5.1 Session 架构

```
SQLiteSession 后端
  ├── 主对话 session (thread_id: "story-xxx")
  │     └── GM 的完整对话历史 + 工具调用记录
  │
  └── 子 session (per 角色)
        ├── actor_塞莉娅 (session_id: "actor-塞莉娅-xxx")
        │     └── 塞莉娅的完整对话历史 + 工具调用记录
        ├── actor_希尔薇 (session_id: "actor-希尔薇-xxx")
        │     └── 希尔薇的完整对话历史 + 工具调用记录
        └── archivist (session_id: "archivist-xxx")
              └── Archivist 的完整对话历史
```

#### 4.5.2 双层可观测性

与 OpenCode 一致的双层模型：

- **主对话层面**：只看到 GM 调用了 `call_actor`、`call_scribe` 等工具及返回值——摘要
- **子 Session 层面**：完整的 Agent 执行过程（对话历史 + 工具调用记录 + 推理过程）——详情
- **查看方式**：前端提供切换按钮，查 Session 后端数据展示详情

#### 4.5.3 Session 复用

同一场景中，GM 第二次调用 Actor(塞莉娅) 时：

1. GM 调用 `call_actor({ character: "塞莉娅", direction: "请做出反应" })`
2. `asTool()` 内部执行 `Runner.run(actorAgent, input, { session: getCharacterSession("塞莉娅") })`
3. Session 后端自动恢复塞莉娅之前的对话历史
4. Actor 基于完整上下文继续表演——记得之前的情绪、说过的话

**场景结束时**：清理该场景的子 session（或标记为归档），下一场景创建新 session。

### 4.6 Agent Prompt 层

旧系统的 Agent 定义在 `.opencode/agents/*.md` 中，以 Markdown + frontmatter 描述。新系统中，这些变成 **TypeScript 中的 system prompt 字符串**。

#### 迁移清单

| Agent | 旧文件 | 新位置 | 变化 |
|-------|--------|--------|------|
| GM | `.opencode/agents/gm.md` | `src/prompts/gm.ts` | 698 行 → 保留核心导演指令，去掉 OpenCode `task()` 语法，改为 `call_actor/call_scribe/call_archivist` 工具描述 |
| Actor | `.opencode/agents/actor.md` | `src/prompts/actor.ts` | 118 行 → 保留核心角色附体逻辑，去掉 OpenCode 工具语法 |
| Scribe | `.opencode/agents/scribe.md` | `src/prompts/scribe.ts` | 110 行 → 保留核心文学化逻辑 |
| Archivist | `.opencode/agents/archivist.md` | `src/prompts/archivist.ts` | 132 行 → 保留核心状态更新逻辑 |

**关键简化**：
- 旧 GM prompt 中关于 `task()` 调用语法、`task_id` session 复用、降级方案的大量说明——**删除**。Session 复用由框架自动处理，不再靠自然语言描述。
- 旧 GM prompt 中关于 `append_interaction` / `end_interaction` 的工作流——**删除**。交互记录不再通过文件系统做消息总线。
- GM prompt 保留的核心：四阶段场景编排逻辑、角色去重规则、场景生命周期、叙事摘要格式、输出规范。

---

## 5. 项目结构

```
novel-theater-v2/
├── package.json
├── tsconfig.json
├── next.config.ts
│
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── page.tsx                   # 聊天页面
│   │   ├── layout.tsx                 # 布局
│   │   └── api/
│   │       ├── narrative/
│   │       │   └── route.ts           # 主编排 API（run + 流式桥接）
│   │       └── story/
│   │           └── route.ts           # 故事管理 API（init/archive/reset）
│   │
│   ├── agents/                        # Agent 定义
│   │   ├── gm.ts                      # GM Agent（核心编排者）
│   │   ├── actor.ts                   # Actor Agent（角色附体）
│   │   ├── scribe.ts                  # Scribe Agent（文学化叙述）
│   │   ├── archivist.ts              # Archivist Agent（状态更新）
│   │   └── registry.ts               # Agent 注册 + asTool() 配置
│   │
│   ├── context/                       # 上下文注入（从旧系统迁移）
│   │   ├── build-story-context.ts     # 主函数（原 buildStoryContext）
│   │   ├── extract.ts                 # L0/L1/场景/地点提取函数
│   │   ├── character-resolver.ts      # 角色模糊匹配（原 findCharacterByName）
│   │   └── token-estimator.ts         # token 估算
│   │
│   ├── prompts/                       # Agent system prompts
│   │   ├── gm.ts                      # GM prompt（从 gm.md 迁移）
│   │   ├── actor.ts                   # Actor prompt（从 actor.md 迁移）
│   │   ├── scribe.ts                  # Scribe prompt（从 scribe.md 迁移）
│   │   └── archivist.ts              # Archivist prompt（从 archivist.md 迁移）
│   │
│   ├── tools/                         # Agent 工具定义
│   │   ├── file-tools.ts              # readFile / writeFile / editFile / globFiles
│   │   ├── character-tools.ts         # resolveCharacter / listCharacters
│   │   └── story-tools.ts             # initStory / archiveStory / resetStory
│   │
│   ├── session/                       # Session 管理
│   │   ├── manager.ts                 # Session 创建/获取/清理
│   │   └── types.ts                   # Session 相关类型
│   │
│   └── lib/                           # 工具函数
│       ├── models.ts                  # LLM 模型配置（aisdk() + provider 映射）
│       └── templates.ts               # .novel/ 模板文件（从旧系统迁移）
│
├── .novel/                            # 故事数据（运行时创建，gitignored）
└── data/                              # Session 持久化（SQLite 等）
```

---

## 6. 核心流程

### 6.1 场景推演流程（主流程）

```
用户输入 "塞莉娅决定趁夜色离开暮霜堡"
    │
    ▼
[API Route] POST /api/narrative
    │ const stream = await run(gmAgent, input, { stream: true, session })
    │ return createAiSdkUiMessageStreamResponse(stream)
    ▼
[GM Agent — 工具循环开始]
    │
    │ GM 输出（流式）：
    │ "塞莉娅站在窗前，夜风拂过她的发梢……"
    │
    │ GM 调用工具：call_actor({ character: "塞莉娅", direction: "塞莉娅决定逃离暮霜堡" })
    │   │
    │   ▼
    │ [Actor Agent — 独立 tool loop + Session]
    │   │ resolve_character("塞莉娅") → 找到角色文件
    │   │ read_file("塞莉娅.md") → 读取完整角色状态
    │   │ LLM 生成角色反应（流式输出到用户）
    │   │ "## 行为\n- 塞莉娅的手指收紧……\n## 对话\n「塞莉娅」：我不要你为我死。"
    │   │ Session 自动保存 Actor 对话历史
    │   │ customOutputExtractor → 返回摘要给 GM
    │   ▼
    │ GM 收到 Actor 返回值
    │
    │ GM 继续输出：
    │ "希尔薇听到这句话，眼中闪过一丝复杂的情绪——"
    │
    │ GM 调用工具：call_actor({ character: "希尔薇", direction: "回应塞莉娅的话" })
    │   │ Runner.run(actorAgent, { session: 希尔薇的 session })
    │   │ → 希尔薇的 Actor 执行（同上）
    │   ▼
    │ GM 收到第二个 Actor 返回值
    │
    │ GM 继续输出：
    │ "场景的氛围已经足够——让我为你叙述这一幕。"
    │
    │ GM 调用工具：call_scribe({ interactionLog: "..." })
    │   │ Scribe 读取 style.md + 交互记录
    │   │ LLM 生成文学性小说文本（流式输出到用户）
    │   │ "客栈里弥漫着劣质酒酿和汗渍的味道……"
    │   ▼
    │ GM 收到 Scribe 返回值
    │
    │ GM 调用工具：call_archivist({ narrativeSummary: "..." })
    │   │ Archivist 读取状态文件 → 判断更新 → 执行文件写入
    │   ▼
    │ GM 收到 Archivist 确认
    │
    │ GM 最终输出（流式）：
    │ "📍 暮霜堡·公主卧室 | ⏰ 秋夜·子时 | 📋 场景 s003"
    │
    │ 无更多工具调用 → Runner 结束
    ▼
[API Route]
    │ createAiSdkUiMessageStreamResponse → 流式返回给前端
    ▼
[前端]
    useChat() 渲染完整叙事文本 + 工具调用标签 + 场景状态指示
```

### 6.2 简单交互流程

```
用户输入 "你好"
    │
    ▼
[GM Agent]
    │ GM 直接输出："你好，导演。故事已经准备好，随时可以开始。"
    │ 无工具调用 → Runner 结束
    ▼
[前端]
    用户看到 GM 的问候回复
```

**对比 OpenCode**：行为完全一致——简单交互不走完整编排流程。

### 6.3 Session 复用流程

```
同一场景内，GM 第二次调用 Actor(塞莉娅)：

[GM Agent]
    │ GM 调用：call_actor({ character: "塞莉娅", direction: "请做出反应" })
    │   │
    │   ▼
    │ [Actor Agent]
    │   │ Runner.run(actorAgent, input, { session: getCharacterSession("塞莉娅") })
    │   │ Session 后端自动恢复：
    │   │   - 塞莉娅之前的对话历史
    │   │   - 之前读取过的角色文件内容
    │   │   - 情绪状态延续
    │   │ LLM 基于完整上下文继续表演
    │   │ → "## 内心独白\n她怎么敢？她怎么能这么轻描淡写地说出'死罪'两个字？"
    │   ▼
    │ GM 收到返回值
    │
    │ Actor 记得之前的情绪和对话——与 OpenCode task_id 行为一致
```

### 6.4 故事管理流程

```
用户点击"新建故事"
    │ POST /api/story { action: "init" }
    ▼
[Story API]
    │ initStory() → 创建 .novel/ 目录 + 模板文件
    │ 返回成功消息

用户点击"归档故事"
    │ POST /api/story { action: "archive", name: "..." }
    ▼
[Story API]
    │ archiveStory() → cpSync(.novel/, .archive/{name}/)
    │ 返回归档确认

用户点击"重置故事"
    │ POST /api/story { action: "reset" }
    ▼
[Story API]
    │ resetStory() → 备份 + 清空 + 重建模板
    │ 返回重置确认
```

### 6.5 会话恢复流程

```
用户重新打开浏览器
    │ GET /api/narrative/status?sessionId=xxx
    ▼
[API Route]
    │ 从 Session 后端读取主对话历史
    │ 返回当前故事状态（场景编号、地点、时间、在场角色）
    ▼
[前端]
    │ 恢复聊天历史 + 场景状态显示
    │ 用户继续输入 → 同主流程
    │ Session 后端自动恢复 GM 和各角色的上下文
```

---

## 7. 数据流

### 7.1 上下文注入（最关键的数据流）

```
.novel/ 文件系统
    │
    ▼
buildStoryContext()
    │ 优先级排序 + token 预算截断
    │ 输出: "## 在场角色\n塞莉娅：...\n## 当前场景\n..."
    ▼
Agent instructions 动态组装
    │ GM:  GM_SYSTEM_PROMPT + storyContext + 所有角色L0
    │ Actor: ACTOR_SYSTEM_PROMPT + 当前角色完整文件 + 交互记录
    │ Scribe: SCRIBE_SYSTEM_PROMPT + style.md + 交互记录 + 角色文件
    │ Archivist: ARCHIVIST_SYSTEM_PROMPT + world.md + 所有角色文件 + narrativeSummary
    ▼
Runner.run(agent) — LLM 调用 + 工具循环
```

### 7.2 交互记录

旧系统：`append_interaction` → `.novel/.working/latest-interaction.md` → hook 注入
新系统：GM 在调用 `call_scribe` 时，将交互记录作为工具参数传入

```
GM 的工具调用:
  call_scribe({
    interactionLog: "## [1] 塞莉娅\n{Actor输出}\n## [2] 希尔薇\n{Actor输出}",
    sceneContext: "暮霜堡·公主卧室·秋夜"
  })

↑ 交互记录作为工具参数传递，不需要文件系统做消息总线
↑ 不需要 append_interaction / end_interaction 工具
↑ 不需要 hook 注入
```

**好处**：
- 消除了 `append_interaction` / `end_interaction` 两个工具
- 消除了 hook 注入交互记录的逻辑
- 交互记录随 Session 自动持久化
- 不需要手动清理 `.working/` 文件

### 7.3 流式输出

```
GM Agent Run (stream: true)
    │
    ├── Runner 自动循环
    │   ├── LLM 文本输出 → 流式事件
    │   ├── 工具调用 (call_actor) → 流式事件
    │   ├── Actor 执行 → 流式事件（含子 Agent 文本输出）
    │   ├── 工具调用 (call_scribe) → 流式事件
    │   ├── Scribe 执行 → 流式事件（含文学文本输出）
    │   └── 最终输出 → 流式事件
    │
    └── createAiSdkUiMessageStreamResponse(stream)
        │ 自动转换所有流式事件为 AI SDK UIMessage 格式
        │ 处理：text-delta, tool-call, tool-output, reasoning, step 等
        ▼
    useChat() 接收并渲染
        ├── 用户消息
        ├── GM 叙述文本（逐字流式）
        ├── [调用 call_actor: 塞莉娅] 工具调用标签
        ├── Actor 角色反应（逐字流式）
        ├── [调用 call_scribe] 工具调用标签
        ├── Scribe 文学文本（逐字流式）
        └── 场景状态指示
```

---

## 8. 与旧系统的对照

| 旧系统（OpenCode 插件） | 新系统（OpenAI Agents JS） |
|---|---|
| `task(subagent_type="actor")` | `actorAgent.asTool()` → GM 自然调用 `call_actor` |
| `task_id` session 复用（best-effort） | `Session` 后端（SQLite/Redis）可靠持久化 |
| `append_interaction` + `.working/` 文件 | 交互记录作为 `call_scribe` 工具参数传入 |
| `chat.system.transform` hook 自动注入 | Agent `instructions` 动态函数按需注入 |
| `session.compacting` hook 保留路径 | Session 后端自动保留完整对话历史 |
| GM 698 行自然语言编排 prompt | 精简 GM prompt + `asTool()` 注册 subagent |
| OpenCode TUI | Next.js Web UI + `useChat()` |
| `Bun.file()` / `Bun.write()` | 同（无变化） |
| `.novel/` 目录结构 | 同（完全兼容） |
| 6 个 plugin tool | `tool()` 定义 + subagent 工具 |
| 角色文件 Markdown 格式 | 同（完全兼容） |
| `buildStoryContext()` 优先级注入 | 同（直接搬入 `src/context/`） |
| 无 per-agent 记忆 | Session 后端 per 角色 session |
| 无 session 持久化 | SQLiteSession / RedisSession |
| 子 session 详情不可查 | Session 后端数据可查 |
| GM 被迫同时做创作和路由决策 | GM 只做创作，路由从工具调用自然涌现 |
| 无并行 Agent 调用 | Runner 支持并行工具调用 |

---

## 9. 迁移策略

### Phase 1：骨架搭建（1 周）

1. 初始化 Next.js 项目
2. 安装依赖：`@openai/agents`, `@openai/agents-extensions`, `ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`
3. 搭建 API route（`/api/narrative`）——`run()` + `createAiSdkUiMessageStreamResponse()`
4. 搭建前端骨架（`useChat()` + 基础聊天 UI）
5. 定义最简单的 GM Agent（无 subagent，纯对话）
6. 验证：GM 能跑通端到端流式输出

### Phase 2：核心编排（1-2 周）

1. 迁移 `buildStoryContext()` 及依赖函数到 `src/context/`
2. 迁移 `.novel/` 模板文件
3. 定义 Actor/Scribe/Archivist 三个 sub-agent
4. 用 `asTool()` 注册到 GM
5. 实现 Session 管理（SQLiteSession）
6. 迁移 4 个 Agent prompt 到 `src/prompts/`
7. 验证：GM → Actor → Scribe → Archivist 完整流程跑通

### Phase 3：功能完善（1-2 周）

1. 实现故事管理 API（init/archive/reset）
2. 实现 Agent 工具定义（file-tools, character-tools）
3. 前端 UI 完善（场景状态指示、角色标签、工具调用显示）
4. 子 Session 详情查看功能
5. 错误处理 + 重试逻辑

### Phase 4：优化与高级功能（可选）

1. 并行 Actor 调用（同一场景中多角色同时反应）
2. Agent 间直接通信（Actor A 的输出直接作为 Actor B 的输入，不经过 GM 中转）
3. 上下文压缩（长对话自动摘要）
4. Per-agent 持久记忆（独立于 Session 的角色情感状态缓存）
5. LLM 模型动态切换（不同场景用不同模型）

---

## 10. 关键设计决策

### 10.1 为什么选择 Agent-as-Tool 而非 LangGraph

**核心矛盾**：即兴叙事要求 GM 自由对话、按需调度；图路由要求 GM 输出结构化路由决策。二者认知模式根本冲突。

| 维度 | LangGraph (图路由) | Agent-as-Tool |
|------|---|---|
| GM 认知模式 | 同时做文学输出 + 路由决策 | 只做文学输出，路由隐含其中 |
| 简单问候 | GM 必须输出 `Command(goto: END)` | GM 直接回复，无工具调用 |
| 子 Agent Session | 需自建 | 内置 Session 后端 |
| 编排灵活性 | 受图结构约束 | GM 想调谁调谁，想调几次调几次 |
| 子 Agent 详情可查 | 无内置支持 | Session 后端存储 |

### 10.2 为什么选择 OpenAI Agents JS 而非 Vercel AI SDK

| 需求 | OpenAI Agents JS | Vercel AI SDK |
|------|:---:|:---:|
| Agent-as-Tool | ✅ `asTool()` 一行 | ⚠️ 手动 `tool()` 包装 |
| **子 Agent Session 复用** | ✅✅ 内置 Session 后端 | ❌ 需手动维护 messages |
| **子 Agent 详情可查** | ✅ Session 后端存储 | ❌ 无自动存储 |
| 流式输出到用户 | ✅ `createAiSdkUiMessageStreamResponse` | ✅✅ generator yield |
| UI 集成 | ✅ `useChat()` via 适配器 | ✅✅ `useChat()` 原生 |
| LLM 提供商 | ✅ `aisdk()` 桥接任意 provider | ✅✅ 原生多 provider |

**决定性因素**：子 Agent Session 复用是刚需——Actor 需要跨调用保持角色状态。OpenAI Agents JS 原生支持，Vercel AI SDK 结构性缺失。

### 10.3 为什么交互记录不用文件系统做消息总线

旧系统用 `.novel/.working/latest-interaction.md` 是因为 OpenCode 的 `task()` 只能传自由文本，必须通过文件系统中转。

新系统中 GM 直接在工具参数中传入交互记录：
- `call_scribe({ interactionLog: "..." })` — 不需要文件做中转
- `call_archivist({ narrativeSummary: "..." })` — 同理
- 消除了 `append_interaction` / `end_interaction` 两个工具
- 消除了 hook 注入交互记录的逻辑

### 10.4 为什么 Archivist 仍然是 sub-agent 而非独立服务

Archivist 的核心工作是"读取当前状态 + 判断更新 + 写入文件"。这个逻辑需要 GM 的叙事摘要和 Scribe 的文学文本作为输入。作为 sub-agent，GM 通过 `call_archivist` 自然调用，结果返回给 GM——与 OpenCode 的 `task(archivist)` 模式一致。

### 10.5 为什么保留 .novel/ 文件系统而非全部迁移到数据库

1. **可读性**：用户可以直接打开 `.md` 文件阅读和编辑故事状态
2. **版本控制**：Markdown 文件天然适合 git 管理
3. **可移植性**：不依赖特定数据库
4. **调试友好**：故事状态一目了然
5. **Session 后端已覆盖运行时持久化需求**——`.novel/` 是业务状态，Session 是运行时状态，两者职责不同

### 10.6 LLM 模型选择策略

| Agent | 推荐模型 | 理由 |
|-------|---------|------|
| GM | Claude Sonnet / GPT-4o | 需要强创作能力 + 工具调用判断 |
| Actor | Claude Sonnet / GPT-4o | 需要角色一致性和情感表达 |
| Scribe | Claude Sonnet / GPT-4o | 需要强文学能力 |
| Archivist | Claude Haiku / GPT-4o-mini | 结构化提取任务，低成本 |

模型通过 `aisdk()` 桥接，支持运行时切换任意 Vercel AI SDK 兼容的 provider。

---

## 11. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| `@openai/agents` JS SDK 较新，API 可能变更 | 中 | 重构成本 | 锁定版本 + 充分测试 |
| `asTool()` 流式子 Agent 输出有限 | 低 | 用户体验 | `onStream` callback + `customOutputExtractor` 组合使用 |
| `aisdk()` 桥接层兼容性问题 | 低 | 某些 provider 不可用 | 回退到 OpenAI 原生 model |
| Session 后端性能（大量历史） | 低 | 响应变慢 | 定期清理归档 session |
| GM 工具循环步数过多 | 中 | Token 消耗大 | 设置 `maxTurns` 限制 |
