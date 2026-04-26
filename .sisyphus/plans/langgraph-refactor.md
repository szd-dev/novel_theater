# LangGraph → OpenAI Agents JS 彻底重构

## TL;DR

> **Quick Summary**: 将自由剧场的编排层从 LangGraph.js (图路由) 彻底替换为 OpenAI Agents JS (Agent-as-Tool 模式)。GM 作为拥有工具循环的 Agent，通过 `call_actor`/`call_scribe`/`call_archivist` 自然调度子 Agent，路由从工具调用行为中涌现，而非结构化路由决策。
> 
> **Deliverables**:
> - 完整的 Agent 定义层（GM/Actor/Scribe/Archivist + asTool 注册）
> - Agent 工具定义（file-tools, character-tools, story-tools）
> - 重写的 API 路由层（narrative, status）
> - 迁移的 GM prompt（去除 LangGraph 语法，加入工具调用描述）
> - 重写的模型配置（aisdk() 桥接）
> - 修复的前端组件（agent label、chat input、layout metadata、挂载 SceneIndicator/ProgressIndicator）
> - 删除的 LangGraph 层（src/graph/ 整个目录）
> - 更新的测试
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: T1(依赖) → T3(Agent定义) → T7(API路由) → T10(删除LangGraph) → T12(测试) → F1-F4

---

## Context

### Original Request
LangGraph 死板的调度根本无法满足即兴叙事业务需求，需要彻底重构为 OpenAI Agents JS (Agent-as-Tool 模式)。

### Interview Summary
**Key Discussions**:
- LangGraph 致命问题：GM 路由用关键词匹配（UserIntentSchema 未使用）、Archivist 完全是 no-op（narrativeSummary 从未设置）、流式输出 3 套不兼容 API
- 技术方案确认：ARCHITECTURE.md 描述的 Agent-as-Tool 模式
- 前端不重新设计，只换后端编排层
- Session：先用 MemorySession（ARCHITECTURE.md 中 SQLiteSession/RedisSession/MongoDBSession 不存在于 SDK）
- 测试策略：Tests After

**Research Findings**:
- OpenAI Agents JS v0.8.5：Agent, asTool(), Runner.run(), tool(), MemorySession, OpenAIConversationsSession
- SDK 无 SQLite/Redis/MongoDB Session 实现，需自建或用 MemorySession
- 需要 Zod v4（已安装）
- asTool() 支持 customOutputExtractor, parameters (Zod schema), inputBuilder
- createAiSdkUiMessageStreamResponse() 桥接 StreamedRunResult → AI SDK UIMessage stream
- 动态 instructions: (runContext, agent) => string

### Metis Review
**Identified Gaps** (addressed):
- 当前系统比表面更破碎：7 个状态字段从未设置/读取、Archivist 120 行代码从不执行、Actor 始终收到硬编码 "请做出反应。"、config.writer 事件全部丢弃
- 回归风险近零：无法从一个已经断裂的系统退化
- maxTurns 默认 10 不够复杂场景（3 Actor + Scribe + Archivist = 5+ turns），需设 25
- 前端 extractAgentLabel() 必须更新：新系统产生 tool-invocation parts 而非 data-* parts
- Archivist 验证逻辑（isValidCharacterFile/isValidSceneFile/isSafePath）必须迁移到工具实现内部
- E2E 测试完全 LangGraph 特定，需完全重写

---

## Work Objectives

### Core Objective
将 LangGraph 图路由编排层彻底替换为 OpenAI Agents JS Agent-as-Tool 模式，使 GM 能自然对话、按需调度子 Agent，修复当前系统所有断裂的数据流。

### Concrete Deliverables
- `src/agents/gm.ts` — GM Agent 定义（tool-loop + call_actor/call_scribe/call_archivist）
- `src/agents/actor.ts` — Actor Agent 定义（resolve_character + read_file 工具）
- `src/agents/scribe.ts` — Scribe Agent 定义（read_file 工具）
- `src/agents/archivist.ts` — Archivist Agent 定义（file + character 工具）
- `src/agents/registry.ts` — asTool() 注册 + Agent 导出
- `src/tools/file-tools.ts` — readFile/writeFile/editFile/globFiles
- `src/tools/character-tools.ts` — resolveCharacter/listCharacters
- `src/tools/story-tools.ts` — initStory/archiveStory/resetStory（Agent 工具版）
- `src/session/manager.ts` — Session 创建/获取/清理
- `src/session/types.ts` — Session 类型定义
- 重写的 `src/app/api/narrative/route.ts`
- 重写的 `src/app/api/narrative/status/route.ts`
- 重写的 `src/lib/models.ts`
- 迁移的 `src/prompts/gm.ts`
- 修复的 `src/components/chat/message-item.tsx`
- 修复的 `src/components/chat/chat-input.tsx`
- 修复的 `src/app/layout.tsx`
- 挂载 SceneIndicator/ProgressIndicator
- 删除 `src/graph/` 整个目录
- 删除 `src/store/agent-memory.ts`
- 更新的测试文件

### Definition of Done
- [ ] `bun run build` 零错误
- [ ] 代码中无任何 `@langchain` / `@ai-sdk/langchain` 引用
- [ ] GM 能流式回复简单问候（无工具调用）
- [ ] GM 能调用 call_actor → Actor 产出角色反应
- [ ] GM 能调用 call_scribe → Scribe 产出文学文本
- [ ] GM 能调用 call_archivist → Archivist 更新 .novel/ 文件
- [ ] 前端正确显示 Agent 标签（从 tool-invocation parts 提取）
- [ ] SceneIndicator 和 ProgressIndicator 已挂载

### Must Have
- GM Agent 拥有 call_actor/call_scribe/call_archivist 三个工具
- 每个子 Agent 拥有独立工具循环
- GM 使用动态 instructions 注入故事上下文
- Actor 使用动态 instructions 注入角色上下文
- asTool() 使用自定义 parameters（Zod schema）+ inputBuilder
- GM maxTurns 设为 25
- Archivist 工具内包含文件验证逻辑
- 前端 extractAgentLabel() 从 tool-invocation parts 读取
- MemorySession 管理对话历史

### Must NOT Have (Guardrails)
- 不修改 src/context/ 任何文件
- 不修改 src/store/story-files.ts
- 不修改 src/lib/templates.ts, src/lib/retry.ts, src/lib/utils.ts
- 不修改 src/prompts/actor.ts, src/prompts/scribe.ts, src/prompts/archivist.ts
- 不实现 SQLite/Redis/MongoDB Session
- 不添加超出范围的功能：并行 Actor 调用、Agent 间直接通信、上下文压缩、per-agent 持久记忆、模型动态切换
- 不创建不必要抽象：无 BaseAgent 类、无 ToolFactory、无泛型工具注册表
- 不复制断裂的状态字段（currentSceneId/narrativeSummary/interactionLog 作为共享状态）——它们应通过工具参数和 Session 流动
- 不在 Phase 3 验证通过前删除 src/graph/

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test + 5 test files)
- **Automated tests**: Tests After
- **Framework**: bun test
- **If Tests After**: Implementation tasks first, test tasks in final wave

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill)
- **API/Backend**: Use Bash (curl)
- **Build/TypeCheck**: Use Bash (bun run build, tsc --noEmit)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - foundation + dependency swap):
├── Task 1: 依赖替换 + 模型配置重写 [quick]
├── Task 2: Agent 工具定义 [unspecified-high]
├── Task 3: Session 管理层 [quick]
└── Task 4: GM Prompt 迁移 [quick]

Wave 2 (After Wave 1 - Agent definitions + asTool registration):
├── Task 5: Actor Agent 定义 (depends: 1, 2) [unspecified-high]
├── Task 6: Scribe Agent 定义 (depends: 1, 2) [quick]
├── Task 7: Archivist Agent 定义 (depends: 1, 2) [unspecified-high]
└── Task 8: GM Agent 定义 + asTool 注册 (depends: 4, 5, 6, 7) [deep]

Wave 3 (After Wave 2 - API routes + frontend fixes):
├── Task 9: API 路由重写 (depends: 8, 3) [unspecified-high]
├── Task 10: 前端组件修复 (depends: 8) [quick]
└── Task 11: 删除 LangGraph 层 (depends: 9, 10) [quick]

Wave 4 (After Wave 3 - tests + cleanup):
├── Task 12: 测试更新 (depends: 11) [unspecified-high]
└── Task 13: 构建验证 + 清理 (depends: 12) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T2 → T5 → T8 → T9 → T11 → T12 → T13 → F1-F4
Parallel Speedup: ~55% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | - | 5, 6, 7, 8, 9 | 1 |
| 2 | - | 5, 6, 7 | 1 |
| 3 | - | 9 | 1 |
| 4 | - | 8 | 1 |
| 5 | 1, 2 | 8 | 2 |
| 6 | 1, 2 | 8 | 2 |
| 7 | 1, 2 | 8 | 2 |
| 8 | 4, 5, 6, 7 | 9, 10 | 2 |
| 9 | 8, 3 | 11 | 3 |
| 10 | 8 | 11 | 3 |
| 11 | 9, 10 | 12 | 3 |
| 12 | 11 | 13 | 4 |
| 13 | 12 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `unspecified-high`, T3 → `quick`, T4 → `quick`
- **Wave 2**: 4 tasks — T5 → `unspecified-high`, T6 → `quick`, T7 → `unspecified-high`, T8 → `deep`
- **Wave 3**: 3 tasks — T9 → `unspecified-high`, T10 → `quick`, T11 → `quick`
- **Wave 4**: 2 tasks — T12 → `unspecified-high`, T13 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. 依赖替换 + 模型配置重写

  **What to do**:
  - 安装新依赖：`@openai/agents`, `@openai/agents-extensions`
  - 移除旧依赖：`@langchain/langgraph`, `@langchain/openai`, `@ai-sdk/langchain`
  - 重写 `src/lib/models.ts`：
    - 保留 `AgentRole` 类型（'gm' | 'actor' | 'scribe' | 'archivist'）
    - 保留 `MODEL_GM`, `MODEL_ACTOR`, `MODEL_SCRIBE`, `MODEL_ARCHIVIST` 环境变量覆盖模式
    - 保留 `OPENAI_BASE_URL` 支持
    - 删除 `createModelInstance()` (ChatOpenAI)
    - 新增 `getModel(role: AgentRole)` 函数，返回 `aisdk(provider('model-name'))` 格式
    - 支持多 provider：OpenAI (`@ai-sdk/openai`), Anthropic (`@ai-sdk/anthropic`)
    - 默认模型：GM→claude-sonnet-4, Actor→claude-sonnet-4, Scribe→claude-sonnet-4, Archivist→gpt-4o-mini
  - 运行 `bun install` 确认依赖解析
  - 运行 `bun run build` 确认当前代码仍可构建（新依赖不影响现有 LangGraph 代码）

  **Must NOT do**:
  - 不修改 src/context/ 任何文件
  - 不删除 src/graph/ （保留到 Phase 3 验证后）
  - 不修改 src/prompts/ 任何文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 依赖替换和配置重写是标准操作，逻辑清晰
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 6, 7, 8, 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/models.ts` — 当前模型配置，保留环境变量覆盖模式和 AgentRole 类型，替换 ChatOpenAI 为 aisdk() 桥接
  - `src/graph/nodes/gm.ts:1-5` — 当前 ChatOpenAI 使用方式，了解如何被调用
  - `package.json` — 当前依赖列表，确认哪些要移除

  **API/Type References**:
  - `@openai/agents-extensions/ai-sdk` — `aisdk()` 函数签名：`aisdk(aiSdkModel: LanguageModelV2) => Model`
  - `@ai-sdk/openai` — `openai('model-name')` 返回 `LanguageModelV2`
  - `@ai-sdk/anthropic` — `anthropic('model-name')` 返回 `LanguageModelV2`

  **External References**:
  - OpenAI Agents JS SDK: `aisdk()` 用法 — `import { aisdk } from '@openai/agents-extensions/ai-sdk'`

  **WHY Each Reference Matters**:
  - `src/lib/models.ts`: 当前文件是重写目标，保留环境变量模式和角色映射
  - `gm.ts:1-5`: 了解模型实例在节点中如何被消费，确保新接口兼容
  - `package.json`: 确认要移除的 LangChain 包名和版本

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 依赖安装成功
    Tool: Bash
    Preconditions: package.json 已更新
    Steps:
      1. 运行 `bun install`
      2. 检查 node_modules/@openai/agents 存在
      3. 检查 node_modules/@langchain/langgraph 不存在
    Expected Result: `ls node_modules/@openai/agents/package.json` 存在，`ls node_modules/@langchain/langgraph 2>&1` 报错
    Failure Indicators: 安装失败或 LangChain 包仍存在
    Evidence: .sisyphus/evidence/task-1-deps-install.txt

  Scenario: 模型配置函数可用
    Tool: Bash
    Preconditions: src/lib/models.ts 已重写
    Steps:
      1. 运行 `bun -e "import { getModel } from './src/lib/models'; console.log(typeof getModel('gm'))"`
      2. 确认输出包含 "object"（返回 Model 实例）
    Expected Result: getModel('gm') 返回有效对象
    Failure Indicators: 导入失败或返回 undefined
    Evidence: .sisyphus/evidence/task-1-model-config.txt

  Scenario: 构建不破坏现有代码
    Tool: Bash
    Preconditions: 依赖已替换，models.ts 已重写
    Steps:
      1. 运行 `bun run build 2>&1 | tail -5`
    Expected Result: 构建成功（可能有类型错误但不阻断构建，因为旧代码仍引用 ChatOpenAI）
    Failure Indicators: 构建完全失败
    Evidence: .sisyphus/evidence/task-1-build-check.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(deps): swap LangGraph for OpenAI Agents JS + rewrite models.ts`
  - Files: `package.json`, `bun.lock`, `src/lib/models.ts`
  - Pre-commit: `bun install`

- [x] 2. Agent 工具定义

  **What to do**:
  - 创建 `src/tools/file-tools.ts`：
    - `readFileTool`: tool({ name: 'read_file', parameters: z.object({ path: z.string() }), execute: ... })
      - 调用 `readNovelFile(storyDir, path)` 从 src/store/story-files.ts
      - 需要从 RunContext 获取 storyDir
    - `writeFileTool`: tool({ name: 'write_file', parameters: z.object({ path: z.string(), content: z.string() }), execute: ... })
      - 调用 `writeNovelFile(storyDir, path, content)`
      - 包含 `isSafePath` 验证：禁止 `..`、禁止前导 `/`
    - `editFileTool`: tool({ name: 'edit_file', parameters: z.object({ path: z.string(), search: z.string(), replace: z.string() }), execute: ... })
      - 读取文件 → 替换 → 写回
      - 包含 `isSafePath` 验证
    - `globFilesTool`: tool({ name: 'glob_files', parameters: z.object({ pattern: z.string() }), execute: ... })
      - 调用 `globNovelFiles(storyDir, pattern)`
  - 创建 `src/tools/character-tools.ts`：
    - `resolveCharacterTool`: tool({ name: 'resolve_character', parameters: z.object({ name: z.string() }), execute: ... })
      - 调用 `findCharacterByName()` 从 src/context/character-resolver.ts
    - `listCharactersTool`: tool({ name: 'list_characters', parameters: z.object({}), execute: ... })
      - 调用 `listAllCharacters()` 从 src/context/character-resolver.ts
  - 创建 `src/tools/story-tools.ts`：
    - `initStoryTool`: tool({ name: 'init_story', parameters: z.object({}), execute: ... })
    - `archiveStoryTool`: tool({ name: 'archive_story', parameters: z.object({ name: z.string() }), execute: ... })
    - `resetStoryTool`: tool({ name: 'reset_story', parameters: z.object({}), execute: ... })
  - 所有工具需要从 RunContext.context 获取 storyDir
  - 文件写入工具必须包含验证：`isSafePath`（禁止路径遍历）、`isValidCharacterFile`（需有 `# Name` 和 `> L0` 行）、`isValidSceneFile`（需有必要章节）

  **Must NOT do**:
  - 不修改 src/store/story-files.ts（直接复用其函数）
  - 不修改 src/context/character-resolver.ts（直接复用其函数）
  - 不创建泛型工具注册表或工厂模式

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 工具定义需要理解 SDK API（tool() 函数签名、Zod schema、execute 签名），且有验证逻辑需要从 Archivist 迁移
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/store/story-files.ts` — readNovelFile/writeNovelFile/globNovelFiles 函数签名和实现，工具 execute 中直接调用
  - `src/context/character-resolver.ts` — findCharacterByName/listAllCharacters 函数签名，resolveCharacterTool 中直接调用
  - `src/graph/nodes/archivist.ts:47-100` — 当前 isSafePath/isValidCharacterFile/isValidSceneFile 验证逻辑（虽然从执行不到，但逻辑本身是正确的，需迁移到工具中）

  **API/Type References**:
  - `@openai/agents` `tool()` 函数签名：`tool({ name, description, parameters: z.object({...}), execute: async (input, context, details) => result })`
  - `RunContext.context` — 通过 `run(agent, input, { context: { storyDir } })` 传入的自定义上下文

  **External References**:
  - OpenAI Agents JS SDK tool() 文档：Zod v4 schema, execute 签名, 返回值处理

  **WHY Each Reference Matters**:
  - `story-files.ts`: 工具的 execute 函数直接调用这些函数，需了解参数和返回值
  - `character-resolver.ts`: 同上
  - `archivist.ts:47-100`: 验证逻辑需迁移，但当前是死代码。提取验证函数到工具中使其真正执行

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 工具文件存在且可导入
    Tool: Bash
    Preconditions: src/tools/ 目录已创建
    Steps:
      1. 运行 `bun -e "import { readFileTool, writeFileTool, editFileTool, globFilesTool } from './src/tools/file-tools'; console.log('OK')"`
      2. 运行 `bun -e "import { resolveCharacterTool, listCharactersTool } from './src/tools/character-tools'; console.log('OK')"`
    Expected Result: 两个导入均输出 "OK"
    Failure Indicators: 导入失败或类型错误
    Evidence: .sisyphus/evidence/task-2-tools-import.txt

  Scenario: 文件写入工具包含路径验证
    Tool: Bash
    Preconditions: file-tools.ts 已创建
    Steps:
      1. 检查 writeFileTool 的 execute 函数中包含 isSafePath 验证
      2. 验证 `../etc/passwd` 和 `/etc/passwd` 会被拒绝
    Expected Result: 恶意路径被拒绝，返回错误信息
    Failure Indicators: 恶意路径未被拦截
    Evidence: .sisyphus/evidence/task-2-path-validation.txt

  Scenario: 字符工具正确调用 character-resolver
    Tool: Bash
    Preconditions: character-tools.ts 已创建
    Steps:
      1. 初始化 .novel/ 目录（如不存在）
      2. 验证 resolveCharacterTool 的 execute 调用 findCharacterByName
    Expected Result: 工具定义中引用了 findCharacterByName 函数
    Failure Indicators: 未引用或引用错误
    Evidence: .sisyphus/evidence/task-2-character-tools.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(tools): define agent tools for file I/O, character resolution, and story management`
  - Files: `src/tools/file-tools.ts`, `src/tools/character-tools.ts`, `src/tools/story-tools.ts`
  - Pre-commit: `bun run build`

- [x] 3. Session 管理层

  **What to do**:
  - 创建 `src/session/types.ts`：
    - 定义 `StorySession` 类型（包含 threadId、gmSession、characterSessions Map）
  - 创建 `src/session/manager.ts`：
    - `createStorySession(threadId: string)` — 创建包含 GM 主 session 和角色子 session 的 StorySession
    - `getStorySession(threadId: string)` — 获取已有 session（使用内存 Map 缓存）
    - `getCharacterSession(threadId: string, characterName: string)` — 获取角色专用 MemorySession
    - `clearStorySession(threadId: string)` — 清理指定 story session
    - 所有 session 使用 MemorySession
    - 主 session (GM) 和子 session (per character) 独立管理

  **Must NOT do**:
  - 不实现 SQLite/Redis/MongoDB 持久化
  - 不创建 Session 抽象工厂

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: MemorySession 是最简实现，manager 是简单的 CRUD 封装
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:

  **API/Type References**:
  - `@openai/agents` `MemorySession` 类 — `new MemorySession({ sessionId?, initialItems? })`
  - `@openai/agents` `Session` 接口 — `getSessionId()`, `getItems(limit?)`, `addItems(items)`, `popItem()`, `clearSession()`

  **External References**:
  - OpenAI Agents JS SDK: MemorySession 和 Session 接口文档

  **WHY Each Reference Matters**:
  - MemorySession 是 Session 接口的内存实现，了解其构造函数和 API 是正确封装的前提

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Session 管理器可创建和获取 session
    Tool: Bash
    Preconditions: src/session/ 已创建
    Steps:
      1. 运行 `bun -e "import { createStorySession, getStorySession } from './src/session/manager'; const s = createStorySession('test-thread'); const s2 = getStorySession('test-thread'); console.log(s === s2)"`
      2. 确认同一 threadId 返回同一 session
    Expected Result: 输出 "true"
    Failure Indicators: session 未缓存或获取失败
    Evidence: .sisyphus/evidence/task-3-session-manager.txt

  Scenario: 角色子 session 独立管理
    Tool: Bash
    Preconditions: session manager 已创建
    Steps:
      1. 创建 story session
      2. 获取 "塞莉娅" 的 character session
      3. 获取 "希尔薇" 的 character session
      4. 验证两个 session 的 sessionId 不同
    Expected Result: 两个角色 session 独立，sessionId 不同
    Failure Indicators: session 混淆或共享
    Evidence: .sisyphus/evidence/task-3-character-session.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(session): add MemorySession management for GM and character sub-sessions`
  - Files: `src/session/manager.ts`, `src/session/types.ts`
  - Pre-commit: `bun run build`

- [x] 4. GM Prompt 迁移

  **What to do**:
  - 编辑 `src/prompts/gm.ts`：
    - 删除所有 LangGraph `Command(` 引用（约 10 处：lines 105-111, 446, 495, 566, 580 等）
    - 删除 `state.interactionLog` / `state.characterFile` 引用
    - 删除 `append_interaction` / `end_interaction` 工作流描述
    - 删除 `maxActorTurns` 管理描述（由 Runner 自动管理）
    - 添加工具调用描述：GM 拥有 `call_actor`、`call_scribe`、`call_archivist` 三个工具
    - 添加每个工具的使用场景和参数说明：
      - `call_actor({ character: string, direction: string })` — 调用演员进行角色表演
      - `call_scribe({ interactionLog: string, sceneContext: string })` — 调用书记将交互记录转为文学文本
      - `call_archivist({ narrativeSummary: string, literaryText: string })` — 调用场记员更新故事状态文件
    - 保留核心：四阶段场景编排逻辑、角色去重规则、场景生命周期、叙事摘要格式、输出规范
    - 更新 `src/prompts/types.ts` 中的 `GMPromptState` 类型（如需要）

  **Must NOT do**:
  - 不修改 src/prompts/actor.ts, scribe.ts, archivist.ts
  - 不重写整个 prompt（迁移，不是重写）
  - 不添加超出范围的工具或功能描述

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Prompt 迁移是文本替换，核心逻辑不变
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/prompts/gm.ts` — 当前 621 行 GM prompt，需找到所有 LangGraph 引用并替换
  - `src/prompts/types.ts` — PromptConfig 和 GMPromptState 类型定义

  **API/Type References**:
  - ARCHITECTURE.md Section 1.1 — Agent-as-Tool 模式描述，GM 工具调用示例
  - ARCHITECTURE.md Section 4.6 — Prompt 迁移清单，明确列出删除和保留的内容

  **WHY Each Reference Matters**:
  - `gm.ts`: 直接编辑目标，需精确定位所有 LangGraph 引用
  - `types.ts`: 确保类型定义与新 prompt 兼容
  - ARCHITECTURE.md: 提供迁移方向和具体删除/保留清单

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GM prompt 不包含 LangGraph 引用
    Tool: Bash
    Preconditions: gm.ts 已编辑
    Steps:
      1. 运行 `grep -n "Command(\|LangGraph\|append_interaction\|end_interaction\|state\.interactionLog\|state\.characterFile\|maxActorTurns" src/prompts/gm.ts`
    Expected Result: 无匹配输出（所有 LangGraph 引用已删除）
    Failure Indicators: 任何匹配行
    Evidence: .sisyphus/evidence/task-4-no-langgraph-refs.txt

  Scenario: GM prompt 包含工具调用描述
    Tool: Bash
    Preconditions: gm.ts 已编辑
    Steps:
      1. 运行 `grep -n "call_actor\|call_scribe\|call_archivist" src/prompts/gm.ts`
    Expected Result: 至少 3 行匹配（每个工具至少一处描述）
    Failure Indicators: 缺少任何工具描述
    Evidence: .sisyphus/evidence/task-4-tool-descriptions.txt

  Scenario: GM prompt 保留核心逻辑
    Tool: Bash
    Preconditions: gm.ts 已编辑
    Steps:
      1. 运行 `grep -n "四阶段\|角色去重\|场景生命\|叙事摘要" src/prompts/gm.ts`
    Expected Result: 所有核心逻辑关键词仍存在
    Failure Indicators: 核心逻辑被误删
    Evidence: .sisyphus/evidence/task-4-core-preserved.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `refactor(prompts): migrate GM prompt from LangGraph to Agent-as-Tool tool descriptions`
  - Files: `src/prompts/gm.ts`
  - Pre-commit: `bun run build`

- [x] 5. Actor Agent 定义

  **What to do**:
  - 创建 `src/agents/actor.ts`：
    - `actorAgent = new Agent({ name: 'Actor', model: getModel('actor'), instructions: dynamicFn, tools: [...] })`
    - 动态 instructions：`(runContext, agent) => { ... }`
      - 从 runContext.context 获取 characterName
      - 调用 `readNovelFile(storyDir, 'characters/${characterName}.md')` 读取角色文件
      - 调用 `findLatestScene(storyDir)` + `readNovelFile` 读取最新场景
      - 组合：ACTOR_SYSTEM_PROMPT + 角色文件内容 + 最新场景上下文
    - 工具：`resolveCharacterTool`, `readFileTool`
    - model: `getModel('actor')`（aisdk 桥接）
  - 导出 `actorAgent`

  **Must NOT do**:
  - 不修改 src/prompts/actor.ts
  - 不修改 src/context/ 任何文件

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Agent 定义需要理解 SDK Agent API、动态 instructions 模式、以及如何从 context 获取角色信息
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/prompts/actor.ts` — Actor 系统提示词，直接引用
  - `src/graph/nodes/actor.ts` — 当前 Actor 节点实现，了解上下文注入方式和工具使用
  - `src/context/build-story-context.ts` — buildStoryContext 函数，了解上下文组装逻辑

  **API/Type References**:
  - `@openai/agents` `Agent` 类 — `new Agent({ name, model, instructions, tools })`
  - `@openai/agents` 动态 instructions — `(runContext: RunContext<TContext>, agent: Agent) => Promise<string> | string`

  **WHY Each Reference Matters**:
  - `actor.ts` (prompts): Actor 的 system prompt 内容，直接引用
  - `actor.ts` (graph/nodes): 了解当前 Actor 如何获取角色上下文，确保新实现覆盖相同逻辑
  - `build-story-context.ts`: 上下文组装的核心逻辑，Actor 的动态 instructions 需要调用

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Actor Agent 可导入且类型正确
    Tool: Bash
    Preconditions: src/agents/actor.ts 已创建
    Steps:
      1. 运行 `bun -e "import { actorAgent } from './src/agents/actor'; console.log(actorAgent.name)"`
    Expected Result: 输出 "Actor"
    Failure Indicators: 导入失败或 name 不匹配
    Evidence: .sisyphus/evidence/task-5-actor-import.txt

  Scenario: Actor Agent 拥有正确工具
    Tool: Bash
    Preconditions: actor.ts 已创建
    Steps:
      1. 运行 `bun -e "import { actorAgent } from './src/agents/actor'; console.log(actorAgent.tools.map(t => t.name))"`
    Expected Result: 包含 "resolve_character" 和 "read_file"
    Failure Indicators: 工具缺失
    Evidence: .sisyphus/evidence/task-5-actor-tools.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(agents): define Actor agent with dynamic instructions and character tools`
  - Files: `src/agents/actor.ts`
  - Pre-commit: `bun run build`

- [x] 6. Scribe Agent 定义

  **What to do**:
  - 创建 `src/agents/scribe.ts`：
    - `scribeAgent = new Agent({ name: 'Scribe', model: getModel('scribe'), instructions: SCRIBE_SYSTEM_PROMPT, tools: [...] })`
    - instructions: 直接使用 `SCRIBE_SYSTEM_PROMPT`（静态，Scribe 不需要动态上下文）
    - 工具：`readFileTool`（读取 style.md, world.md, 角色文件）
    - model: `getModel('scribe')`

  **Must NOT do**:
  - 不修改 src/prompts/scribe.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Scribe 是最简单的 Agent，静态 instructions + 单一工具
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/prompts/scribe.ts` — Scribe 系统提示词，直接引用
  - `src/graph/nodes/scribe.ts` — 当前 Scribe 节点实现

  **WHY Each Reference Matters**:
  - `scribe.ts` (prompts): Scribe 的 system prompt 内容
  - `scribe.ts` (graph/nodes): 了解当前 Scribe 读取哪些文件（style.md, world.md）

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Scribe Agent 可导入且配置正确
    Tool: Bash
    Preconditions: src/agents/scribe.ts 已创建
    Steps:
      1. 运行 `bun -e "import { scribeAgent } from './src/agents/scribe'; console.log(scribeAgent.name, scribeAgent.tools.length)"`
    Expected Result: 输出 "Scribe 1"（1 个工具：read_file）
    Failure Indicators: 导入失败或工具数量不对
    Evidence: .sisyphus/evidence/task-6-scribe-import.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(agents): define Scribe agent with read_file tool`
  - Files: `src/agents/scribe.ts`
  - Pre-commit: `bun run build`

- [x] 7. Archivist Agent 定义

  **What to do**:
  - 创建 `src/agents/archivist.ts`：
    - `archivistAgent = new Agent({ name: 'Archivist', model: getModel('archivist'), instructions: ARCHIVIST_SYSTEM_PROMPT, tools: [...] })`
    - instructions: 直接使用 `ARCHIVIST_SYSTEM_PROMPT`（静态）
    - 工具：`readFileTool`, `writeFileTool`, `editFileTool`, `globFilesTool`, `resolveCharacterTool`
    - model: `getModel('archivist')`（低成本模型）
  - 导出 `archivistAgent`

  **Must NOT do**:
  - 不修改 src/prompts/archivist.ts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Archivist 工具最多，需确保验证逻辑正确迁移到工具中
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/prompts/archivist.ts` — Archivist 系统提示词，直接引用
  - `src/graph/nodes/archivist.ts` — 当前 Archivist 节点实现，了解 FileUpdatesSchema 和文件更新逻辑

  **WHY Each Reference Matters**:
  - `archivist.ts` (prompts): Archivist 的 system prompt 内容
  - `archivist.ts` (graph/nodes): 了解当前 Archivist 的文件更新逻辑（虽然从执行不到，但逻辑本身正确）

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Archivist Agent 可导入且工具完整
    Tool: Bash
    Preconditions: src/agents/archivist.ts 已创建
    Steps:
      1. 运行 `bun -e "import { archivistAgent } from './src/agents/archivist'; console.log(archivistAgent.name, archivistAgent.tools.map(t => t.name).sort().join(','))"`
    Expected Result: 输出 "Archivist edit_file,glob_files,read_file,resolve_character,write_file"
    Failure Indicators: 工具缺失或名称不对
    Evidence: .sisyphus/evidence/task-7-archivist-import.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(agents): define Archivist agent with file and character tools`
  - Files: `src/agents/archivist.ts`
  - Pre-commit: `bun run build`

- [x] 8. GM Agent 定义 + asTool 注册

  **What to do**:
  - 创建 `src/agents/gm.ts`：
    - `gmAgent = new Agent({ name: 'GM', model: getModel('gm'), instructions: dynamicFn, tools: [...] })`
    - 动态 instructions：`async (runContext, agent) => { const storyContext = await buildStoryContext(storyDir); return getGMPrompt({ storyContext }); }`
    - 工具：三个 asTool() 注册的子 Agent 工具
    - model: `getModel('gm')`
    - maxTurns: 25（通过 run options 设置，不在 Agent 上）
  - 创建 `src/agents/registry.ts`：
    - 导入所有 Agent 定义
    - 注册 asTool() 工具：
      - `callActorTool = actorAgent.asTool({ toolName: 'call_actor', toolDescription: '...', parameters: z.object({ character: z.string(), direction: z.string() }), inputBuilder: (params) => [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: `角色：${params.character}\n指示：${params.direction}` }] }], customOutputExtractor: (result) => String(result.finalOutput ?? '') })`
      - `callScribeTool = scribeAgent.asTool({ toolName: 'call_scribe', toolDescription: '...', parameters: z.object({ interactionLog: z.string(), sceneContext: z.string() }), inputBuilder: ..., customOutputExtractor: ... })`
      - `callArchivistTool = archivistAgent.asTool({ toolName: 'call_archivist', toolDescription: '...', parameters: z.object({ narrativeSummary: z.string(), literaryText: z.string() }), inputBuilder: ..., customOutputExtractor: ... })`
    - 将 asTool 工具注册到 GM Agent 的 tools 数组
    - 导出 `gmAgent`（供 API route 使用）
    - 导出 `actorAgent`, `scribeAgent`, `archivistAgent`（供调试/测试使用）

  **Must NOT do**:
  - 不使用 handoffs（用 asTool，GM 保持控制权）
  - 不设置 maxTurns 在 Agent 上（在 run() options 中设置）
  - 不创建 BaseAgent 抽象类

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: GM 是系统核心，asTool 注册需要精确的参数 schema、inputBuilder 和 customOutputExtractor 设计
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (depends on 4, 5, 6, 7)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `src/prompts/gm.ts` — 迁移后的 GM prompt（含工具调用描述）
  - `src/prompts/types.ts` — GMPromptState 类型
  - `src/context/build-story-context.ts` — buildStoryContext 函数
  - ARCHITECTURE.md Section 4.3.1 — GM Agent 定义代码示例

  **API/Type References**:
  - `@openai/agents` `Agent` 类 — `new Agent({ name, model, instructions, tools })`
  - `@openai/agents` `agent.asTool()` — `asTool({ toolName, toolDescription, parameters, inputBuilder, customOutputExtractor })`
  - `@openai/agents` 动态 instructions — `(runContext, agent) => Promise<string>`

  **WHY Each Reference Matters**:
  - `gm.ts` (prompts): GM 的 system prompt，动态 instructions 中引用
  - `build-story-context.ts`: 动态 instructions 中调用以注入故事上下文
  - ARCHITECTURE.md: 提供完整的 GM Agent 代码示例和 asTool 注册模式

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GM Agent 可导入且工具完整
    Tool: Bash
    Preconditions: src/agents/gm.ts 和 registry.ts 已创建
    Steps:
      1. 运行 `bun -e "import { gmAgent } from './src/agents/registry'; console.log(gmAgent.name, gmAgent.tools.map(t => t.name).join(','))"`
    Expected Result: 输出 "GM call_actor,call_scribe,call_archivist"
    Failure Indicators: 工具缺失或名称不对
    Evidence: .sisyphus/evidence/task-8-gm-import.txt

  Scenario: asTool 工具参数 schema 正确
    Tool: Bash
    Preconditions: registry.ts 已创建
    Steps:
      1. 验证 call_actor 的参数包含 character 和 direction 字段
      2. 验证 call_scribe 的参数包含 interactionLog 和 sceneContext 字段
      3. 验证 call_archivist 的参数包含 narrativeSummary 和 literaryText 字段
    Expected Result: 所有 asTool 工具的参数 schema 包含预期字段
    Failure Indicators: 参数缺失或类型不对
    Evidence: .sisyphus/evidence/task-8-astool-params.txt

  Scenario: GM 动态 instructions 可执行
    Tool: Bash
    Preconditions: gm.ts 已创建, .novel/ 目录存在
    Steps:
      1. 初始化 .novel/ 目录（如不存在）
      2. 调用 GM 的 instructions 函数
      3. 验证返回的字符串包含故事上下文
    Expected Result: instructions 返回包含角色/场景信息的字符串
    Failure Indicators: 函数执行失败或返回空
    Evidence: .sisyphus/evidence/task-8-gm-instructions.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(agents): define GM agent with asTool sub-agent registration`
  - Files: `src/agents/gm.ts`, `src/agents/registry.ts`
  - Pre-commit: `bun run build`

- [x] 9. API 路由重写

  **What to do**:
  - 重写 `src/app/api/narrative/route.ts`：
    - 解构请求：`const { messages, threadId } = await req.json()`
    - 获取/创建 session：`const storySession = getStorySession(threadId)`
    - 提取最新用户消息作为 input
    - 执行 Agent run：`const stream = await run(gmAgent, input, { stream: true, context: { storyDir }, maxTurns: 25, session: storySession.gmSession })`
    - 返回流式响应：`return createAiSdkUiMessageStreamResponse(stream)`
    - 错误处理：try/catch 包裹，返回 500 + 错误信息
  - 重写 `src/app/api/narrative/status/route.ts`：
    - 从 .novel/ 文件直接读取状态（不再依赖 graph.getState()）
    - 读取最新场景文件（findLatestScene）
    - 读取 world.md 提取地点
    - 读取角色目录列表
    - 返回 `{ success: true, sceneId, location, characters }` 格式
  - 保留 `src/app/api/story/route.ts` 不变（已使用 story-files.ts，无 LangGraph 依赖）

  **Must NOT do**:
  - 不修改 src/app/api/story/route.ts
  - 不改变前端请求格式（保持 { messages, threadId }）
  - 不添加新的 API 端点

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API 路由是前后端桥接层，需要精确处理流式响应、session 管理和错误处理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 10)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 8, 3

  **References**:

  **Pattern References**:
  - `src/app/api/narrative/route.ts` — 当前 API 路由实现，了解请求格式和流式处理
  - `src/app/api/narrative/status/route.ts` — 当前状态 API，了解返回格式
  - `src/agents/registry.ts` — gmAgent 导出
  - `src/session/manager.ts` — getStorySession 函数

  **API/Type References**:
  - `@openai/agents` `run()` — `run(agent, input, { stream: true, context, maxTurns, session })`
  - `@openai/agents-extensions/ai-sdk-ui` — `createAiSdkUiMessageStreamResponse(stream)`

  **WHY Each Reference Matters**:
  - `narrative/route.ts`: 当前实现是重写目标，需保持相同的请求/响应格式
  - `status/route.ts`: 需改为从 .novel/ 文件读取，替代 graph.getState()
  - `registry.ts`: gmAgent 是 API 路由中 run() 的第一个参数
  - `manager.ts`: session 管理是 API 路由的核心依赖

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Narrative API 可流式响应
    Tool: Bash (curl)
    Preconditions: .novel/ 目录已初始化，dev server 已启动
    Steps:
      1. curl -X POST http://localhost:4477/api/narrative -H 'Content-Type: application/json' -d '{"messages":[{"id":"test-1","role":"user","parts":[{"type":"text","text":"你好"}]}],"threadId":"test-qa-1"}' --max-time 30 | head -c 500
    Expected Result: 返回流式数据（非空响应，包含 AI SDK data stream protocol 格式）
    Failure Indicators: 空响应、500 错误、超时
    Evidence: .sisyphus/evidence/task-9-narrative-api.txt

  Scenario: Status API 返回故事状态
    Tool: Bash (curl)
    Preconditions: .novel/ 目录已初始化，dev server 已启动
    Steps:
      1. curl -sf "http://localhost:4477/api/narrative/status?threadId=test-qa-1"
    Expected Result: 返回 JSON 包含 success: true
    Failure Indicators: 404 或 500 错误
    Evidence: .sisyphus/evidence/task-9-status-api.txt

  Scenario: Narrative API 错误处理
    Tool: Bash (curl)
    Preconditions: dev server 已启动
    Steps:
      1. curl -X POST http://localhost:4477/api/narrative -H 'Content-Type: application/json' -d '{}' --max-time 10 -w "\n%{http_code}"
    Expected Result: 返回 400 或 500 状态码（无效请求被正确处理）
    Failure Indicators: 无响应或未处理异常
    Evidence: .sisyphus/evidence/task-9-error-handling.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(api): rewrite narrative routes for OpenAI Agents JS`
  - Files: `src/app/api/narrative/route.ts`, `src/app/api/narrative/status/route.ts`
  - Pre-commit: `bun run build`

- [x] 10. 前端组件修复

  **What to do**:
  - 修复 `src/components/chat/message-item.tsx`：
    - 更新 `extractAgentLabel()` 函数：从 `tool-invocation` parts 提取 agent 标签
    - 映射：`call_actor` → "Actor", `call_scribe` → "Scribe", `call_archivist` → "Archivist"
    - 保留现有 data-* parts 兼容（向后兼容）
  - 修复 `src/components/chat/chat-input.tsx`：
    - 将 `const disabled = false` 改为 `const disabled = status === "submitted" || status === "streaming"`
  - 修复 `src/app/layout.tsx`：
    - 将 `title: "Create Next App"` 改为 `title: "自由剧场"`
    - 将 `description: "Generated by create next app"` 改为 `description: "交互式叙事引擎"`
  - 挂载 `SceneIndicator` 在 `src/app/page.tsx`：
    - 在 ChatLayout 内部、header 和 message-list 之间插入 `<SceneIndicator threadId={threadId} />`
  - 挂载 `ProgressIndicator` 在 `src/components/chat/message-list.tsx`：
    - 从 status 和 message tool-invocation parts 推导 currentStep 和 isThinking
    - 在消息列表顶部插入 `<ProgressIndicator currentStep={currentStep} isThinking={isThinking} />`

  **Must NOT do**:
  - 不重新设计 UI 布局
  - 不修改 src/components/ui/ 任何文件
  - 不添加新页面或新路由

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 都是小型修复，逻辑清晰
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 9)
  - **Blocks**: Task 11
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `src/components/chat/message-item.tsx` — 当前 extractAgentLabel() 实现，需更新
  - `src/components/chat/chat-input.tsx` — 当前 disabled 硬编码
  - `src/app/layout.tsx` — 当前 metadata
  - `src/app/page.tsx` — 当前页面结构，需挂载 SceneIndicator
  - `src/components/chat/message-list.tsx` — 需挂载 ProgressIndicator
  - `src/components/chat/scene-indicator.tsx` — SceneIndicator 组件接口
  - `src/components/chat/progress-indicator.tsx` — ProgressIndicator 组件接口

  **WHY Each Reference Matters**:
  - `message-item.tsx`: extractAgentLabel() 是核心修改点，需从 tool-invocation parts 提取标签
  - `chat-input.tsx`: disabled 修复是 bug fix
  - `page.tsx`/`message-list.tsx`: 挂载点是组件插入位置
  - `scene-indicator.tsx`/`progress-indicator.tsx`: 了解组件 props 接口

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Agent 标签从 tool-invocation 提取
    Tool: Bash
    Preconditions: message-item.tsx 已更新
    Steps:
      1. 检查 extractAgentLabel 函数中包含 tool-invocation 处理逻辑
      2. 验证 call_actor → "Actor" 映射
    Expected Result: 函数能从 tool-invocation parts 提取 agent 标签
    Failure Indicators: 仍只处理 data-* parts
    Evidence: .sisyphus/evidence/task-10-agent-label.txt

  Scenario: Chat input 状态正确
    Tool: Bash
    Preconditions: chat-input.tsx 已修复
    Steps:
      1. 检查 disabled 变量引用 status 而非硬编码 false
    Expected Result: disabled 表达式包含 "submitted" 和 "streaming"
    Failure Indicators: 仍为 const disabled = false
    Evidence: .sisyphus/evidence/task-10-chat-input.txt

  Scenario: Layout metadata 正确
    Tool: Bash
    Preconditions: layout.tsx 已修复
    Steps:
      1. 检查 title 为 "自由剧场"
      2. 检查 description 为 "交互式叙事引擎"
    Expected Result: metadata 不再是 "Create Next App"
    Failure Indicators: 仍为默认值
    Evidence: .sisyphus/evidence/task-10-layout.txt

  Scenario: SceneIndicator 已挂载
    Tool: Playwright
    Preconditions: dev server 已启动
    Steps:
      1. 导航到 http://localhost:4477
      2. 检查 DOM 中存在 SceneIndicator 组件
    Expected Result: SceneIndicator 渲染在页面中
    Failure Indicators: 组件未挂载
    Evidence: .sisyphus/evidence/task-10-scene-indicator.png
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(ui): update agent labels for tool-invocation, fix chat input, mount indicators`
  - Files: `src/components/chat/message-item.tsx`, `src/components/chat/chat-input.tsx`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/chat/message-list.tsx`
  - Pre-commit: `bun run build`

- [x] 11. 删除 LangGraph 层

  **What to do**:
  - **仅在 Task 9 和 10 验证通过后执行**
  - 删除 `src/graph/` 整个目录：
    - `src/graph/narrative-graph.ts`
    - `src/graph/state.ts`
    - `src/graph/nodes/gm.ts`
    - `src/graph/nodes/actor.ts`
    - `src/graph/nodes/scribe.ts`
    - `src/graph/nodes/archivist.ts`
  - 删除 `src/store/agent-memory.ts`（死代码，零引用）
  - 从 `package.json` 移除未使用依赖：
    - `@langchain/langgraph`
    - `@langchain/openai`
    - `@ai-sdk/langchain`
  - 运行 `ast_grep_search` 或 `grep` 确认无残留 `@langchain` / `@ai-sdk/langchain` 引用
  - 运行 `bun install` 更新 lockfile
  - 运行 `bun run build` 确认零错误

  **Must NOT do**:
  - 不删除 src/context/ 任何文件
  - 不删除 src/store/story-files.ts
  - 不删除 src/prompts/actor.ts, scribe.ts, archivist.ts
  - 不在验证前删除（必须等 Task 9, 10 通过）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 删除文件和依赖是标准操作
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (must wait for 9, 10)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 9, 10

  **References**:

  **Pattern References**:
  - `src/graph/` — 整个目录是删除目标
  - `src/store/agent-memory.ts` — 死代码删除目标

  **WHY Each Reference Matters**:
  - 确认删除范围，避免误删

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: LangGraph 文件已删除
    Tool: Bash
    Preconditions: 删除操作已完成
    Steps:
      1. 运行 `ls src/graph/ 2>&1`
      2. 运行 `ls src/store/agent-memory.ts 2>&1`
    Expected Result: 两个路径均报错（文件不存在）
    Failure Indicators: 文件仍存在
    Evidence: .sisyphus/evidence/task-11-files-deleted.txt

  Scenario: 无 LangGraph 残留引用
    Tool: Bash
    Preconditions: 删除和依赖清理已完成
    Steps:
      1. 运行 `grep -r "@langchain\|@ai-sdk/langchain\|from.*langgraph\|from.*langchain" src/ --include="*.ts" --include="*.tsx"`
    Expected Result: 无匹配输出
    Failure Indicators: 任何残留引用
    Evidence: .sisyphus/evidence/task-11-no-remnants.txt

  Scenario: 构建成功
    Tool: Bash
    Preconditions: 所有删除和清理已完成
    Steps:
      1. 运行 `bun run build 2>&1`
    Expected Result: 构建成功，零错误
    Failure Indicators: 类型错误或构建失败
    Evidence: .sisyphus/evidence/task-11-build.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor: remove LangGraph orchestration layer and dead code`
  - Files: `src/graph/` (deleted), `src/store/agent-memory.ts` (deleted), `package.json`, `bun.lock`
  - Pre-commit: `bun run build`

- [x] 12. 测试更新

  **What to do**:
  - 重写 `tests/integration/e2e.test.ts`：
    - 删除所有 LangGraph 引用（createNarrativeGraph, MemorySaver, HumanMessage, graph.stream, collectNodeOutputs）
    - 新测试用例：
      - GM 能回复简单问候（无工具调用）
      - GM 能调用 call_actor（Actor 产出角色反应）
      - 完整流程：GM → Actor → Scribe → Archivist
      - .novel/ 文件被正确更新
    - 使用 `run(gmAgent, input, { context: { storyDir }, maxTurns: 25 })` 
    - Mock LLM 或使用真实 API key（取决于测试环境）
  - 更新 `tests/unit/prompts/gm.test.ts`：
    - 验证 GM prompt 包含 call_actor/call_scribe/call_archivist 工具描述
    - 验证 GM prompt 不包含 Command( / LangGraph / append_interaction / end_interaction
  - 确认 `tests/unit/context/` 和 `tests/unit/store/` 测试不需要修改（零框架依赖）
  - 运行 `bun test` 确认所有测试通过

  **Must NOT do**:
  - 不修改 tests/unit/context/ 任何测试
  - 不修改 tests/unit/store/ 任何测试
  - 不添加 TDD 测试（Tests After 策略）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E 测试重写需要理解新的 Agent 运行模式，可能需要 mock 策略设计
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (depends on 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 11

  **References**:

  **Pattern References**:
  - `tests/integration/e2e.test.ts` — 当前 E2E 测试，需完全重写
  - `tests/unit/prompts/gm.test.ts` — GM prompt 测试，需更新断言
  - `tests/unit/context/build-story-context.test.ts` — 不需修改的测试样例
  - `tests/unit/store/story-files.test.ts` — 不需修改的测试样例

  **API/Type References**:
  - `@openai/agents` `run()` — E2E 测试中使用的核心函数
  - `RunResult` — 非流式运行结果，包含 finalOutput, newItems 等

  **WHY Each Reference Matters**:
  - `e2e.test.ts`: 完全重写目标，了解当前测试结构
  - `gm.test.ts`: 需更新断言以匹配新 prompt 内容
  - 其他测试: 确认不需修改，验证通过即可

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 所有测试通过
    Tool: Bash
    Preconditions: 测试已更新
    Steps:
      1. 运行 `bun test 2>&1`
    Expected Result: 所有测试通过，0 failures
    Failure Indicators: 任何测试失败
    Evidence: .sisyphus/evidence/task-12-tests-pass.txt

  Scenario: E2E 测试无 LangGraph 引用
    Tool: Bash
    Preconditions: e2e.test.ts 已重写
    Steps:
      1. 运行 `grep -n "langgraph\|langchain\|HumanMessage\|MemorySaver\|graph\.stream" tests/integration/e2e.test.ts`
    Expected Result: 无匹配输出
    Failure Indicators: 任何 LangGraph 残留
    Evidence: .sisyphus/evidence/task-12-e2e-no-langgraph.txt

  Scenario: GM prompt 测试断言更新
    Tool: Bash
    Preconditions: gm.test.ts 已更新
    Steps:
      1. 运行 `grep -n "call_actor\|call_scribe\|call_archivist" tests/unit/prompts/gm.test.ts`
    Expected Result: 包含新的工具描述断言
    Failure Indicators: 仍测试旧的 LangGraph 语法
    Evidence: .sisyphus/evidence/task-12-gm-test.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `test: update tests for OpenAI Agents JS architecture`
  - Files: `tests/integration/e2e.test.ts`, `tests/unit/prompts/gm.test.ts`
  - Pre-commit: `bun test`

- [x] 13. 构建验证 + 清理

  **What to do**:
  - 运行完整构建验证：`bun run build` — 确认零错误
  - 运行完整测试：`bun test` — 确认全部通过
  - 运行 LangGraph 残留检查：`grep -r "@langchain\|@ai-sdk/langchain" src/` — 确认无残留
  - 清理未使用的导入（如有）
  - 更新 `README.md` 中的技术栈描述（如果仍引用 LangGraph）
  - 最终验证：启动 dev server，测试简单对话流程

  **Must NOT do**:
  - 不添加新功能
  - 不重构已完成的代码

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 纯验证和清理操作
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final task)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 12

  **References**:

  **Pattern References**:
  - `README.md` — 检查是否有 LangGraph 引用需更新

  **WHY Each Reference Matters**:
  - `README.md`: 可能仍引用 LangGraph，需更新为 OpenAI Agents JS

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 构建零错误
    Tool: Bash
    Steps:
      1. 运行 `bun run build 2>&1 | tail -10`
    Expected Result: 构建成功，无错误
    Evidence: .sisyphus/evidence/task-13-build.txt

  Scenario: 全部测试通过
    Tool: Bash
    Steps:
      1. 运行 `bun test 2>&1`
    Expected Result: 0 failures
    Evidence: .sisyphus/evidence/task-13-tests.txt

  Scenario: 无 LangGraph 残留
    Tool: Bash
    Steps:
      1. 运行 `grep -r "@langchain\|@ai-sdk/langchain\|langgraph" src/ --include="*.ts" --include="*.tsx" -l`
    Expected Result: 无输出
    Evidence: .sisyphus/evidence/task-13-no-remnants.txt

  Scenario: Dev server 端到端验证
    Tool: Playwright
    Preconditions: dev server 已启动
    Steps:
      1. 导航到 http://localhost:4477
      2. 确认页面标题为 "自由剧场"
      3. 在输入框输入 "你好" 并发送
      4. 等待响应（timeout: 30s）
      5. 确认响应消息非空
    Expected Result: 页面加载正常，GM 能回复简单问候
    Evidence: .sisyphus/evidence/task-13-e2e-smoke.png
  ```

  **Commit**: YES
  - Message: `chore: final build verification and cleanup`
  - Files: `README.md` (如果更新)
  - Pre-commit: `bun run build && bun test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no `@langchain` or `@ai-sdk/langchain` imports remain anywhere.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | LangGraph Remnants [CLEAN/N found] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: GM→Actor→Scribe→Archivist full pipeline. Test edge cases: simple greeting (no tools), missing .novel/ directory, invalid character name. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes. Verify src/context/ and src/store/story-files.ts are UNCHANGED.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `refactor(deps): swap LangGraph for OpenAI Agents JS + rewrite models.ts` - package.json, src/lib/models.ts
- **Wave 2**: `feat(agents): define GM/Actor/Scribe/Archivist agents with asTool registration` - src/agents/*, src/tools/*, src/session/*, src/prompts/gm.ts
- **Wave 3**: `refactor(api): rewrite narrative routes + fix frontend components + remove LangGraph` - src/app/api/*, src/components/*, src/app/layout.tsx, src/app/page.tsx, src/graph/ (deleted)
- **Wave 4**: `test: update tests for new agent architecture` - tests/*

---

## Success Criteria

### Verification Commands
```bash
bun run build  # Expected: exit 0, no errors
grep -r "@langchain\|@ai-sdk/langchain" src/  # Expected: no output
bun test  # Expected: all tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] No LangGraph imports remain
- [ ] GM can respond to simple greeting without tools
- [ ] GM can call Actor → Actor produces character reaction
- [ ] GM can call Scribe → Scribe produces literary text
- [ ] GM can call Archivist → Archivist updates .novel/ files
- [ ] Frontend shows agent labels from tool-invocation parts
- [ ] SceneIndicator and ProgressIndicator are mounted
