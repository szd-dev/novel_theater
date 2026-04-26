# 自由剧场 v2 — 项目建设方案

## TL;DR

> **Quick Summary**: 基于 ARCHITECTURE.md 将自由剧场从 OpenCode 插件体系迁移到独立架构（LangGraph.js + Vercel AI SDK + Next.js），实现 4-Agent 协作的交互式叙事引擎，Phase 1-3 全做。
> 
> **Deliverables**:
> - 完整的 Next.js + Bun 项目，可本地启动运行
> - LangGraph.js StateGraph 编排图（4 节点 + 条件边 + Command 路由）
> - Next.js 聊天 UI（useChat + 流式渲染 + 场景状态指示）
> - API 桥接层（AI SDK ↔ LangGraph 格式转换）
> - 上下文注入系统（buildStoryContext 重构版）
> - 4 个 Agent prompt 迁移为 TypeScript 模块
> - 故事管理 API（init/archive/reset）
> - MemorySaver checkpointing + 会话恢复
> - Store API per-agent 记忆
> - 自定义流式事件 + 前端渲染
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: T1(scaffold) → T5(state+graph) → T9(GM node) → T10(Actor node) → T14(integration) → T19(frontend) → F1-F4

---

## Context

### Original Request
用户要求阅读 ARCHITECTURE.md 文档，参考 ../novel 目录下的旧系统代码，给出项目建设方案。

### Interview Summary
**Key Discussions**:
- 实施范围：Phase 1-3 全做，Phase 4（并行 Actor、Agent 直连、上下文压缩、LangSmith）排除
- UI 库：shadcn/ui + Radix UI + Tailwind CSS
- LLM：仅 OpenAI（GPT-4o for GM/Actor/Scribe，GPT-4o-mini for Archivist）
- 持久化：开发期 MemorySaver，生产期可接 PostgreSQL
- 测试：Tests-after（先实现后测试）
- 代码迁移：理解旧代码后重构为更好的 TypeScript，不直接复制

**Research Findings**:
- 旧系统代码：plugins/novel-theater/index.ts（759 行），6 工具 + 2 hooks
- 旧 Agent 定义：gm.md（698 行）、actor.md（118 行）、scribe.md（110 行）、archivist.md（132 行）
- 可迁移函数：~290 行（buildStoryContext + 12 辅助函数）
- 可迁移模板：TEMPLATES 对象（6 个 .md 模板）
- ARCHITECTURE.md 已非常详尽，技术选型、分层设计、数据流、迁移策略均已明确

### Metis Review
**Identified Gaps** (addressed):
- **GM 节点执行模型未明确**：ARCHITECTURE.md 未说明 GM 路由决策是 LLM 驱动还是代码驱动。决策：采用**代码驱动路由**（LLM 解析意图并输出结构化数据 → 代码验证并构建 Command），避免 LLM 幻觉直接操控图路由
- **streamMode 多模式处理**：['values', 'messages', 'custom'] 三种模式的事件合并需要明确的处理策略
- **Actor 自循环的安全边界**：需设置 recursionLimit + maxActorTurns 双重保护
- **Archivist 结构化输出的验证**：文件写入前需校验格式合规性
- **错误处理链路**：节点内 LLM 调用失败 → graph 错误传播 → API 层 → 前端展示

---

## Work Objectives

### Core Objective
构建一个完整的、可运行的交互式叙事引擎，4 个 Agent（GM/Actor/Scribe/Archivist）通过 LangGraph.js StateGraph 协作，用户通过 Next.js Web UI 交互，系统产出文学性小说文本。

### Concrete Deliverables
- 可 `bun dev` 启动的完整项目
- `POST /api/narrative` — 主叙事 API，端到端流式输出
- `POST /api/story` — 故事管理 API（init/archive/reset）
- `GET /api/narrative/status` — 会话状态查询 API
- `src/graph/narrative-graph.ts` — 编排图定义
- `src/graph/nodes/gm.ts` — GM 节点（代码驱动路由）
- `src/graph/nodes/actor.ts` — Actor 节点（角色附体 + 自循环）
- `src/graph/nodes/scribe.ts` — Scribe 节点（文学化叙述）
- `src/graph/nodes/archivist.ts` — Archivist 节点（状态更新）
- `src/context/` — 上下文注入系统（重构版）
- `src/prompts/` — 4 个 Agent prompt（TypeScript）
- `src/app/page.tsx` — 聊天 UI 页面
- `.novel/` — 与旧系统完全兼容的故事数据目录

### Definition of Done
- [ ] `bun dev` 启动无报错
- [ ] 用户输入指令 → GM 解析 → Actor 角色附体 → Scribe 文学化 → Archivist 状态更新 → 前端流式显示
- [ ] 故事管理操作（init/archive/reset）可正常执行
- [ ] 会话关闭后可恢复（MemorySaver checkpointing）
- [ ] .novel/ 目录格式与旧系统兼容

### Must Have
- LangGraph.js StateGraph + Command 路由
- 4 个 Agent 节点完整实现
- 端到端流式输出
- buildStoryContext 上下文注入
- .novel/ 文件系统读写
- MemorySaver checkpointing
- 会话恢复
- 场景状态指示器
- 自定义流式事件（Agent 标签、角色标签、进度）

### Must NOT Have (Guardrails)
- ❌ Phase 4 功能：并行 Actor 调用、Agent 间直接通信、上下文压缩、LangSmith tracing
- ❌ PostgreSQL 集成（开发期使用 MemorySaver）
- ❌ 非 OpenAI LLM Provider
- ❌ 修改 ../novel/ 旧系统代码
- ❌ 在 AI 回复中使用"场景""分镜""镜头"等非小说语言
- ❌ GM 直接操作 .novel/ 状态文件（场景骨架除外）
- ❌ AI slop：过度抽象、过度注释、泛型命名（data/result/item/temp）
- ❌ 用户认证系统（Phase 1-3 不需要）

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (new project)
- **Automated tests**: Tests-after
- **Framework**: bun:test
- **Test setup**: Included as separate task after core implementation

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) - Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) - Send requests, assert status + response fields
- **Library/Module**: Use Bash (bun test) - Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 7 tasks, MAX PARALLEL):
├── T1: Project scaffolding + config [quick]
├── T2: shadcn/ui setup + base components [quick]
├── T3: NarrativeState type + Annotation [quick]
├── T4: .novel/ templates + story-files I/O [quick]
├── T5: Context injection (buildStoryContext refactor) [deep]
├── T6: LLM model config (OpenAI only) [quick]
└── T7: Agent prompt migration [unspecified-high]

Wave 2 (Core Graph - 6 tasks, after Wave 1):
├── T8: StateGraph definition + edges + compilation [deep]
├── T9: GM node (code-driven routing) [deep]
├── T10: Actor node (role-play + self-loop) [deep]
├── T11: Scribe node (literary narration) [unspecified-high]
├── T12: Archivist node (state update) [unspecified-high]
└── T13: Store API per-agent memory [unspecified-high]

Wave 3 (Integration + Frontend - 6 tasks, after Wave 2):
├── T14: API route /api/narrative (bridge layer) [deep]
├── T15: API route /api/story (story management) [quick]
├── T16: API route /api/narrative/status (session status) [quick]
├── T17: Chat UI page (useChat + streaming) [visual-engineering]
├── T18: Custom data parts rendering (agent labels, progress) [visual-engineering]
└── T19: Scene status indicator component [visual-engineering]

Wave 4 (QA + Hardening - 4 tasks, after Wave 3):
├── T20: End-to-end integration test [deep]
├── T21: Error handling + retry logic [unspecified-high]
├── T22: Tests-after (bun:test coverage) [unspecified-high]
└── T23: Final polish + README [writing]

Wave FINAL (Verification - 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T3 → T8 → T9 → T14 → T17 → T20 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 7 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | - | T2-T7, T8-T23 | 1 |
| T2 | T1 | T17-T19 | 1 |
| T3 | T1 | T8-T13 | 1 |
| T4 | T1 | T12, T15 | 1 |
| T5 | T1 | T9-T12 | 1 |
| T6 | T1 | T9-T12 | 1 |
| T7 | T1 | T9-T12 | 1 |
| T8 | T3, T5 | T9-T13, T14 | 2 |
| T9 | T5, T6, T7, T8 | T10, T14 | 2 |
| T10 | T5, T6, T7, T8 | T14 | 2 |
| T11 | T5, T6, T7, T8 | T14 | 2 |
| T12 | T4, T5, T6, T7, T8 | T14 | 2 |
| T13 | T8 | T21 | 2 |
| T14 | T8, T9, T10, T11, T12 | T20, T21 | 3 |
| T15 | T4 | T20 | 3 |
| T16 | T8 | T17 | 3 |
| T17 | T2, T14, T16 | T20 | 3 |
| T18 | T2, T14 | T20 | 3 |
| T19 | T2, T14 | T20 | 3 |
| T20 | T14, T15, T17, T18, T19 | T22 | 4 |
| T21 | T14, T13 | T22 | 4 |
| T22 | T20, T21 | F1-F4 | 4 |
| T23 | T20 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 7 tasks — T1-T4,T6 → `quick`, T5 → `deep`, T7 → `unspecified-high`
- **Wave 2**: 6 tasks — T8-T10 → `deep`, T11-T13 → `unspecified-high`
- **Wave 3**: 6 tasks — T14 → `deep`, T15-T16 → `quick`, T17-T19 → `visual-engineering`
- **Wave 4**: 4 tasks — T20 → `deep`, T21-T22 → `unspecified-high`, T23 → `writing`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Project Scaffolding + Configuration

  **What to do**:
  - Initialize Next.js project with Bun (`bunx create-next-app@latest . --ts --tailwind --eslint --app --src-dir`)
  - Install core dependencies: `@langchain/langgraph`, `@langchain/openai`, `ai`, `@ai-sdk/langchain`, `@ai-sdk/react`, `zod`
  - Install dev dependencies: `@types/*`, `bun:test` types
  - Create `next.config.ts` with Bun runtime configuration
  - Create `.env.local` template with `OPENAI_API_KEY`
  - Add `.novel/` to `.gitignore`
  - Verify `bun dev` starts successfully

  **Must NOT do**:
  - Do not install `@langchain/anthropic` (OpenAI only)
  - Do not install `@langchain/langgraph-checkpoint-postgres` (MemorySaver only for dev)
  - Do not set up CI/CD pipelines

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard project scaffolding, well-established patterns
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser testing needed for scaffolding

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation task)
  - **Parallel Group**: Wave 1 (first to complete)
  - **Blocks**: T2-T23 (everything)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `/data/novel/plugins/novel-theater/package.json` — Old project dependencies for reference (what LangChain packages are used)
  - `/data/novel/opencode.json` — Plugin registration pattern (understand what's being replaced)

  **API/Type References**:
  - `ARCHITECTURE.md:22-33` — Technology selection table (exact package names to install)
  - `ARCHITECTURE.md:384-437` — Project structure (target directory layout)

  **External References**:
  - Next.js App Router docs: https://nextjs.org/docs/app
  - LangGraph.js installation: https://langchain-ai.github.io/langgraphjs/

  **WHY Each Reference Matters**:
  - Old package.json shows which LangChain packages are already validated
  - ARCHITECTURE.md tech table specifies exact package names to install
  - Project structure defines target directory layout for scaffolding

  **Acceptance Criteria**:

  - [ ] `bun dev` starts Next.js dev server on port 3000 without errors
  - [ ] `package.json` contains: `@langchain/langgraph`, `@langchain/openai`, `ai`, `@ai-sdk/langchain`, `@ai-sdk/react`, `zod`
  - [ ] `.env.local` template exists with `OPENAI_API_KEY=`
  - [ ] `.gitignore` contains `.novel/`
  - [ ] `src/` directory exists with `app/` subdirectory

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Dev server starts successfully
    Tool: Bash
    Preconditions: Project directory is clean
    Steps:
      1. Run `bun dev` in project root
      2. Wait for "Ready in" output (timeout: 30s)
      3. Send Ctrl+C to stop server
    Expected Result: Server starts without error, outputs local URL
    Failure Indicators: "Error" in output, exit code non-zero
    Evidence: .sisyphus/evidence/task-1-dev-server-start.txt

  Scenario: Dependencies resolve correctly
    Tool: Bash
    Preconditions: package.json exists
    Steps:
      1. Run `bun install`
      2. Run `bun --version`
      3. Run `node -e "require('@langchain/langgraph")"` to verify import
    Expected Result: All installs succeed, LangGraph imports without error
    Failure Indicators: "ERR_MODULE_NOT_FOUND", "Cannot find package"
    Evidence: .sisyphus/evidence/task-1-deps-install.txt
  ```

  **Commit**: YES
  - Message: `feat(init): scaffold Next.js + Bun project with dependencies`
  - Files: `package.json, tsconfig.json, next.config.ts, .env.local, .gitignore`
  - Pre-commit: `bun install`

- [x] 2. shadcn/ui Setup + Base Chat Components

  **What to do**:
  - Initialize shadcn/ui (`bunx shadcn@latest init`)
  - Install chat-related components: button, input, card, scroll-area, separator, avatar, badge
  - Create `src/components/ui/` directory structure
  - Create base chat layout component (message list + input area)
  - Configure Tailwind CSS theme (dark mode optional)
  - Verify components render in a test page

  **Must NOT do**:
  - Do not implement full chat logic (useChat comes later in T17)
  - Do not create story-specific components (scene indicator comes in T19)
  - Do not over-design — keep components minimal and composable

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard UI library setup, shadcn/ui has well-documented init
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for proper component composition and Tailwind theming

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T1)
  - **Parallel Group**: Wave 1 (with T3-T7)
  - **Blocks**: T17, T18, T19
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `ARCHITECTURE.md:112-135` — Frontend layer description (chat UI, streaming, scene indicators)

  **External References**:
  - shadcn/ui installation: https://ui.shadcn.com/docs/installation/next
  - Vercel AI SDK useChat: https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat

  **WHY Each Reference Matters**:
  - ARCHITECTURE.md frontend section defines what UI elements are needed
  - shadcn/ui docs for correct installation with Next.js + Bun

  **Acceptance Criteria**:

  - [ ] `src/components/ui/` exists with at least: button, input, card, scroll-area, separator, badge
  - [ ] `bun dev` still starts without errors after shadcn init
  - [ ] Base chat layout component renders in browser

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: shadcn/ui components render
    Tool: Playwright
    Preconditions: bun dev is running
    Steps:
      1. Navigate to http://localhost:3000
      2. Check that page loads without console errors
      3. Verify button component exists in DOM
    Expected Result: Page loads, no errors, UI components present
    Failure Indicators: 404, console errors, missing components
    Evidence: .sisyphus/evidence/task-2-shadcn-render.png

  Scenario: Build succeeds with new components
    Tool: Bash
    Preconditions: Components created
    Steps:
      1. Run `bun run build`
    Expected Result: Build completes successfully
    Failure Indicators: TypeScript errors, missing imports
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: `feat(ui): setup shadcn/ui + base chat components`
  - Files: `src/components/, components.json, tailwind.config.ts`

- [x] 3. NarrativeState Type + Annotation

  **What to do**:
  - Create `src/graph/state.ts` with NarrativeState type definition
  - Define `Annotation` with all fields from ARCHITECTURE.md section 4.3.1
  - Define `InteractionEntry` type (character, content, timestamp)
  - Implement reducers: messages (concat), interactionLog (concat), others (last-writer-wins)
  - Export type and Annotation for use by node functions
  - Add JSDoc comments for each field explaining its purpose

  **Must NOT do**:
  - Do not add fields beyond what ARCHITECTURE.md specifies
  - Do not implement node functions (separate tasks)
  - Do not couple state to any specific LLM provider

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions, well-specified in ARCHITECTURE.md
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T1)
  - **Parallel Group**: Wave 1 (with T2, T4-T7)
  - **Blocks**: T8-T13 (all graph tasks)
  - **Blocked By**: T1

  **References**:

  **API/Type References**:
  - `ARCHITECTURE.md:169-197` — NarrativeState definition with all fields, types, and reducer specs
  - `ARCHITECTURE.md:557-574` — InteractionEntry type and reducer pattern (concat)

  **External References**:
  - LangGraph.js Annotation API: https://langchain-ai.github.io/langgraphjs/reference/interfaces/Annotation.html

  **WHY Each Reference Matters**:
  - ARCHITECTURE.md state definition is the single source of truth for field names, types, and reducer behaviors
  - LangGraph Annotation docs for correct API usage

  **Acceptance Criteria**:

  - [ ] `src/graph/state.ts` exports `NarrativeState` type and `NarrativeStateAnnotation`
  - [ ] All fields from ARCHITECTURE.md 4.3.1 are present with correct types
  - [ ] `messages` uses concat reducer
  - [ ] `interactionLog` uses concat reducer
  - [ ] TypeScript compiles without errors: `bunx tsc --noEmit`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Type definition compiles
    Tool: Bash
    Preconditions: state.ts created
    Steps:
      1. Run `bunx tsc --noEmit src/graph/state.ts`
    Expected Result: No type errors
    Failure Indicators: TypeScript compilation errors
    Evidence: .sisyphus/evidence/task-3-type-check.txt

  Scenario: Annotation can be imported
    Tool: Bash
    Preconditions: state.ts created
    Steps:
      1. Run `bun -e "import { NarrativeStateAnnotation } from './src/graph/state'; console.log(Object.keys(NarrativeStateAnnotation.spec || {}))"`
    Expected Result: Import succeeds, prints field names
    Failure Indicators: Import error, undefined
    Evidence: .sisyphus/evidence/task-3-import.txt
  ```

  **Commit**: YES
  - Message: `feat(graph): define NarrativeState type + Annotation`
  - Files: `src/graph/state.ts`

- [x] 4. .novel/ Templates + Story-Files I/O

  **What to do**:
  - Create `src/lib/templates.ts` with TEMPLATES object (migrate from old index.ts lines 492-499)
  - Create `src/store/story-files.ts` with file I/O functions:
    - `initStory(dir)` — create .novel/ directory + templates + subdirs
    - `archiveStory(dir, name)` — copy .novel/ to .archive/{name}/
    - `resetStory(dir)` — backup + clear + rebuild templates
    - `readNovelFile(dir, relativePath)` — safe read from .novel/
    - `writeNovelFile(dir, relativePath, content)` — write to .novel/
    - `globNovelFiles(dir, pattern)` — glob within .novel/
  - Use `Bun.file()` / `Bun.write()` for I/O (not `fs/promises`)
  - Use `node:fs` sync methods only for setup/teardown (mkdirSync, existsSync, cpSync, rmSync)
  - Add proper TypeScript types for all functions

  **Must NOT do**:
  - Do not use `fs/promises` for file I/O
  - Do not change Markdown heading levels in templates (parser depends on them)
  - Do not add `canon.md` (deliberately removed in old system)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Direct migration with type improvements, logic is proven
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T1)
  - **Parallel Group**: Wave 1 (with T2, T3, T5-T7)
  - **Blocks**: T12, T15
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `/data/novel/plugins/novel-theater/index.ts:492-501` — TEMPLATES object and SUBDIRS constant (exact template content to migrate)
  - `/data/novel/plugins/novel-theater/index.ts:508-657` — init_story, archive_story, reset_story tool implementations (logic to refactor)
  - `/data/novel/plugins/novel-theater/index.ts:25-30` — readNovelFile function (safe file reading pattern)

  **WHY Each Reference Matters**:
  - Old TEMPLATES object contains exact Markdown content for .novel/ files
  - Tool implementations show the exact logic for init/archive/reset with edge cases (idempotent init, name validation, backup before reset)
  - readNovelFile shows the safe reading pattern (exists check + text())

  **Acceptance Criteria**:

  - [ ] `src/lib/templates.ts` exports TEMPLATES with keys: world.md, style.md, timeline.md, plot.md, debts.md, chapters.md
  - [ ] `src/store/story-files.ts` exports: initStory, archiveStory, resetStory, readNovelFile, writeNovelFile, globNovelFiles
  - [ ] `initStory()` creates .novel/ with all template files + characters/ + scenes/ subdirs
  - [ ] `archiveStory()` copies .novel/ to .archive/{name}/ with validation
  - [ ] `resetStory()` backs up before clearing, then rebuilds templates
  - [ ] TypeScript compiles without errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: initStory creates correct directory structure
    Tool: Bash
    Preconditions: Clean temp directory
    Steps:
      1. Run `bun -e "import {initStory} from './src/store/story-files'; initStory('/tmp/test-novel')"`
      2. Check `/tmp/test-novel/.novel/world.md` exists
      3. Check `/tmp/test-novel/.novel/characters/` directory exists
      4. Check `/tmp/test-novel/.novel/scenes/` directory exists
    Expected Result: All files and directories created
    Failure Indicators: Missing files, wrong content
    Evidence: .sisyphus/evidence/task-4-init-story.txt

  Scenario: archiveStory validates name and prevents overwrite
    Tool: Bash
    Preconditions: .novel/ directory exists
    Steps:
      1. Run archiveStory with name containing "/" — should fail
      2. Run archiveStory twice with same name — second should fail
    Expected Result: Invalid names rejected, duplicate names rejected
    Failure Indicators: Overwrite happens, no validation
    Evidence: .sisyphus/evidence/task-4-archive-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(store): add .novel/ templates + story-files I/O`
  - Files: `src/store/story-files.ts, src/lib/templates.ts`

- [x] 5. Context Injection (buildStoryContext Refactor)

  **What to do**:
  - Create `src/context/` directory with refactored TypeScript modules:
    - `token-estimator.ts` — `estimateTokens(text: string): number` (Chinese ~3 chars/token)
    - `extract.ts` — `extractL0`, `extractL1`, `extractSectionLines`, `extractSceneSummary`, `extractCharactersInScene`, `extractLocationFromWorld`, `extractSceneLocation`
    - `character-resolver.ts` — `findCharacterByName`, `listAllCharacters` (3-level fuzzy matching)
    - `build-story-context.ts` — Main `buildStoryContext(dir: string): Promise<string | null>` function
  - Refactor with proper TypeScript types (no `any`), named return types, JSDoc
  - Add `ContextSection` type for priority-based sections
  - Keep the same priority logic: L0 chars > scene > location > other chars > plot > L1 details
  - Keep the same token budget (2000 tokens)
  - Add `ContextConfig` type for configurable budget and section priorities

  **Must NOT do**:
  - Do not change the priority ordering or token budget logic
  - Do not change Markdown heading level parsing (##, ###)
  - Do not add new extraction functions beyond what old system has
  - Do not break .novel/ file format compatibility

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core logic refactoring requiring deep understanding of old code, priority system, and token budget mechanics
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T1)
  - **Parallel Group**: Wave 1 (with T2-T4, T6-T7)
  - **Blocks**: T9, T10, T11, T12
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `/data/novel/plugins/novel-theater/index.ts:17-19` — estimateTokens (3 lines, simple)
  - `/data/novel/plugins/novel-theater/index.ts:25-30` — readNovelFile (safe read pattern)
  - `/data/novel/plugins/novel-theater/index.ts:36-42` — extractL0 (L0 extraction from `> ` prefix)
  - `/data/novel/plugins/novel-theater/index.ts:109-140` — extractL1 (section-based summary with token budget)
  - `/data/novel/plugins/novel-theater/index.ts:49-78` — findCharacterByName (3-level fuzzy matching)
  - `/data/novel/plugins/novel-theater/index.ts:84-102` — listAllCharacters
  - `/data/novel/plugins/novel-theater/index.ts:147-166` — findLatestScene
  - `/data/novel/plugins/novel-theater/index.ts:172-200` — extractCharactersInScene
  - `/data/novel/plugins/novel-theater/index.ts:206-230` — extractSectionLines
  - `/data/novel/plugins/novel-theater/index.ts:236-250` — extractSceneSummary
  - `/data/novel/plugins/novel-theater/index.ts:252-295` — extractLocationFromWorld, extractSceneLocation
  - `/data/novel/plugins/novel-theater/index.ts:302-490` — buildStoryContext (main function, priority assembly + token budget)

  **API/Type References**:
  - `ARCHITECTURE.md:289-326` — Context injection layer migration checklist (all 13 functions listed with line counts)
  - `ARCHITECTURE.md:533-550` — Context injection data flow (priority ordering + token budget truncation)

  **WHY Each Reference Matters**:
  - Every function in the old index.ts is mapped to a new file location
  - The buildStoryContext function is the most critical — it assembles context with priority ordering and token budget truncation
  - extractL1 and findCharacterByName are the most complex helpers — need careful refactoring

  **Acceptance Criteria**:

  - [ ] `src/context/build-story-context.ts` exports `buildStoryContext(dir: string, config?: ContextConfig): Promise<string | null>`
  - [ ] All 13 functions from old system are present in new modules
  - [ ] Priority ordering preserved: L0 chars (0) > scene (1) > location (1) > other chars (2) > plot (2) > L1 (4)
  - [ ] Token budget default: 2000 tokens
  - [ ] No `any` types in any context module
  - [ ] TypeScript compiles without errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: buildStoryContext produces correct output with sample .novel/ data
    Tool: Bash
    Preconditions: .novel/ directory with sample world.md, characters/, scenes/
    Steps:
      1. Create test .novel/ with world.md, one character, one scene
      2. Run buildStoryContext on the test directory
      3. Verify output contains "## 在场角色", "## 当前场景" sections
      4. Verify total tokens <= 2000
    Expected Result: Structured context string with prioritized sections within budget
    Failure Indicators: Missing sections, token overflow, null return
    Evidence: .sisyphus/evidence/task-5-context-output.txt

  Scenario: buildStoryContext returns null for missing .novel/
    Tool: Bash
    Preconditions: No .novel/ directory
    Steps:
      1. Run buildStoryContext on directory without .novel/
    Expected Result: Returns null
    Failure Indicators: Throws error, returns empty string
    Evidence: .sisyphus/evidence/task-5-missing-novel.txt
  ```

  **Commit**: YES
  - Message: `feat(context): implement buildStoryContext with TypeScript refactor`
  - Files: `src/context/*.ts`

- [x] 6. LLM Model Configuration (OpenAI Only)

  **What to do**:
  - Create `src/lib/models.ts` with model configuration
  - Define `ModelConfig` type: `{ provider: "openai"; model: string; temperature?: number }`
  - Define agent-to-model mapping:
    - GM: `gpt-4o` (strong reasoning for routing)
    - Actor: `gpt-4o` (character consistency + emotion)
    - Scribe: `gpt-4o` (literary quality)
    - Archivist: `gpt-4o-mini` (structured extraction, low cost)
  - Create `getModel(agent: AgentRole)` function
  - Create `createModelInstance(config: ModelConfig)` using `@langchain/openai` ChatOpenAI
  - Support `OPENAI_API_KEY` from environment

  **Must NOT do**:
  - Do not add Anthropic or other providers
  - Do not hardcode API keys
  - Do not add model switching UI (runtime only via env)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple configuration module, well-defined in ARCHITECTURE.md
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T1)
  - **Parallel Group**: Wave 1 (with T2-T5, T7)
  - **Blocks**: T9, T10, T11, T12
  - **Blocked By**: T1

  **References**:

  **API/Type References**:
  - `ARCHITECTURE.md:686-694` — LLM model selection strategy table (agent → model → rationale)

  **External References**:
  - @langchain/openai ChatOpenAI: https://js.langchain.com/docs/integrations/chat/openai

  **WHY Each Reference Matters**:
  - ARCHITECTURE.md specifies exact model choices per agent with rationale

  **Acceptance Criteria**:

  - [ ] `src/lib/models.ts` exports `getModel`, `createModelInstance`, `ModelConfig`, `AgentRole`
  - [ ] `getModel("gm")` returns GPT-4o config
  - [ ] `getModel("archivist")` returns GPT-4o-mini config
  - [ ] `createModelInstance` creates ChatOpenAI instance with API key from env

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Model config returns correct models per agent
    Tool: Bash
    Preconditions: models.ts created
    Steps:
      1. Import getModel and call with each agent role
      2. Verify GM → gpt-4o, Actor → gpt-4o, Scribe → gpt-4o, Archivist → gpt-4o-mini
    Expected Result: Correct model names for each agent
    Failure Indicators: Wrong model, undefined
    Evidence: .sisyphus/evidence/task-6-model-config.txt
  ```

  **Commit**: YES
  - Message: `feat(lib): add OpenAI model configuration`
  - Files: `src/lib/models.ts`

- [x] 7. Agent Prompt Migration

  **What to do**:
  - Create `src/prompts/` directory with 4 TypeScript modules:
    - `gm.ts` — GM system prompt (from gm.md, strip OpenCode tool syntax)
    - `actor.ts` — Actor system prompt (from actor.md)
    - `scribe.ts` — Scribe system prompt (from scribe.md)
    - `archivist.ts` — Archivist system prompt (from archivist.md)
  - **Key simplification for GM prompt**:
    - Remove all `task(subagent_type=...)` call syntax descriptions
    - Remove `task_id` session reuse instructions
    - Remove `append_interaction` / `end_interaction` tool descriptions
    - Remove OpenCode-specific constraints (e.g., "禁止 @mention")
    - Keep: role definition, core responsibilities, intent types, scene lifecycle, narrative summary format, character dedup rules, constraints
  - Export functions: `getGMPrompt(state)`, `getActorPrompt(character, state)`, `getScribePrompt(state)`, `getArchivistPrompt(state)`
  - Each function returns a structured system prompt string, assembled with current state context
  - Add `PromptConfig` type for prompt customization

  **Must NOT do**:
  - Do not include OpenCode tool call syntax (`task()`, `task_id`, `@mention`)
  - Do not include `append_interaction` / `end_interaction` tool references
  - Do not add new prompt instructions beyond what old system defines
  - Do not hardcode story content in prompts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding the old GM prompt's 698 lines deeply, distinguishing what's OpenCode-specific from what's core narrative logic. Significant effort.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T1)
  - **Parallel Group**: Wave 1 (with T2-T6)
  - **Blocks**: T9, T10, T11, T12
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `/data/novel/.opencode/agents/gm.md` — Full 698-line GM prompt (sections to keep: 1-3, 6-13; sections to strip: 4-5 OpenCode task() syntax)
  - `/data/novel/.opencode/agents/actor.md` — 118-line Actor prompt (mostly keep as-is, strip session reuse references)
  - `/data/novel/.opencode/agents/scribe.md` — 110-line Scribe prompt (mostly keep, strip hook references)
  - `/data/novel/.opencode/agents/archivist.md` — 132-line Archivist prompt (mostly keep as-is)

  **API/Type References**:
  - `ARCHITECTURE.md:366-378` — Agent prompt migration checklist (what to keep vs strip per agent)
  - `ARCHITECTURE.md:4.3.2` — Node definitions showing how each agent's prompt is used in context

  **WHY Each Reference Matters**:
  - GM prompt is the largest and most complex — sections 4-5 are entirely OpenCode-specific and must be stripped
  - Actor/Scribe/Archivist prompts are simpler but reference OpenCode hooks that need removal
  - ARCHITECTURE.md migration checklist specifies exact changes per agent

  **Acceptance Criteria**:

  - [ ] `src/prompts/gm.ts` exports `getGMPrompt()` — no references to `task()`, `task_id`, `append_interaction`, `end_interaction`
  - [ ] `src/prompts/actor.ts` exports `getActorPrompt(character, state)` — no session reuse references
  - [ ] `src/prompts/scribe.ts` exports `getScribePrompt(state)` — no hook references
  - [ ] `src/prompts/archivist.ts` exports `getArchivistPrompt(state)` — clean state update logic
  - [ ] All prompt functions return string, not template literals with side effects
  - [ ] TypeScript compiles without errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: GM prompt has no OpenCode references
    Tool: Bash
    Preconditions: gm.ts created
    Steps:
      1. Grep for "task(" in src/prompts/gm.ts — should find 0 matches
      2. Grep for "task_id" in src/prompts/gm.ts — should find 0 matches
      3. Grep for "append_interaction" in src/prompts/gm.ts — should find 0 matches
    Expected Result: No OpenCode-specific syntax in GM prompt
    Failure Indicators: Found references to old system
    Evidence: .sisyphus/evidence/task-7-gm-prompt-clean.txt

  Scenario: Actor prompt generates correctly for a character
    Tool: Bash
    Preconditions: actor.ts created
    Steps:
      1. Call getActorPrompt("塞莉娅", mockState)
      2. Verify output contains character name
      3. Verify output does not contain "task_id" or "session"
    Expected Result: Character-specific prompt without old system references
    Failure Indicators: Missing character name, old references present
    Evidence: .sisyphus/evidence/task-7-actor-prompt.txt
  ```

  **Commit**: YES
  - Message: `feat(prompts): migrate agent prompts to TypeScript`
  - Files: `src/prompts/*.ts`

- [x] 8. StateGraph Definition + Edges + Compilation

  **What to do**:
  - Create `src/graph/narrative-graph.ts`
  - Define StateGraph with NarrativeStateAnnotation
  - Add 4 nodes: "gm", "actor", "scribe", "archivist" (placeholder functions for now, implemented in T9-T12)
  - Define conditional edges:
    - `gm` → `Command.goto` determines: "actor" / "scribe" / "archivist" / `END`
    - `actor` → `Command.goto` determines: "actor" (self-loop) / "scribe"
    - `scribe` → fixed edge: "archivist"
    - `archivist` → fixed edge: "gm"
  - Add `START → gm` entry edge
  - Compile graph with `MemorySaver` checkpointer
  - Create `createNarrativeGraph(checkpointer?)` factory function
  - Export compiled graph for use by API route

  **Must NOT do**:
  - Do not implement node function logic (separate tasks T9-T12)
  - Do not use `PostgresSaver` (MemorySaver for dev)
  - Do not set `recursionLimit` below 25 (need room for Actor self-loops)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: LangGraph StateGraph API has specific patterns for Command-based routing and conditional edges. Requires careful understanding.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T3 + T5)
  - **Parallel Group**: Wave 2 (first task)
  - **Blocks**: T9-T16
  - **Blocked By**: T3, T5

  **References**:

  **API/Type References**:
  - `ARCHITECTURE.md:269-287` — Graph structure and edge definitions
  - `ARCHITECTURE.md:169-197` — NarrativeState fields used by Command routing

  **External References**:
  - LangGraph.js StateGraph: https://langchain-ai.github.io/langgraphjs/reference/classes/StateGraph.html
  - LangGraph.js Command: https://langchain-ai.github.io/langgraphjs/reference/classes/Command.html

  **WHY Each Reference Matters**:
  - Graph structure defines exact node names and edge patterns
  - Command routing depends on `nextAgent` field in state — need to understand how Command.goto interacts with conditional edges

  **Acceptance Criteria**:

  - [ ] `src/graph/narrative-graph.ts` exports `createNarrativeGraph()` returning compiled `CompiledStateGraph`
  - [ ] Graph has 4 nodes: "gm", "actor", "scribe", "archivist"
  - [ ] START → gm → (conditional) → actor/scribe/archivist/END
  - [ ] actor → (conditional) → actor/scribe
  - [ ] scribe → archivist (fixed)
  - [ ] archivist → gm (fixed)
  - [ ] MemorySaver configured as checkpointer

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Graph compiles without errors
    Tool: Bash
    Preconditions: narrative-graph.ts created
    Steps:
      1. Import createNarrativeGraph and call it
      2. Verify it returns a compiled graph object
    Expected Result: Compiled graph with 4 nodes
    Failure Indicators: Compilation error, missing nodes
    Evidence: .sisyphus/evidence/task-8-graph-compile.txt

  Scenario: Graph has correct edge structure
    Tool: Bash
    Preconditions: Graph compiled
    Steps:
      1. Inspect graph.nodes and graph.edges
      2. Verify gm has conditional edges to actor/scribe/archivist/END
      3. Verify actor has conditional edges to actor/scribe
    Expected Result: Edge structure matches ARCHITECTURE.md specification
    Failure Indicators: Missing edges, wrong routing
    Evidence: .sisyphus/evidence/task-8-graph-edges.txt
  ```

  **Commit**: YES
  - Message: `feat(graph): implement StateGraph definition + edges`
  - Files: `src/graph/narrative-graph.ts`

- [x] 9. GM Node (Code-Driven Routing)

  **What to do**:
  - Create `src/graph/nodes/gm.ts`
  - Implement GM node function with **code-driven routing**:
    1. Call LLM (GPT-4o) with GM prompt + user message → LLM outputs structured intent (Zod schema)
    2. **Code validates** the intent and constructs `Command` object
    3. Set `nextAgent`, `activeCharacter`, `maxActorTurns`, `isNewScene` based on intent
  - Define `UserIntent` Zod schema:
    - `type`: "new_scene" | "character_action" | "dialogue" | "external_event" | "time_jump" | "flashback" | "recall" | "world_setting" | "chapter" | "archive" | "reset"
    - `characters`: string[] (mentioned character names)
    - `isNewScene`: boolean
    - `location`: string (optional)
    - `time`: string (optional)
    - `routing`: "actor" | "scribe" | "archivist" | "end"
    - `maxActorTurns`: number (default 3)
    - `activeCharacter`: string (first character to speak)
  - For special intents (time_jump, world_setting, chapter, archive, reset) → route directly to archivist or end
  - For recall → search scenes and return recall content, then end
  - Use `streamText()` for streaming, `generateText()` for structured output
  - Call `buildStoryContext()` + world.md + all character L0s for context

  **Must NOT do**:
  - Do not let LLM directly output `Command` objects (code validates and constructs)
  - Do not directly edit .novel/ state files (GM writes scene skeletons only, via Archivist)
  - Do not call `archive_story` / `reset_story` autonomously (user-only)
  - Do not use `task()` or `@mention` syntax

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex node — LLM structured output + code-driven routing + Zod validation + multiple intent paths. Core of the system.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T5, T6, T7, T8)
  - **Parallel Group**: Wave 2 (sequential after T8)
  - **Blocks**: T14
  - **Blocked By**: T5, T6, T7, T8

  **References**:

  **Pattern References**:
  - `/data/novel/.opencode/agents/gm.md:37-106` — GM core responsibilities and 4-phase flow (adapt to LangGraph Command pattern)
  - `/data/novel/.opencode/agents/gm.md:214-228` — Dynamic routing examples (how GM decides routing based on user intent)

  **API/Type References**:
  - `ARCHITECTURE.md:202-227` — GM node definition (input/output, routing logic, Command examples)
  - `ARCHITECTURE.md:378-404` — Narrative summary format (what GM constructs for Archivist)
  - `src/graph/state.ts` — NarrativeState fields (nextAgent, activeCharacter, maxActorTurns, etc.)

  **External References**:
  - LangGraph.js Command: https://langchain-ai.github.io/langgraphjs/reference/classes/Command.html
  - Zod structured output with LangChain: https://js.langchain.com/docs/how_to/structured_output/

  **WHY Each Reference Matters**:
  - Old GM prompt's 4-phase flow must be adapted to LangGraph Command pattern
  - Dynamic routing examples show exact Command objects to construct
  - Narrative summary format is critical for Archivist input

  **Acceptance Criteria**:

  - [ ] `src/graph/nodes/gm.ts` exports `gmNode` function
  - [ ] LLM outputs structured `UserIntent` validated by Zod
  - [ ] Code constructs `Command` based on validated intent (not LLM direct)
  - [ ] For "塞莉娅和希尔薇争吵" → routes to actor with activeCharacter="塞莉娅"
  - [ ] For "三天后" → routes to archivist with isNewScene=true
  - [ ] Uses `buildStoryContext()` for context assembly
  - [ ] Streaming output via `config.writer`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: GM routes character action to actor
    Tool: Bash
    Preconditions: Mock LLM that returns structured intent for "塞莉娅决定逃离"
    Steps:
      1. Call gmNode with state containing user message "塞莉娅决定逃离暮霜堡"
      2. Inspect returned Command object
      3. Verify Command.goto === "actor" and Command.update.activeCharacter === "塞莉娅"
    Expected Result: Routes to actor with correct character
    Failure Indicators: Routes to wrong node, missing character
    Evidence: .sisyphus/evidence/task-9-gm-routing-actor.txt

  Scenario: GM routes time jump to archivist
    Tool: Bash
    Preconditions: Mock LLM that returns time_jump intent
    Steps:
      1. Call gmNode with state containing "三天后"
      2. Inspect returned Command object
      3. Verify Command.goto === "archivist" and Command.update.isNewScene === true
    Expected Result: Routes to archivist with new scene flag
    Failure Indicators: Routes to actor, no new scene flag
    Evidence: .sisyphus/evidence/task-9-gm-routing-archivist.txt
  ```

  **Commit**: YES
  - Message: `feat(graph): implement GM node with code-driven routing`
  - Files: `src/graph/nodes/gm.ts`

- [x] 10. Actor Node (Role-Play + Self-Loop)

  **What to do**:
  - Create `src/graph/nodes/actor.ts`
  - Implement Actor node function:
    1. Read `state.activeCharacter` to determine which character to play
    2. Call `buildStoryContext()` + read character file + inject interactionLog
    3. Call LLM (GPT-4o) with Actor prompt + character context
    4. Stream output via `config.writer` (with character label)
    5. Append to `state.interactionLog`
    6. Determine next step:
       - `state.actorTurns < state.maxActorTurns` and same character continues → `Command({ goto: "actor", update: { actorTurns: +1 } })`
       - Switch to another character → `Command({ goto: "actor", update: { activeCharacter: newChar, actorTurns: 0 } })`
       - Interaction complete → `Command({ goto: "scribe" })`
    7. Safety: If `actorTurns >= maxActorTurns`, force transition to "scribe"
  - Use `streamText()` for streaming character reaction
  - Add `config.writer` events: `agent_start` (with character name), `text_delta`, `agent_end`

  **Must NOT do**:
  - Do not create different nodes per character (same node, different activeCharacter)
  - Do not write to .novel/ files (Actor only outputs to state)
  - Do not exceed maxActorTurns without transitioning
  - Do not use session reuse / task_id pattern (that was OpenCode-specific)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Self-loop logic + streaming + interaction log management requires careful implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T5, T6, T7, T8)
  - **Parallel Group**: Wave 2 (parallel with T9, T11, T12)
  - **Blocks**: T14
  - **Blocked By**: T5, T6, T7, T8

  **References**:

  **Pattern References**:
  - `/data/novel/.opencode/agents/actor.md:1-118` — Full Actor prompt (output format: 行为/对话/内心独白)

  **API/Type References**:
  - `ARCHITECTURE.md:229-244` — Actor node definition (input/output, self-loop logic, activeCharacter pattern)
  - `ARCHITECTURE.md:557-574` — InteractionEntry type and reducer (how to append to interactionLog)
  - `ARCHITECTURE.md:579-594` — Streaming output pattern (config.writer events)

  **WHY Each Reference Matters**:
  - Actor prompt defines the output format that Scribe consumes
  - Self-loop pattern with maxActorTurns is critical for graph stability
  - Streaming pattern shows exact config.writer event types

  **Acceptance Criteria**:

  - [ ] `src/graph/nodes/actor.ts` exports `actorNode` function
  - [ ] Reads `state.activeCharacter` and assembles character-specific context
  - [ ] Streams output via `config.writer` with agent_start/agent_end events
  - [ ] Appends to `state.interactionLog` with character name + content + timestamp
  - [ ] Self-loops when actorTurns < maxActorTurns
  - [ ] Forces transition to scribe when maxActorTurns reached
  - [ ] Can switch activeCharacter (multi-character interaction)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Actor self-loops for multi-turn dialogue
    Tool: Bash
    Preconditions: Mock LLM returning character reaction
    Steps:
      1. Call actorNode with state.activeCharacter="塞莉娅", actorTurns=0, maxActorTurns=3
      2. Verify Command.goto === "actor" and Command.update.actorTurns === 1
    Expected Result: Self-loop with incremented turn count
    Failure Indicators: Goes to scribe too early, wrong turn count
    Evidence: .sisyphus/evidence/task-10-actor-loop.txt

  Scenario: Actor transitions to scribe when max turns reached
    Tool: Bash
    Preconditions: actorTurns at maximum
    Steps:
      1. Call actorNode with actorTurns=3, maxActorTurns=3
      2. Verify Command.goto === "scribe"
    Expected Result: Transitions to scribe regardless of LLM output
    Failure Indicators: Continues self-loop past max
    Evidence: .sisyphus/evidence/task-10-actor-max-turns.txt
  ```

  **Commit**: YES
  - Message: `feat(graph): implement Actor node with self-loop`
  - Files: `src/graph/nodes/actor.ts`

- [x] 11. Scribe Node (Literary Narration)

  **What to do**:
  - Create `src/graph/nodes/scribe.ts`
  - Implement Scribe node function:
    1. Read `style.md` for style guide
    2. Read `state.interactionLog` (complete log from Actor loop)
    3. Call LLM (GPT-4o) with Scribe prompt + interaction log + style guide
    4. Stream output via `config.writer` (with `[scribe]` label)
    5. Write `state.literaryText` with the complete literary output
    6. Return `Command({ goto: "archivist" })` — fixed edge to Archivist
  - Use `streamText()` for streaming literary text

  **Must NOT do**:
  - Do not change the plot or add new facts (Scribe only narrates)
  - Do not output raw Actor skeleton format (行为/对话/内心独白 labels)
  - Do not skip any interaction from the log (must cover all entries)
  - Do not add non-literary language (no "场景""分镜""镜头")

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt engineering for literary quality, streaming pattern implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T5, T6, T7, T8)
  - **Parallel Group**: Wave 2 (parallel with T9, T10, T12)
  - **Blocks**: T14
  - **Blocked By**: T5, T6, T7, T8

  **References**:

  **Pattern References**:
  - `/data/novel/.opencode/agents/scribe.md:1-110` — Full Scribe prompt (literary techniques, input/output format)

  **API/Type References**:
  - `ARCHITECTURE.md:246-255` — Scribe node definition (input: interactionLog + style; output: literaryText)
  - `ARCHITECTURE.md:579-594` — Streaming output pattern (config.writer)

  **WHY Each Reference Matters**:
  - Scribe prompt defines literary techniques and quality expectations
  - Node definition shows input/output contract with state

  **Acceptance Criteria**:

  - [ ] `src/graph/nodes/scribe.ts` exports `scribeNode` function
  - [ ] Reads `state.interactionLog` and `style.md`
  - [ ] Streams literary text via `config.writer` with scribe label
  - [ ] Sets `state.literaryText` with complete output
  - [ ] Returns `Command({ goto: "archivist" })`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Scribe produces literary text from interaction log
    Tool: Bash
    Preconditions: Mock LLM, state with interactionLog entries
    Steps:
      1. Call scribeNode with state containing 2 interaction entries
      2. Verify state.literaryText is set
      3. Verify Command.goto === "archivist"
    Expected Result: Literary text written to state, routes to archivist
    Failure Indicators: Empty literaryText, wrong routing
    Evidence: .sisyphus/evidence/task-11-scribe-output.txt
  ```

  **Commit**: YES
  - Message: `feat(graph): implement Scribe node`
  - Files: `src/graph/nodes/scribe.ts`

- [x] 12. Archivist Node (State Update)

  **What to do**:
  - Create `src/graph/nodes/archivist.ts`
  - Implement Archivist node function:
    1. Read `state.narrativeSummary` + `state.literaryText` + current .novel/ files
    2. Call LLM (GPT-4o-mini) with Archivist prompt + structured output schema
    3. Zod schema for file updates: `FileUpdate[]` where each has `{ path: string; content: string; action: "create" | "update" | "append" }`
    4. Validate each update against .novel/ format rules
    5. Execute file writes via `writeNovelFile()`
    6. Handle new character creation (characters/*.md)
    7. Handle scene file creation/update (scenes/sXXX.md)
    8. Update `state.storyFiles` with changed files
    9. Handle propagation debts (debts.md)
    10. Return `Command({ goto: "gm" })` — back to GM for next user input
  - Use `generateText()` with structured output (not streaming — Archivist output is not user-facing)

  **Must NOT do**:
  - Do not create new facts (only extract from narrative summary)
  - Do not delete character information (only append)
  - Do not stream output to user (Archivist is backend-only)
  - Do not skip format validation before writing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex file update logic with format validation, structured output parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T4, T5, T6, T7, T8)
  - **Parallel Group**: Wave 2 (parallel with T9-T11)
  - **Blocks**: T14
  - **Blocked By**: T4, T5, T6, T7, T8

  **References**:

  **Pattern References**:
  - `/data/novel/.opencode/agents/archivist.md:1-132` — Full Archivist prompt (file format specs, work flow, constraints)
  - `/data/novel/plugins/novel-theater/index.ts:492-499` — TEMPLATES object (format reference for new files)

  **API/Type References**:
  - `ARCHITECTURE.md:257-267` — Archivist node definition
  - `ARCHITECTURE.md:4.5.1` — .novel/ file format specs (compatible with old system)
  - `src/store/story-files.ts` — writeNovelFile, readNovelFile functions

  **WHY Each Reference Matters**:
  - Archivist prompt contains exact Markdown format specs for each file type
  - File formats must match exactly for buildStoryContext to parse correctly

  **Acceptance Criteria**:

  - [ ] `src/graph/nodes/archivist.ts` exports `archivistNode` function
  - [ ] Uses `generateText()` with structured output (Zod schema for file updates)
  - [ ] Validates format before writing (character file has L0, scene file has correct sections)
  - [ ] Creates new character files with proper format
  - [ ] Creates/updates scene files with proper format
  - [ ] Returns `Command({ goto: "gm" })`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Archivist creates new character file
    Tool: Bash
    Preconditions: Mock LLM returning file update for new character, .novel/ exists
    Steps:
      1. Call archivistNode with narrativeSummary mentioning new character "艾蕾雅"
      2. Check .novel/characters/艾蕾雅.md was created
      3. Verify file starts with "# 艾蕾雅" and has "> " L0 line
    Expected Result: Character file created with correct format
    Failure Indicators: File missing, wrong format, missing L0
    Evidence: .sisyphus/evidence/task-12-archivist-char.txt

  Scenario: Archivist validates format before writing
    Tool: Bash
    Preconditions: Mock LLM returning malformed content
    Steps:
      1. Call archivistNode with malformed file update
      2. Verify validation catches format errors
    Expected Result: Malformed content rejected or corrected
    Failure Indicators: Malformed content written to .novel/
    Evidence: .sisyphus/evidence/task-12-archivist-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(graph): implement Archivist node`
  - Files: `src/graph/nodes/archivist.ts`

- [x] 13. Store API Per-Agent Memory

  **What to do**:
  - Create `src/store/agent-memory.ts`
  - Implement per-agent memory using LangGraph `InMemoryStore`:
    - `initializeMemoryStore()` — create store instance
    - `getCharacterMemory(store, characterName)` — read memory for a character
    - `setCharacterMemory(store, characterName, key, value)` — write memory
    - `syncCharacterMemoryFromMD(store, characterName, characterMD)` — sync key info from .md file
  - Namespace structure: `agent_memories / {character_name} / {key}`
  - Store keys: `last_emotion`, `key_relationships`, `current_goal`, `recent_events`
  - Archivist calls `syncCharacterMemoryFromMD` after updating character .md files
  - Actor node reads from store for quick emotional state injection

  **Must NOT do**:
  - Do not use `PostgresStore` (InMemoryStore for dev)
  - Do not store full character .md content in memory (only key summaries)
  - Do not make memory reads block the graph (should be fast KV lookups)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: LangGraph Store API is newer, need careful integration with graph nodes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T8)
  - **Parallel Group**: Wave 2 (parallel with T9-T12)
  - **Blocks**: T21
  - **Blocked By**: T8

  **References**:

  **API/Type References**:
  - `ARCHITECTURE.md:346-363` — Store API per-agent memory definition (namespace structure, keys, relationship with .md files)

  **External References**:
  - LangGraph.js Store API: https://langchain-ai.github.io/langgraphjs/reference/interfaces/InMemoryStore.html

  **WHY Each Reference Matters**:
  - Namespace structure and key schema are defined in ARCHITECTURE.md
  - Need to understand .md file vs Store memory relationship

  **Acceptance Criteria**:

  - [ ] `src/store/agent-memory.ts` exports: `initializeMemoryStore`, `getCharacterMemory`, `setCharacterMemory`, `syncCharacterMemoryFromMD`
  - [ ] Store uses namespace: `agent_memories / {character_name} / {key}`
  - [ ] `getCharacterMemory` returns null for non-existent keys
  - [ ] `syncCharacterMemoryFromMD` extracts and stores key summaries

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Memory store read/write cycle
    Tool: Bash
    Preconditions: Store initialized
    Steps:
      1. Call setCharacterMemory(store, "塞莉娅", "last_emotion", "愤怒又悲伤")
      2. Call getCharacterMemory(store, "塞莉娅", "last_emotion")
      3. Verify returned value is "愤怒又悲伤"
    Expected Result: Write and read succeed
    Failure Indicators: null return, wrong value
    Evidence: .sisyphus/evidence/task-13-memory-cycle.txt
  ```

  **Commit**: YES
  - Message: `feat(store): implement Store API per-agent memory`
  - Files: `src/store/agent-memory.ts`

- [x] 14. API Route /api/narrative (Bridge Layer)

  **What to do**:
  - Create `src/app/api/narrative/route.ts`
  - Implement POST handler:
    1. Receive `UIMessage[]` from frontend
    2. `toBaseMessages()` — convert AI SDK UIMessage → LangChain BaseMessage
    3. `graph.stream()` — execute compiled LangGraph with:
       - `streamMode: ['values', 'messages', 'custom']`
       - `configurable: { thread_id }` for checkpointing
       - `config.writer` for custom events
    4. `toUIMessageStream()` — convert LangGraph stream → AI SDK UIMessageStream
    5. Return streaming response
  - Handle `onFinish` callback to capture final graph state
  - Create `src/app/api/narrative/route.types.ts` for request/response types
  - Error handling: LLM errors, graph execution errors, timeout

  **Must NOT do**:
  - Do not add business logic in the API route (it's a bridge only)
  - Do not bypass LangGraph streaming (must use graph.stream, not graph.invoke)
  - Do not hardcode thread_id (use client-provided or generate)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: The bridge layer is the critical integration point. @ai-sdk/langchain API has specific patterns for toBaseMessages/toUIMessageStream that need careful handling.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T8-T12)
  - **Parallel Group**: Wave 3 (first task)
  - **Blocks**: T17, T18, T19, T20
  - **Blocked By**: T8, T9, T10, T11, T12

  **References**:

  **API/Type References**:
  - `ARCHITECTURE.md:138-159` — API bridge layer definition (toBaseMessages, graph.stream, toUIMessageStream, streamMode)
  - `ARCHITECTURE.md:446-487` — Complete scene flow showing API route position in data flow

  **External References**:
  - @ai-sdk/langchain toUIMessageStream: https://sdk.vercel.ai/docs/ai-sdk-integration/langchain
  - Vercel AI SDK streaming: https://sdk.vercel.ai/docs/ai-sdk-core/streaming

  **WHY Each Reference Matters**:
  - Bridge layer is the only place where AI SDK and LangGraph formats meet — must get the conversion right
  - streamMode configuration determines what events the frontend receives

  **Acceptance Criteria**:

  - [ ] `POST /api/narrative` accepts UIMessage[] and returns streaming response
  - [ ] `toBaseMessages()` correctly converts message format
  - [ ] `graph.stream()` executes with correct streamMode and thread_id
  - [ ] `toUIMessageStream()` produces valid AI SDK stream
  - [ ] Custom events from `config.writer` appear in stream

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: API route returns streaming response
    Tool: Bash (curl)
    Preconditions: bun dev running, .novel/ initialized
    Steps:
      1. curl -X POST http://localhost:3000/api/narrative -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"你好"}]}'
      2. Verify response is streaming (Transfer-Encoding: chunked)
      3. Verify response contains text content
    Expected Result: Streaming response with narrative content
    Failure Indicators: Non-streaming response, empty body, 500 error
    Evidence: .sisyphus/evidence/task-14-api-stream.txt

  Scenario: API route handles missing .novel/ gracefully
    Tool: Bash (curl)
    Preconditions: No .novel/ directory
    Steps:
      1. curl -X POST http://localhost:3000/api/narrative -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"开始新故事"}]}'
    Expected Result: Returns helpful error or auto-initializes
    Failure Indicators: 500 unhandled error
    Evidence: .sisyphus/evidence/task-14-api-no-novel.txt
  ```

  **Commit**: YES
  - Message: `feat(api): implement /api/narrative bridge route`
  - Files: `src/app/api/narrative/route.ts`

- [x] 15. API Route /api/story (Story Management)

  **What to do**:
  - Create `src/app/api/story/route.ts`
  - Implement POST handler with action dispatch:
    - `{ action: "init" }` → call `initStory()`
    - `{ action: "archive", name: string }` → call `archiveStory()`
    - `{ action: "reset" }` → call `resetStory()`
  - Return JSON responses with success/error messages
  - Validate archive name (no path separators, max 200 chars)

  **Must NOT do**:
  - Do not allow agents to call this API (user-only operations)
  - Do not skip backup before reset

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple CRUD API wrapping existing story-files functions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T4)
  - **Parallel Group**: Wave 3 (with T14, T16-T19)
  - **Blocks**: T20
  - **Blocked By**: T4

  **References**:

  **Pattern References**:
  - `/data/novel/plugins/novel-theater/index.ts:508-657` — Old tool implementations for init/archive/reset (logic reference)
  - `src/store/story-files.ts` — New story-files I/O functions (direct usage)

  **API/Type References**:
  - `ARCHITECTURE.md:489-512` — Story management flow (init/archive/reset)

  **WHY Each Reference Matters**:
  - Old tool implementations show exact validation and error messages
  - New story-files functions are the direct implementation targets

  **Acceptance Criteria**:

  - [ ] `POST /api/story { action: "init" }` creates .novel/ directory
  - [ ] `POST /api/story { action: "archive", name: "test" }` archives to .archive/test/
  - [ ] `POST /api/story { action: "reset" }` backs up and resets
  - [ ] Invalid archive names rejected (path separators, too long)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Story init via API
    Tool: Bash (curl)
    Preconditions: Clean state, no .novel/
    Steps:
      1. curl -X POST http://localhost:3000/api/story -H 'Content-Type: application/json' -d '{"action":"init"}'
      2. Verify .novel/ directory created with template files
    Expected Result: 200 OK, .novel/ created
    Failure Indicators: 500, .novel/ not created
    Evidence: .sisyphus/evidence/task-15-story-init.txt
  ```

  **Commit**: YES
  - Message: `feat(api): implement /api/story management route`
  - Files: `src/app/api/story/route.ts`

- [x] 16. API Route /api/narrative/status (Session Status)

  **What to do**:
  - Create `src/app/api/narrative/status/route.ts`
  - Implement GET handler:
    1. Accept `threadId` query parameter
    2. Call `graph.getState({ configurable: { thread_id: threadId } })`
    3. Extract scene state: `currentSceneId`, `currentLocation`, `currentTime`, `activeCharacter`
    4. Return JSON with current state
  - Handle missing/invalid threadId gracefully

  **Must NOT do**:
  - Do not return full state (only scene-relevant fields)
  - Do not expose internal state fields (messages, interactionLog, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple read-only API wrapping graph.getState
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T8)
  - **Parallel Group**: Wave 3 (with T14, T15, T17-T19)
  - **Blocks**: T17
  - **Blocked By**: T8

  **References**:

  **API/Type References**:
  - `ARCHITECTURE.md:514-527` — Session recovery flow (graph.getState usage)

  **Acceptance Criteria**:

  - [ ] `GET /api/narrative/status?threadId=xxx` returns scene state
  - [ ] Response includes: currentSceneId, currentLocation, currentTime, activeCharacter
  - [ ] Missing threadId returns 400

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Status API returns current scene info
    Tool: Bash (curl)
    Preconditions: Active session with scene state
    Steps:
      1. curl http://localhost:3000/api/narrative/status?threadId=test-thread
      2. Verify JSON response has currentSceneId, currentLocation, currentTime
    Expected Result: Scene state JSON
    Failure Indicators: 500, missing fields
    Evidence: .sisyphus/evidence/task-16-status-api.txt
  ```

  **Commit**: YES
  - Message: `feat(api): implement /api/narrative/status route`
  - Files: `src/app/api/narrative/status/route.ts`

- [x] 17. Chat UI Page (useChat + Streaming)

  **What to do**:
  - Create `src/app/page.tsx` — main chat page
  - Create `src/components/chat/chat-layout.tsx` — layout wrapper
  - Create `src/components/chat/message-list.tsx` — scrollable message list
  - Create `src/components/chat/message-item.tsx` — individual message (user/narrative)
  - Create `src/components/chat/chat-input.tsx` — input area with send button
  - Use `useChat({ api: '/api/narrative' })` hook from `@ai-sdk/react`
  - Render `message.parts` (text + custom data parts)
  - Auto-scroll to bottom on new messages
  - Handle streaming rendering (show text as it arrives)
  - Thread ID management (generate on mount, persist in localStorage)
  - Responsive layout (mobile-friendly)

  **Must NOT do**:
  - Do not implement orchestration logic in frontend
  - Do not manage state in frontend (useChat handles it)
  - Do not make direct LLM calls from frontend
  - Do not over-design — keep UI minimal and functional

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend UI implementation with streaming, responsive layout, component composition
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: For proper chat UI design, streaming UX, and responsive layout

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T2, T14, T16)
  - **Parallel Group**: Wave 3 (with T14-T16, T18-T19)
  - **Blocks**: T20
  - **Blocked By**: T2, T14, T16

  **References**:

  **Pattern References**:
  - `ARCHITECTURE.md:112-135` — Frontend layer description

  **External References**:
  - Vercel AI SDK useChat: https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat
  - shadcn/ui chat example: https://ui.shadcn.com/examples/chat

  **WHY Each Reference Matters**:
  - useChat hook API determines how messages are handled
  - shadcn/ui chat example provides a good starting layout

  **Acceptance Criteria**:

  - [ ] Chat page renders with message list + input area
  - [ ] User can type and send messages
  - [ ] Streaming text appears as it arrives
  - [ ] Auto-scroll to bottom on new content
  - [ ] Thread ID persists across page reloads

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Chat UI sends message and receives streaming response
    Tool: Playwright
    Preconditions: bun dev running, .novel/ initialized
    Steps:
      1. Navigate to http://localhost:3000
      2. Type "你好" in input
      3. Click send button
      4. Wait for streaming response (timeout: 30s)
      5. Verify response text appears in message list
    Expected Result: User message + AI response in chat
    Failure Indicators: No response, error message, stuck loading
    Evidence: .sisyphus/evidence/task-17-chat-streaming.png

  Scenario: Chat UI auto-scrolls on new content
    Tool: Playwright
    Preconditions: Multiple messages in chat
    Steps:
      1. Send a message
      2. Check scroll position is at bottom
    Expected Result: View scrolls to show latest message
    Failure Indicators: Latest message hidden, need manual scroll
    Evidence: .sisyphus/evidence/task-17-auto-scroll.png
  ```

  **Commit**: YES
  - Message: `feat(ui): implement chat page with useChat`
  - Files: `src/app/page.tsx, src/components/chat/*.tsx`

- [x] 18. Custom Data Parts Rendering (Agent Labels, Progress)

  **What to do**:
  - Create `src/components/chat/agent-label.tsx` — colored label showing current agent (GM/Actor/Scribe/Archivist)
  - Create `src/components/chat/character-label.tsx` — label showing active character name
  - Create `src/components/chat/progress-indicator.tsx` — shows current step in the pipeline
  - Handle custom data parts from `useChat` message.parts:
    - `agent_start` → show agent label + "thinking..." animation
    - `agent_end` → remove thinking animation
    - `text_delta` → streaming text (handled by useChat)
  - Agent colors from old system: GM=#8B5CF6, Actor=#EC4899, Scribe=#F59E0B, Archivist=#10B981

  **Must NOT do**:
  - Do not block rendering while waiting for agent labels
  - Do not show internal state to users (only high-level progress)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Custom React components for streaming data parts rendering
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: For animated labels and progress indicators

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T2, T14)
  - **Parallel Group**: Wave 3 (with T14-T17, T19)
  - **Blocks**: T20
  - **Blocked By**: T2, T14

  **References**:

  **API/Type References**:
  - `ARCHITECTURE.md:579-594` — Streaming output pattern (config.writer event types)
  - Old system agent colors: GM=#8B5CF6, Actor=#EC4899, Scribe=#F59E0B, Archivist=#10B981

  **Acceptance Criteria**:

  - [ ] Agent labels render with correct colors
  - [ ] "Thinking..." animation appears during agent execution
  - [ ] Custom data parts from config.writer display correctly

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Agent labels appear during streaming
    Tool: Playwright
    Preconditions: bun dev running, chat active
    Steps:
      1. Send a message that triggers Actor node
      2. Look for agent label with Actor color (#EC4899)
      3. Look for character name display
    Expected Result: Colored agent labels visible during streaming
    Failure Indicators: No labels, wrong colors, no animation
    Evidence: .sisyphus/evidence/task-18-agent-labels.png
  ```

  **Commit**: YES (groups with T17)
  - Message: `feat(ui): implement custom data parts rendering`
  - Files: `src/components/chat/agent-label.tsx, src/components/chat/character-label.tsx, src/components/chat/progress-indicator.tsx`

- [x] 19. Scene Status Indicator Component

  **What to do**:
  - Create `src/components/chat/scene-indicator.tsx`
  - Display current scene info:
    - 📍 Current location
    - ⏰ Story time
    - 📋 Scene number (sXXX)
    - 💡 Optional prompt suggestion
  - Fetch data from `GET /api/narrative/status`
  - Update when scene state changes (poll or event-driven)
  - Compact design — doesn't dominate the chat view
  - Example: `📍 暮霜堡·公主卧室 | ⏰ 秋夜·子时 | 📋 s003`

  **Must NOT do**:
  - Do not fetch status too frequently (debounce to avoid API spam)
  - Do not block chat interaction if status fetch fails

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with data fetching and compact layout design
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: For compact status bar design

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T2, T14)
  - **Parallel Group**: Wave 3 (with T14-T18)
  - **Blocks**: T20
  - **Blocked By**: T2, T14

  **References**:

  **API/Type References**:
  - `ARCHITECTURE.md:637-647` — Scene status indicator format (📍 🕐 📋 💡)
  - `GET /api/narrative/status` — API endpoint for scene state

  **Acceptance Criteria**:

  - [ ] Scene indicator shows location, time, scene number
  - [ ] Updates after each narrative turn
  - [ ] Falls back gracefully when no scene data available

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Scene indicator updates after interaction
    Tool: Playwright
    Preconditions: Active chat with scene state
    Steps:
      1. Check scene indicator shows location/time/scene#
      2. Send a message triggering scene change
      3. Verify indicator updates after response
    Expected Result: Scene info updates to reflect new state
    Failure Indicators: Stale data, missing fields, no update
    Evidence: .sisyphus/evidence/task-19-scene-indicator.png
  ```

  **Commit**: YES (groups with T17-T18)
  - Message: `feat(ui): implement scene status indicator`
  - Files: `src/components/chat/scene-indicator.tsx`

- [x] 20. End-to-End Integration Test

  **What to do**:
  - Create `tests/e2e/narrative-flow.test.ts`
  - Test complete narrative flow: user input → GM → Actor → Scribe → Archivist → output
  - Test story management: init → write → archive → reset
  - Test session recovery: interact → close → reopen → continue
  - Test streaming: verify chunked response arrives
  - Test edge cases: empty input, very long input, special characters
  - Use real API calls against `bun dev` server
  - Create test fixtures: sample .novel/ data with world, characters, scenes

  **Must NOT do**:
  - Do not use real OpenAI API calls in CI (mock LLM responses)
  - Do not skip any agent in the flow (test full pipeline)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Integration testing requires understanding the full system flow and mocking LLM responses correctly
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all Wave 3 tasks)
  - **Parallel Group**: Wave 4 (first task)
  - **Blocks**: T22
  - **Blocked By**: T14, T15, T17, T18, T19

  **References**:

  **Pattern References**:
  - `/data/novel/plugins/novel-theater/test-integration.test.ts` — Old system test patterns (Bun test structure)
  - `/data/novel/plugins/novel-theater/test-edge-cases.test.ts` — Edge case test patterns

  **API/Type References**:
  - `ARCHITECTURE.md:443-487` — Complete scene flow (step-by-step for test assertions)
  - `ARCHITECTURE.md:489-527` — Story management and session recovery flows

  **Acceptance Criteria**:

  - [ ] E2E test for complete narrative flow passes
  - [ ] Story management test (init/archive/reset) passes
  - [ ] Session recovery test passes
  - [ ] Edge case tests pass
  - [ ] All tests run with `bun test`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full narrative flow E2E test passes
    Tool: Bash
    Preconditions: All code implemented
    Steps:
      1. Run `bun test tests/e2e/narrative-flow.test.ts`
    Expected Result: All tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-20-e2e-test.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add end-to-end integration test`
  - Files: `tests/e2e/narrative-flow.test.ts`

- [x] 21. Error Handling + Retry Logic

  **What to do**:
  - Add error handling to all graph nodes:
    - GM node: Handle LLM intent parsing failure → fallback to "end" routing
    - Actor node: Handle LLM failure → graceful termination with error message
    - Scribe node: Handle LLM failure → return interaction log as-is
    - Archivist node: Handle file write failure → log error, continue
  - Add retry logic:
    - LLM calls: max 2 retries with exponential backoff
    - File writes: max 1 retry
  - Add graph-level error boundary:
    - Set `recursionLimit` (default 25) to prevent infinite loops
    - Catch and propagate node errors to API layer
  - API layer error handling:
    - Return appropriate HTTP status codes (400, 500)
    - Include error message in response
  - Frontend error handling:
    - Show user-friendly error messages
    - "Retry" button for failed messages

  **Must NOT do**:
  - Do not silently swallow errors (always log or surface)
  - Do not retry more than 2 times for LLM calls
  - Do not block the graph on non-critical errors

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Systematic error handling across all layers requires careful implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T14, T13)
  - **Parallel Group**: Wave 4 (with T20)
  - **Blocks**: T22
  - **Blocked By**: T14, T13

  **References**:

  **API/Type References**:
  - `ARCHITECTURE.md:697-706` — Risks and mitigations (recursionLimit, timeout handling)

  **Acceptance Criteria**:

  - [ ] All nodes handle LLM failures gracefully
  - [ ] Graph has recursionLimit set
  - [ ] API returns proper error codes and messages
  - [ ] Frontend shows error messages with retry option

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Graph handles LLM failure gracefully
    Tool: Bash
    Preconditions: Mock LLM that throws error
    Steps:
      1. Send message that triggers LLM error
      2. Verify graph doesn't hang or crash
      3. Verify error message reaches frontend
    Expected Result: Graceful error message, no hang
    Failure Indicators: Infinite loop, unhandled exception
    Evidence: .sisyphus/evidence/task-21-error-handling.txt

  Scenario: Graph respects recursionLimit
    Tool: Bash
    Preconditions: Actor self-loop scenario
    Steps:
      1. Create scenario where Actor would loop infinitely
      2. Verify graph terminates after recursionLimit
    Expected Result: Graph stops with recursion error, not infinite loop
    Failure Indicators: Process hangs
    Evidence: .sisyphus/evidence/task-21-recursion-limit.txt
  ```

  **Commit**: YES
  - Message: `feat(core): add error handling + retry logic`
  - Files: `src/graph/nodes/*.ts, src/app/api/narrative/route.ts`

- [x] 22. Tests-After (bun:test Coverage)

  **What to do**:
  - Create `tests/unit/` and `tests/integration/` directories
  - Unit tests for:
    - `src/context/build-story-context.ts` — context assembly logic
    - `src/context/extract.ts` — all extraction functions
    - `src/context/character-resolver.ts` — fuzzy matching
    - `src/store/story-files.ts` — init/archive/reset
    - `src/store/agent-memory.ts` — memory store operations
    - `src/lib/models.ts` — model configuration
  - Integration tests for:
    - `src/graph/narrative-graph.ts` — graph structure
    - `src/graph/nodes/gm.ts` — routing logic (with mock LLM)
    - `src/graph/nodes/actor.ts` — self-loop logic
    - API routes — request/response validation
  - Each test file creates temp directory, runs tests, cleans up
  - Target: 80%+ coverage for context/ and store/ modules

  **Must NOT do**:
  - Do not use real OpenAI API calls (mock all LLM interactions)
  - Do not test implementation details (test behavior)
  - Do not skip cleanup in test teardown

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive test coverage across multiple modules
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T20, T21)
  - **Parallel Group**: Wave 4 (last task)
  - **Blocks**: F1-F4
  - **Blocked By**: T20, T21

  **References**:

  **Pattern References**:
  - `/data/novel/plugins/novel-theater/test-integration.test.ts` — Test structure and mocking patterns
  - `/data/novel/plugins/novel-theater/test-edge-cases.test.ts` — Edge case test patterns
  - `/data/novel/plugins/novel-theater/test-timeline-debts.test.ts` — Timeline and debt test patterns

  **Acceptance Criteria**:

  - [ ] `bun test` passes all tests
  - [ ] 80%+ coverage for src/context/ and src/store/
  - [ ] Each module has at least 1 happy-path and 1 error test
  - [ ] All tests clean up temp directories

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All tests pass
    Tool: Bash
    Preconditions: All test files created
    Steps:
      1. Run `bun test`
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-22-all-tests.txt
  ```

  **Commit**: YES
  - Message: `test: add unit/integration test coverage`
  - Files: `tests/unit/*.test.ts, tests/integration/*.test.ts`

- [x] 23. Final Polish + README

  **What to do**:
  - Create `README.md` with:
    - Project overview (自由剧场 v2)
    - Quick start guide (bun install → bun dev → open :3000)
    - Architecture overview (link to ARCHITECTURE.md)
    - Environment variables (.env.local)
    - Development commands
  - Update `package.json` scripts:
    - `dev`: `next dev --turbopack`
    - `build`: `next build`
    - `test`: `bun test`
    - `lint`: `next lint`
  - Final code cleanup: remove console.logs, fix any TypeScript warnings
  - Verify all `bun dev` → `bun build` → `bun test` commands work

  **Must NOT do**:
  - Do not add comprehensive API documentation (README is quick-start only)
  - Do not add CHANGELOG or CONTRIBUTING docs

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation and final polish
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T20)
  - **Parallel Group**: Wave 4 (with T20-T22)
  - **Blocks**: F1-F4
  - **Blocked By**: T20

  **References**: []

  **Acceptance Criteria**:

  - [ ] README.md exists with quick start guide
  - [ ] `bun dev` starts without errors
  - [ ] `bun run build` succeeds
  - [ ] `bun test` passes
  - [ ] No TypeScript warnings (`tsc --noEmit` clean)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full dev workflow succeeds
    Tool: Bash
    Preconditions: All code implemented
    Steps:
      1. Run `bun install`
      2. Run `bun run build`
      3. Run `bun test`
      4. Run `bunx tsc --noEmit`
    Expected Result: All commands succeed without errors
    Failure Indicators: Build failure, test failure, type errors
    Evidence: .sisyphus/evidence/task-23-full-workflow.txt
  ```

  **Commit**: YES
  - Message: `docs: add README + usage guide`
  - Files: `README.md, package.json`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1**: `feat(init): scaffold Next.js + Bun project with dependencies` - package.json, tsconfig.json, next.config.ts
- **T2**: `feat(ui): setup shadcn/ui + base chat components` - src/components/
- **T3**: `feat(graph): define NarrativeState type + Annotation` - src/graph/state.ts
- **T4**: `feat(store): add .novel/ templates + story-files I/O` - src/store/story-files.ts, src/lib/templates.ts
- **T5**: `feat(context): implement buildStoryContext with TypeScript refactor` - src/context/
- **T6**: `feat(lib): add OpenAI model configuration` - src/lib/models.ts
- **T7**: `feat(prompts): migrate agent prompts to TypeScript` - src/prompts/
- **T8**: `feat(graph): implement StateGraph definition + edges` - src/graph/narrative-graph.ts
- **T9**: `feat(graph): implement GM node with code-driven routing` - src/graph/nodes/gm.ts
- **T10**: `feat(graph): implement Actor node with self-loop` - src/graph/nodes/actor.ts
- **T11**: `feat(graph): implement Scribe node` - src/graph/nodes/scribe.ts
- **T12**: `feat(graph): implement Archivist node` - src/graph/nodes/archivist.ts
- **T13**: `feat(store): implement Store API per-agent memory` - src/store/agent-memory.ts
- **T14**: `feat(api): implement /api/narrative bridge route` - src/app/api/narrative/route.ts
- **T15**: `feat(api): implement /api/story management route` - src/app/api/story/route.ts
- **T16**: `feat(api): implement /api/narrative/status route` - src/app/api/narrative/status/route.ts
- **T17**: `feat(ui): implement chat page with useChat` - src/app/page.tsx
- **T18**: `feat(ui): implement custom data parts rendering` - src/components/
- **T19**: `feat(ui): implement scene status indicator` - src/components/
- **T20**: `test(e2e): add end-to-end integration test` - tests/
- **T21**: `feat(core): add error handling + retry logic` - src/graph/nodes/
- **T22**: `test: add unit/integration test coverage` - tests/
- **T23**: `docs: add README + usage guide` - README.md

---

## Success Criteria

### Verification Commands
```bash
bun dev                    # Expected: Next.js dev server starts on :3000
bun test                   # Expected: All tests pass
curl -X POST http://localhost:3000/api/story -H 'Content-Type: application/json' -d '{"action":"init"}'  # Expected: 200 OK, .novel/ created
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] End-to-end flow works: user input → GM → Actor → Scribe → Archivist → streaming output
- [ ] .novel/ directory format compatible with old system
- [ ] Session recovery works (MemorySaver)
- [ ] Story management (init/archive/reset) works
