# 自由剧场 UI 优化 + 架构加固

## TL;DR

> **Quick Summary**: 修复6个UI/UX问题（终止会话、工具调用显示、subagent查看、存储目录、多行输入、多气泡拆分）+ 项目路径可配置化 + 自定义Session持久化后端
> 
> **Deliverables**:
> - Stop 按钮 + AbortSignal 中止机制
> - dynamic-tool 部分正确渲染（agent 标签 + 状态）
> - 多步骤响应拆分为独立气泡（step-start 分段）
> - 多行自动增长 textarea 输入框
> - .novel/ 自动初始化 + PROJECT_DIR 可配置
> - 自定义 FileSession 持久化后端
> - Subagent 执行日志 API + Modal 查看器
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves + final verification
> **Critical Path**: Task 1 → Task 6 → Task 9 → Task 11 → F1-F4

---

## Context

### Original Request
用户发现6个问题：无法终止会话、工具调用显示为空白行、无法查看subagent session、.novel/目录不存在、输入框仅支持单行、单次消息多轮调用无法拆分气泡。额外需求：项目路径可配置化。

### Interview Summary
**Key Discussions**:
- 工具调用空白行根因：代码检查 `"tool-invocation"` 但 AI SDK v6 实际类型是 `"dynamic-tool"`
- Subagent session：选择完整持久化方案（自定义 Session 类 + 文件/SQLite），UI 用弹出式 Modal
- .novel/ 初始化：选择 GM agent 工具接入（initStoryTool），同时添加 PROJECT_DIR 环境变量
- 多气泡拆分：确认实现，视觉样式为独立气泡 + Agent 标签
- 项目路径：`PROJECT_DIR` 环境变量（默认 `.novel`），运行时通过 context 传递，未来可按 session 配置

**Research Findings**:
- `@openai/agents-extensions` 以 `dynamic: true` 发出工具事件 → 客户端创建 `DynamicToolUIPart`
- `SQLiteSession`/`RedisSession` 不存在于 @openai/agents v0.8.5（ARCHITECTURE.md 中为虚构）
- `customOutputExtractor` 不丢弃追踪数据（仅控制返回给父 agent 的文本）
- `asTool()` 可能不支持 per-call session 参数（需验证）
- `characterSessions` Map 是死代码，`getCharacterSession()` 从未被调用
- `setTracingDisabled(true)` 阻止所有追踪收集
- `initStoryTool` 已定义但从未被任何 agent 引用
- `story-files.ts` 在8处硬编码 `.novel`

### Metis Review
**Identified Gaps** (addressed):
- `customOutputExtractor` 误解已纠正：不影响追踪/流式传输
- `SQLiteSession` 不存在已确认：改为自定义 Session 实现
- 双路径 bug 风险：`PROJECT_DIR` 语义明确定义为项目目录相对路径，`storyDir` 改为指向项目目录本身
- `asTool()` session 支持需验证：在 Task 7 中作为首要验证项
- `message-list.tsx` 也需修复：已纳入 Task 1
- `story/route.ts` 和 `narrative/status/route.ts` 也需更新：已纳入 Task 4

---

## Work Objectives

### Core Objective
修复6个UI/UX问题，实现项目路径可配置化，建立自定义Session持久化后端和subagent执行日志查看能力。

### Concrete Deliverables
- `src/components/chat/chat-input.tsx`: Stop 按钮 + textarea
- `src/components/chat/message-item.tsx`: dynamic-tool 渲染 + step-start 分段
- `src/components/chat/message-list.tsx`: dynamic-tool 进度修复 + 多气泡展开
- `src/components/chat/session-modal.tsx`: Subagent session Modal 查看器
- `src/app/api/narrative/route.ts`: AbortSignal + PROJECT_DIR
- `src/session/file-session.ts`: 自定义 FileSession 持久化后端
- `src/session/execution-log.ts`: 执行日志模型和捕获
- `src/store/story-files.ts`: 移除 `.novel` 硬编码
- `src/agents/registry.ts`: initStoryTool 接入 GM

### Definition of Done
- [ ] Stop 按钮在 streaming 时可见，点击后中止流式响应
- [ ] 工具调用显示 agent 标签而非空白行
- [ ] 多步骤响应拆分为独立气泡
- [ ] 输入框支持多行 + 自动增长 + Shift+Enter 换行
- [ ] .novel/ 在首次使用时自动创建
- [ ] PROJECT_DIR 环境变量可配置项目路径
- [ ] Subagent 执行日志可通过 Modal 查看
- [ ] Session 数据持久化到文件系统

### Must Have
- Stop 按钮中止客户端流 + 服务端 agent run
- dynamic-tool 部分正确渲染（agent 标签 + 输出文本）
- step-start 分段拆分为独立气泡
- textarea 替代 input（auto-resize + 多行）
- initStoryTool 接入 GM agent
- PROJECT_DIR 可配置（默认 `.novel`）
- 自定义 Session 持久化
- Subagent 执行日志 API + Modal UI

### Must NOT Have (Guardrails)
- 不实现 SQLiteSession（不存在于 SDK）
- 不修改 `customOutputExtractor` 逻辑（它不丢弃追踪数据）
- 不在下游代码直接读取 `process.env.PROJECT_DIR`（只在 API 入口读取一次）
- 不创建独立 UIMessage 对象来拆分气泡（拆分仅限渲染层）
- 不添加 step 审批/重试/编辑功能
- 不添加 markdown 预览/rich text/@mentions 到输入框
- 不修改 agent prompt 核心内容（仅添加 init_story 工具引用）
- 不实现 per-session 项目路径配置（当前仅 env var，未来扩展）

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Framework**: none
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) - Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) - Send requests, assert status + response fields
- **Library/Module**: Use Bash (bun/node REPL) - Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 5 parallel tasks):
├── Task 1: Fix dynamic-tool part type check [quick]
├── Task 2: Add stop/abort functionality [quick]
├── Task 3: Replace input with auto-resize textarea [quick]
├── Task 4: Project path configurability + initStoryTool [unspecified-high]
└── Task 5: Create custom FileSession class [deep]

Wave 2 (Core features - 3 parallel tasks):
├── Task 6: Render dynamic-tool parts with agent badges [visual-engineering, depends: 1]
├── Task 7: Wire characterSessions + execution log capture [deep, depends: 5]
└── Task 8: Clean up .novel_backup + update .gitignore [quick, depends: 4]

Wave 3 (Advanced features - 2 parallel tasks):
├── Task 9: Multi-bubble step splitting [visual-engineering, depends: 1, 6]
└── Task 10: Session log API endpoints [unspecified-high, depends: 5, 7]

Wave 4 (UI integration):
└── Task 11: Subagent session Modal UI [visual-engineering, depends: 10]

Wave FINAL (4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 6 → Task 9 → Task 11 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | - | 6, 9 | 1 |
| 2 | - | - | 1 |
| 3 | - | - | 1 |
| 4 | - | 8 | 1 |
| 5 | - | 7, 10 | 1 |
| 6 | 1 | 9 | 2 |
| 7 | 5 | 10 | 2 |
| 8 | 4 | - | 2 |
| 9 | 1, 6 | 11 | 3 |
| 10 | 5, 7 | 11 | 3 |
| 11 | 10 | - | 4 |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks - T1-T3 → `quick`, T4 → `unspecified-high`, T5 → `deep`
- **Wave 2**: 3 tasks - T6 → `visual-engineering`, T7 → `deep`, T8 → `quick`
- **Wave 3**: 2 tasks - T9 → `visual-engineering`, T10 → `unspecified-high`
- **Wave 4**: 1 task - T11 → `visual-engineering`
- **FINAL**: 4 tasks - F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix dynamic-tool part type check

  **What to do**:
  - In `src/components/chat/message-item.tsx`: Change `extractAgentLabel()` to check `part.type === "dynamic-tool"` instead of `part.type === "tool-invocation"`, and read `part.toolName` directly (not via `.toolInvocation?.toolName`)
  - In `src/components/chat/message-list.tsx`: Change `deriveProgress()` to check `part.type === "dynamic-tool"` instead of `part.type === "tool-invocation"`, and read `part.toolName` directly
  - Use `ast_grep_search` to find ALL occurrences of `"tool-invocation"` in the codebase and fix them
  - Add TypeScript type narrowing for `DynamicToolUIPart` (import from `ai` package)

  **Must NOT do**:
  - Do not add rendering logic for dynamic-tool parts yet (Task 6)
  - Do not modify the API route or stream format

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple type string replacement in 2-3 files
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for type fix, QA is visual verification

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 6, 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/components/chat/message-item.tsx:11-31` — `extractAgentLabel()` current (broken) tool-invocation check
  - `src/components/chat/message-list.tsx:22` — `deriveProgress()` current (broken) tool-invocation check

  **API/Type References**:
  - `node_modules/ai/dist/index.d.ts` — `DynamicToolUIPart` type with `type: "dynamic-tool"`, `toolName`, `state`, `input`, `output` fields
  - `node_modules/@openai/agents-extensions/dist/ai-sdk-ui/uiMessageStream.js:224,233,243,311` — `dynamic: true` on tool events

  **External References**:
  - AI SDK v6 UIMessage parts: `dynamic-tool` is the type for unregistered/dynamic tool invocations

  **WHY Each Reference Matters**:
  - `message-item.tsx:11-31`: The exact code to fix — wrong type check prevents agent label extraction
  - `message-list.tsx:22`: Same wrong type check breaks progress indicator
  - `DynamicToolUIPart` type: Needed for correct type narrowing after fixing the check

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Agent label extracted from dynamic-tool parts
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. grep -r "tool-invocation" src/components/chat/ — should return NO matches
      2. grep -r "dynamic-tool" src/components/chat/ — should return matches in message-item.tsx and message-list.tsx
    Expected Result: Zero references to "tool-invocation", at least 2 references to "dynamic-tool"
    Failure Indicators: Any remaining "tool-invocation" references
    Evidence: .sisyphus/evidence/task-1-type-fix.txt

  Scenario: TypeScript compilation passes after type changes
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run `npx tsc --noEmit` in project root
    Expected Result: Exit code 0, no type errors
    Failure Indicators: Type errors related to DynamicToolUIPart or part.type
    Evidence: .sisyphus/evidence/task-1-tsc-check.txt
  ```

  **Commit**: YES
  - Message: `fix(chat): correct dynamic-tool part type handling`
  - Files: `src/components/chat/message-item.tsx, src/components/chat/message-list.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [x] 2. Add stop/abort functionality

  **What to do**:
  - In `src/app/page.tsx`: Destructure `stop` from `useChat()` and pass as `onStop` prop to `ChatInput`
  - In `src/components/chat/chat-input.tsx`:
    - Add `onStop: () => void` to `ChatInputProps`
    - When `status === "submitted" || status === "streaming"`, render a Stop button (with 停止/Square icon) instead of disabled Send button
    - Stop button calls `onStop()` on click
  - In `src/app/api/narrative/route.ts`: Add `signal: req.signal` to the `run()` options so server-side agent run is also cancelled on abort
  - Add abort-aware error handling in route.ts: distinguish `req.signal.aborted` from real errors

  **Must NOT do**:
  - Do not implement server-side abort logic beyond passing the signal
  - Do not change the partial text preservation behavior (AI SDK `stop()` keeps generated tokens by default)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small changes in 3 files, well-understood pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/app/page.tsx:38` — Current useChat destructuring (missing `stop`)
  - `src/components/chat/chat-input.tsx:21-41` — Current ChatInput with disabled state but no Stop button
  - `src/app/api/narrative/route.ts:46-51` — Current run() call (missing `signal`)

  **API/Type References**:
  - `node_modules/@ai-sdk/react/dist/index.d.ts` — `UseChatHelpers` includes `stop` function
  - `node_modules/@openai/agents-core/dist/run.d.ts:138` — `SharedRunOptions` includes `signal?: AbortSignal`

  **WHY Each Reference Matters**:
  - `page.tsx:38`: Where to add `stop` destructuring
  - `chat-input.tsx:21-41`: Where to add Stop button rendering
  - `route.ts:46-51`: Where to add `signal: req.signal`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Stop button appears during streaming
    Tool: Playwright
    Preconditions: App running, .novel/ initialized
    Steps:
      1. Navigate to http://localhost:4477
      2. Type "你好" in input and submit
      3. While response is streaming, check for Stop button
    Expected Result: Stop button visible with text "停止" or Square icon during streaming
    Failure Indicators: No Stop button, or Send button still visible during streaming
    Evidence: .sisyphus/evidence/task-2-stop-button.png

  Scenario: Stop button terminates streaming
    Tool: Playwright
    Preconditions: App running, streaming in progress
    Steps:
      1. Submit a message that triggers multi-step agent response
      2. Click Stop button during streaming
      3. Verify: partial text preserved, input re-enabled, Stop button gone
    Expected Result: Streaming stops, partial response text remains in chat, input becomes editable again
    Failure Indicators: Streaming continues after click, or input stays disabled, or all text disappears
    Evidence: .sisyphus/evidence/task-2-stop-works.png

  Scenario: Abort signal propagates to server
    Tool: Bash (curl)
    Preconditions: App running
    Steps:
      1. Send a POST to /api/narrative with a long-running prompt
      2. Immediately close the connection (curl --max-time 1)
      3. Check server logs for abort handling
    Expected Result: Server receives abort signal, agent run terminates (not running for full maxDuration)
    Failure Indicators: Agent run continues for full 60s after client disconnect
    Evidence: .sisyphus/evidence/task-2-server-abort.txt
  ```

  **Commit**: YES
  - Message: `feat(chat): add stop/abort functionality`
  - Files: `src/app/page.tsx, src/components/chat/chat-input.tsx, src/app/api/narrative/route.ts`
  - Pre-commit: `npx tsc --noEmit`

- [x] 3. Replace input with auto-resize textarea

  **What to do**:
  - In `src/components/chat/chat-input.tsx`:
    - Replace `<Input>` with a native `<textarea>` element
    - Set `rows={1}` as initial height, auto-grow via `scrollHeight` on input change
    - Add `ref` for textarea element, implement `adjustHeight()` function
    - Change form container from `items-center` to `items-end` (button aligns to bottom)
    - Add `resize-none` to prevent manual drag-resize
    - Add `max-h-40 overflow-y-auto` to cap growth at ~10 lines
    - Implement: Enter (without Shift) submits, Shift+Enter inserts newline
    - Handle IME composition (don't submit during composition via `composing` state + `compositionstart`/`compositionend` events)
  - Remove dependency on `@/components/ui/input` from chat-input.tsx

  **Must NOT do**:
  - Do not add markdown preview, rich text, or @mentions
  - Do not create a separate Textarea UI component (use native `<textarea>` directly)
  - Do not change the form submission logic beyond Enter/Shift+Enter handling

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single component refactor, well-understood textarea pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/components/chat/chat-input.tsx` — Current single-line Input implementation
  - `src/components/ui/input.tsx` — Current Input component (uses @base-ui/react/input, renders `<input>`)

  **WHY Each Reference Matters**:
  - `chat-input.tsx`: The file to modify — replace Input with textarea
  - `input.tsx`: Reference for existing styling patterns to preserve in textarea

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Textarea auto-grows with multi-line input
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Navigate to http://localhost:4477
      2. Type "第一行" then Shift+Enter then "第二行" then Shift+Enter then "第三行"
      3. Measure textarea height
    Expected Result: Textarea height > initial single-line height, text wraps across 3 lines
    Failure Indicators: Textarea stays at single-line height, or text overflows without resize
    Evidence: .sisyphus/evidence/task-3-textarea-grow.png

  Scenario: Enter submits, Shift+Enter adds newline
    Tool: Playwright
    Preconditions: App running, text in textarea
    Steps:
      1. Type "测试文本" in textarea
      2. Press Enter (without Shift)
      3. Verify message is submitted
      4. Type "行1" then Shift+Enter then "行2" in textarea
      5. Verify textarea contains two lines, message NOT submitted yet
    Expected Result: Enter submits, Shift+Enter inserts newline without submitting
    Failure Indicators: Enter inserts newline instead of submitting, or Shift+Enter submits
    Evidence: .sisyphus/evidence/task-3-enter-shift-enter.png

  Scenario: Textarea caps at max height
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Type 15+ lines of text (Shift+Enter between each)
      2. Observe textarea height
    Expected Result: Textarea stops growing at max-h-40, becomes scrollable
    Failure Indicators: Textarea grows beyond max height with no scrollbar
    Evidence: .sisyphus/evidence/task-3-max-height.png
  ```

  **Commit**: YES
  - Message: `feat(chat): multi-line textarea input`
  - Files: `src/components/chat/chat-input.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [x] 4. Project path configurability + initStoryTool for GM

  **What to do**:
  - Add `PROJECT_DIR` to `.env.example` (default: `.novel`) and `.env.local`
  - Create `src/lib/project-path.ts` utility:
    - `getProjectDir(): string` — reads `process.env.PROJECT_DIR` once, defaults to `.novel`
    - `resolveProjectPath(baseDir?: string): string` — returns `join(baseDir || process.cwd(), getProjectDir())`
  - Refactor `src/store/story-files.ts`:
    - Change `dir` parameter semantics: `dir` now IS the project directory (not parent)
    - Replace all `join(dir, ".novel", ...)` with `join(dir, ...)` (8 occurrences)
    - Update `initStory`, `archiveStory`, `resetStory`, `readNovelFile`, `writeNovelFile`, `globNovelFiles`
    - For `archiveStory`: archive dir should be `join(dirname(dir), '.archive')` (sibling of project dir)
  - Update `src/app/api/narrative/route.ts`:
    - Change `storyDir = process.cwd()` to `storyDir = resolveProjectPath()`
    - Pass `storyDir` through context (already works)
  - Update `src/app/api/narrative/status/route.ts`:
    - Use `resolveProjectPath()` instead of `process.cwd()`
  - Update `src/app/api/story/route.ts`:
    - Use `resolveProjectPath()` instead of `process.cwd()`
  - Update `src/context/build-story-context.ts`:
    - Remove `join(dir, ".novel")` check at line 43-44 — `dir` IS the project dir now
    - Change `existsSync(novelDir)` to `existsSync(dir)`
  - Add `initStoryTool` to GM agent in `src/agents/registry.ts`:
    - Import `initStoryTool` from `@/tools/story-tools`
    - Add to `gmAgent.tools` array
  - Update GM prompt `src/prompts/gm.ts` section "## 11. 错误处理":
    - Reference `init_story` tool by name in the .novel/ initialization instructions

  **Must NOT do**:
  - Do not read `process.env.PROJECT_DIR` in downstream code (only in `project-path.ts`)
  - Do not implement per-session project path configuration (future scope)
  - Do not change `customOutputExtractor` logic
  - Do not modify agent prompt core content beyond adding init_story reference

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-file refactoring touching store, routes, context, agents — needs careful coordination
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/store/story-files.ts:29-65` — `initStory()` with `join(dir, ".novel")` pattern (8 occurrences to refactor)
  - `src/app/api/narrative/route.ts:28` — `storyDir = process.cwd()` (change to resolveProjectPath())
  - `src/agents/registry.ts:60` — `gmAgent.tools = [callActorTool, callScribeTool, callArchivistTool]` (add initStoryTool)
  - `src/context/build-story-context.ts:43-44` — `join(dir, ".novel")` existence check (refactor)

  **API/Type References**:
  - `src/tools/story-tools.ts:10` — `initStoryTool` definition (dead code to activate)
  - `src/prompts/gm.ts:334-339` — GM prompt section 11 referencing .novel/ initialization

  **WHY Each Reference Matters**:
  - `story-files.ts`: Core file with 8 hardcoded `.novel` references to refactor
  - `route.ts:28`: Where `storyDir` is resolved — must use new utility
  - `registry.ts:60`: Where GM tools are registered — add initStoryTool
  - `build-story-context.ts:43-44`: Path check that must match new semantics

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: PROJECT_DIR defaults to .novel
    Tool: Bash
    Preconditions: No PROJECT_DIR in .env.local
    Steps:
      1. Start the app
      2. curl POST /api/story with {"action":"init"}
      3. Check if .novel/ directory was created with template files
    Expected Result: .novel/ directory exists with world.md, style.md, timeline.md, plot.md, debts.md, chapters.md, characters/, scenes/
    Failure Indicators: .novel/ not created, or created at wrong path
    Evidence: .sisyphus/evidence/task-4-default-path.txt

  Scenario: PROJECT_DIR overrides default
    Tool: Bash
    Preconditions: Set PROJECT_DIR=.test-novel in .env.local
    Steps:
      1. Restart the app
      2. curl POST /api/story with {"action":"init"}
      3. Check if .test-novel/ directory was created
    Expected Result: .test-novel/ directory exists with template files
    Failure Indicators: .novel/ created instead of .test-novel/, or neither created
    Evidence: .sisyphus/evidence/task-4-custom-path.txt

  Scenario: GM can call init_story tool when .novel/ missing
    Tool: Playwright
    Preconditions: .novel/ does not exist, app running
    Steps:
      1. Navigate to http://localhost:4477
      2. Send message "开始新故事"
      3. Wait for GM response
      4. Check if .novel/ was created
    Expected Result: GM calls init_story tool, .novel/ directory created with templates
    Failure Indicators: GM cannot initialize, .novel/ not created, error in tool call
    Evidence: .sisyphus/evidence/task-4-gm-init.png
  ```

  **Commit**: YES
  - Message: `feat(config): project path configurability + initStoryTool`
  - Files: `src/lib/project-path.ts, src/store/story-files.ts, src/app/api/narrative/route.ts, src/app/api/narrative/status/route.ts, src/app/api/story/route.ts, src/context/build-story-context.ts, src/agents/registry.ts, src/prompts/gm.ts, .env.example`
  - Pre-commit: `npx tsc --noEmit`

- [x] 5. Create custom FileSession class

  **What to do**:
  - Create `src/session/file-session.ts`:
    - Implement the `Session` interface from `@openai/agents` (study the interface in `node_modules/@openai/agents-core`)
    - Storage: JSON files in a configurable directory (e.g., `.sessions/{threadId}/`)
    - Methods: `get()`, `set()`, `delete()`, `list()` or equivalent per the Session interface
    - Each session stored as a JSON file containing the full conversation history
    - Auto-create directory on first write
    - Handle concurrent access with file locking or atomic writes
  - Create `src/session/file-session.test.ts` (basic smoke test if desired, or skip per test strategy)
  - Update `src/session/manager.ts`:
    - Replace `MemorySession` with `FileSession` for `gmSession`
    - Replace `MemorySession` with `FileSession` for `characterSessions`
    - Pass session storage directory (from project path)

  **Must NOT do**:
  - Do not use SQLiteSession (doesn't exist in SDK)
  - Do not use OpenAIConversationsSession (requires OpenAI API key, may not work with Anthropic)
  - Do not change the Session interface contract

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Need to study @openai/agents Session interface, implement all methods, handle file I/O edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Tasks 7, 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/session/manager.ts` — Current MemorySession usage to replace
  - `src/session/types.ts` — StorySession type definition

  **API/Type References**:
  - `node_modules/@openai/agents-core/dist/session.d.ts` — Session interface definition (study all methods)
  - `node_modules/@openai/agents-core/dist/session/memory.d.ts` — MemorySession implementation (reference for interface compliance)

  **WHY Each Reference Matters**:
  - `manager.ts`: Where to swap MemorySession → FileSession
  - `session.d.ts`: The exact interface to implement — must match all method signatures
  - `memory.d.ts`: Reference implementation to understand expected behavior

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: FileSession persists data across restarts
    Tool: Bash
    Preconditions: App not running
    Steps:
      1. Start app, send a message to create a session
      2. Stop app (kill process)
      3. Start app again
      4. Check if session data still exists in .sessions/ directory
      5. Verify session can be loaded (curl GET /api/narrative/status)
    Expected Result: Session JSON files exist in .sessions/, data survives restart
    Failure Indicators: .sessions/ empty after restart, or session data lost
    Evidence: .sisyphus/evidence/task-5-persistence.txt

  Scenario: FileSession handles concurrent writes safely
    Tool: Bash
    Preconditions: App running
    Steps:
      1. Send two messages rapidly in succession (within 1 second)
      2. Check session files for corruption (valid JSON)
    Expected Result: Both messages recorded, session files valid JSON
    Failure Indicators: Corrupted JSON, missing messages, or write errors
    Evidence: .sisyphus/evidence/task-5-concurrent.txt
  ```

  **Commit**: YES
  - Message: `feat(session): custom FileSession persistence backend`
  - Files: `src/session/file-session.ts, src/session/manager.ts`
  - Pre-commit: `npx tsc --noEmit`

- [x] 6. Render dynamic-tool parts with agent badges

  **What to do**:
  - In `src/components/chat/message-item.tsx`:
    - Add rendering for `part.type === "dynamic-tool"` in `renderParts()`
    - When `part.state === "input-streaming"` or `"input-available"`: show loading spinner + agent badge
    - When `part.state === "output-available"`: show agent badge + output text
    - When `part.state === "output-error"`: show error state
    - Map `part.toolName` to agent label: `call_actor` → "Actor", `call_scribe` → "Scribe", `call_archivist` → "Archivist"
    - Use `AgentLabel` component and `AGENT_COLORS` from `agent-label.tsx` for consistent styling
    - Handle `step-start` parts (return null or thin separator)
  - Create a `ToolCallPart` sub-component for rendering individual tool call parts

  **Must NOT do**:
  - Do not display full tool parameters (just agent name + state indicator)
  - Do not create separate UIMessage objects
  - Do not modify the progress indicator logic (that was fixed in Task 1)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component creation with specific visual design (agent badges, loading states)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/components/chat/message-item.tsx:34-52` — `renderParts()` function to extend
  - `src/components/chat/agent-label.tsx` — `AgentLabel` component and `AGENT_COLORS` to reuse
  - `src/components/chat/progress-indicator.tsx` — Existing progress UI patterns

  **API/Type References**:
  - `node_modules/ai/dist/index.d.ts` — `DynamicToolUIPart` with `toolName`, `state`, `input`, `output` fields

  **WHY Each Reference Matters**:
  - `message-item.tsx:34-52`: Where to add dynamic-tool rendering
  - `agent-label.tsx`: Existing styled component to reuse for consistent agent badges
  - `DynamicToolUIPart`: The exact type structure for tool call parts

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Tool calls show agent badges instead of blank lines
    Tool: Playwright
    Preconditions: App running, .novel/ initialized
    Steps:
      1. Send a message that triggers call_actor (e.g., "塞莉娅做了一个决定")
      2. Wait for response to complete
      3. Check for "Actor" badge/label in the message
      4. Verify NO blank lines in the message area
    Expected Result: Agent badge visible with correct name and color, no blank lines
    Failure Indicators: Blank lines still present, or no agent badge visible
    Evidence: .sisyphus/evidence/task-6-agent-badge.png

  Scenario: Tool call shows loading state during streaming
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Send a message that triggers multi-step agent response
      2. While streaming, observe the tool call part
    Expected Result: Loading indicator visible for in-progress tool calls
    Failure Indicators: No loading state, or tool call appears only after completion
    Evidence: .sisyphus/evidence/task-6-loading-state.png
  ```

  **Commit**: YES
  - Message: `feat(chat): render dynamic-tool parts with agent badges`
  - Files: `src/components/chat/message-item.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [x] 7. Wire characterSessions + execution log capture

  **What to do**:
  - **First**: Verify if `asTool()` supports a `session` option by reading its type definition in `node_modules/@openai/agents-core/dist/agent.d.ts` or similar
  - **If asTool() supports session**: Wire `characterSessions` to each sub-agent's `asTool()` call in `registry.ts`
  - **If asTool() does NOT support session**: Implement alternative approach — wrap `asTool()` calls with custom tool functions that internally call `Runner.run(agent, input, { session })` and capture the full `AgentRunResult`
  - Create `src/session/execution-log.ts`:
    - Define `ExecutionLog` type: `{ agentName, toolCallId, input, output, toolCalls[], timestamp, duration, tokenUsage? }`
    - Create `ExecutionLogStore` — in-memory Map keyed by threadId, stores array of ExecutionLog entries
    - Capture execution data from each sub-agent run (either via asTool hooks or custom wrapper)
  - Update `src/session/manager.ts`:
    - Add `executionLogs: Map<string, ExecutionLog[]>` to StorySession
    - Add `addExecutionLog(threadId, log)` and `getExecutionLogs(threadId)` methods
  - Consider: Re-enable tracing selectively (`setTracingDisabled(false)`) or keep disabled and rely on execution log capture

  **Must NOT do**:
  - Do not modify `customOutputExtractor` (it doesn't discard trace data)
  - Do not build the session viewer UI yet (Task 11)
  - Do not create API endpoints yet (Task 10)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Need to investigate asTool() API, design execution log capture, wire sessions — complex
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8)
  - **Blocks**: Task 10
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `src/agents/registry.ts` — asTool() registration with customOutputExtractor
  - `src/session/manager.ts` — StorySession with characterSessions (dead code to activate)
  - `src/session/types.ts` — StorySession type

  **API/Type References**:
  - `node_modules/@openai/agents-core/dist/agent.d.ts` — asTool() type signature (CHECK for session option)
  - `node_modules/@openai/agents-core/dist/run.d.ts` — Runner.run() options (has session parameter)
  - `node_modules/@openai/agents-core/dist/result.d.ts` — AgentRunResult type (what data is available)

  **WHY Each Reference Matters**:
  - `registry.ts`: Where asTool() calls are made — may need to add session option or replace with custom wrapper
  - `agent.d.ts`: MUST CHECK — determines whether asTool() supports session or needs workaround
  - `result.d.ts`: What execution data can be captured from agent runs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Execution logs captured for sub-agent runs
    Tool: Bash (curl)
    Preconditions: App running, .novel/ initialized
    Steps:
      1. Send a message that triggers call_actor
      2. After response completes, check execution log store (via future API or debug endpoint)
    Expected Result: Execution log entry exists with agentName="Actor", input/output recorded, timestamp present
    Failure Indicators: No execution log entries, or missing input/output data
    Evidence: .sisyphus/evidence/task-7-exec-log.txt

  Scenario: Character sessions persist across calls
    Tool: Bash (curl)
    Preconditions: App running
    Steps:
      1. Send "塞莉娅说话" (triggers call_actor for 塞莉娅)
      2. Send "塞莉娅继续" (triggers call_actor for 塞莉娅 again)
      3. Check if second call has context from first call
    Expected Result: Actor(塞莉娅) second call references previous dialogue history
    Failure Indicators: Actor starts fresh each time with no memory of previous call
    Evidence: .sisyphus/evidence/task-7-session-reuse.txt
  ```

  **Commit**: YES
  - Message: `feat(session): wire characterSessions + execution log capture`
  - Files: `src/agents/registry.ts, src/session/manager.ts, src/session/execution-log.ts, src/session/types.ts`
  - Pre-commit: `npx tsc --noEmit`

- [x] 8. Clean up .novel_backup + update .gitignore

  **What to do**:
  - Remove `.novel_backup/` directory (contains only template duplicates, no code references it)
  - Update `.gitignore`: Add `.sessions/` directory (FileSession data), add `.archive/` directory
  - Verify `.novel/` is still in `.gitignore` (it is, line 44)

  **Must NOT do**:
  - Do not remove `.novel/` from `.gitignore`
  - Do not delete any actual story data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file deletion and gitignore update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `.gitignore:44` — Current `.novel/` entry
  - `.novel_backup/` — Directory to remove

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: .novel_backup removed, gitignore updated
    Tool: Bash
    Preconditions: None
    Steps:
      1. Check that .novel_backup/ does not exist
      2. Check .gitignore contains .sessions/ and .archive/
    Expected Result: .novel_backup/ gone, .gitignore has new entries
    Failure Indicators: .novel_backup/ still exists, or .gitignore missing entries
    Evidence: .sisyphus/evidence/task-8-cleanup.txt
  ```

  **Commit**: YES
  - Message: `chore: clean up .novel_backup and update .gitignore`
  - Files: `.gitignore`
  - Pre-commit: none

- [x] 9. Multi-bubble step splitting

  **What to do**:
  - Create `src/components/chat/message-segments.tsx`:
    - Implement `splitBySteps(message: UIMessage): Segment[]` function
    - Segment type: `{ agent: string, parts: UIMessagePart[], toolCallId?: string }`
    - Algorithm: Split parts array at `step-start` boundaries; each segment's agent determined by the preceding `dynamic-tool` part's `toolName`
    - Map toolName to agent: `call_actor` → "Actor", `call_scribe` → "Scribe", `call_archivist` → "Archivist", default → "GM"
  - Refactor `src/components/chat/message-item.tsx`:
    - For assistant messages with multiple segments, render each segment as an independent bubble div
    - Each bubble: same styling (rounded, padding) + `AgentLabel` badge at top-left + segment's text content
    - Bubbles spaced with `space-y-2` or similar
    - For single-segment messages (no step-start), render as before (no visual change)
  - Update `src/components/chat/message-list.tsx`:
    - Import and use segment splitting for assistant messages
  - Handle streaming: New `step-start` arriving during streaming should create a new bubble immediately (natural with reactive rendering)

  **Must NOT do**:
  - Do not create separate UIMessage objects (splitting is render-only)
  - Do not add step approval, retry, or editing functionality
  - Do not change the message data structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component refactoring with specific visual design (independent bubbles, agent labels)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 10)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 6

  **References**:

  **Pattern References**:
  - `src/components/chat/message-item.tsx` — Current single-bubble rendering to refactor
  - `src/components/chat/message-list.tsx` — Message list to update
  - `src/components/chat/agent-label.tsx` — AgentLabel component to use per-segment

  **API/Type References**:
  - `node_modules/ai/dist/index.d.ts` — `StepStartUIPart` with `type: 'step-start'`, `DynamicToolUIPart`

  **WHY Each Reference Matters**:
  - `message-item.tsx`: Core file to refactor — from single bubble to multi-bubble
  - `StepStartUIPart`: The boundary marker that enables splitting
  - `agent-label.tsx`: Reuse for per-segment agent badges

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Multi-step response renders as separate bubbles
    Tool: Playwright
    Preconditions: App running, .novel/ initialized
    Steps:
      1. Send a message that triggers full pipeline (GM → Actor → Scribe → Archivist)
      2. Wait for complete response
      3. Count distinct bubble/segment elements in the assistant message area
    Expected Result: Multiple distinct bubbles visible, each with an agent label (GM, Actor, Scribe, Archivist)
    Failure Indicators: All content in one monolithic bubble, or missing agent labels
    Evidence: .sisyphus/evidence/task-9-multi-bubble.png

  Scenario: Single-step response renders as single bubble (no regression)
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Send "你好" (simple greeting, no tool calls)
      2. Observe the response
    Expected Result: Single bubble with GM response, no splitting artifacts
    Failure Indicators: Unnecessary splitting, empty bubbles, or visual glitches
    Evidence: .sisyphus/evidence/task-9-single-bubble.png

  Scenario: New bubble appears during streaming when step starts
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Send a message that triggers multi-step response
      2. While streaming, observe new bubbles appearing
    Expected Result: New bubble appears when a new step starts during streaming
    Failure Indicators: All content appears in one bubble until streaming completes
    Evidence: .sisyphus/evidence/task-9-streaming-split.png
  ```

  **Commit**: YES
  - Message: `feat(chat): multi-bubble step splitting`
  - Files: `src/components/chat/message-segments.tsx, src/components/chat/message-item.tsx, src/components/chat/message-list.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [x] 10. Session execution log API endpoints

  **What to do**:
  - Create `src/app/api/sessions/route.ts`:
    - `GET /api/sessions?threadId=xxx` — list execution logs for a thread
    - Returns array of `ExecutionLog` entries with agentName, toolCallId, input summary, output preview, timestamp, duration
  - Create `src/app/api/sessions/[logId]/route.ts`:
    - `GET /api/sessions/[logId]?threadId=xxx` — get full execution log detail
    - Returns complete ExecutionLog with full input, full output, all tool calls, token usage
  - Add input validation (threadId required, logId format check)

  **Must NOT do**:
  - Do not build the Modal UI yet (Task 11)
  - Do not add write/delete endpoints (read-only for now)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API route creation with data model, validation, and integration with execution log store
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 9)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 5, 7

  **References**:

  **Pattern References**:
  - `src/app/api/narrative/status/route.ts` — Existing API route pattern to follow
  - `src/session/execution-log.ts` — ExecutionLog type and store (created in Task 7)

  **WHY Each Reference Matters**:
  - `status/route.ts`: Pattern for Next.js API route with error handling
  - `execution-log.ts`: Data source for the API endpoints

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: GET /api/sessions returns execution logs
    Tool: Bash (curl)
    Preconditions: App running, at least one multi-step conversation completed
    Steps:
      1. curl GET /api/sessions?threadId=<existingThreadId>
    Expected Result: JSON array with execution log entries, each having agentName, timestamp, etc.
    Failure Indicators: Empty array, 404, or 500 error
    Evidence: .sisyphus/evidence/task-10-list-logs.txt

  Scenario: GET /api/sessions/[logId] returns full log detail
    Tool: Bash (curl)
    Preconditions: Execution logs exist
    Steps:
      1. curl GET /api/sessions/<logId>?threadId=<threadId>
    Expected Result: Full ExecutionLog with complete input, output, tool calls
    Failure Indicators: 404, or truncated output
    Evidence: .sisyphus/evidence/task-10-log-detail.txt
  ```

  **Commit**: YES
  - Message: `feat(api): session execution log endpoints`
  - Files: `src/app/api/sessions/route.ts, src/app/api/sessions/[logId]/route.ts`
  - Pre-commit: `npx tsc --noEmit`

- [x] 11. Subagent session Modal UI

  **What to do**:
  - Create `src/components/chat/session-modal.tsx`:
    - Modal/Dialog component triggered by a button on each message bubble
    - Fetch execution logs from `/api/sessions?threadId=xxx` on open
    - Display list of sub-agent executions in the Modal
    - Each entry shows: agent name (with color badge), timestamp, duration, input summary
    - Click an entry to expand and see full output + tool calls
    - Use shadcn/ui Dialog component for the Modal
  - Add trigger button to `message-item.tsx`:
    - Small icon button (e.g., info/eye icon) on assistant messages that have tool calls
    - Only visible when `dynamic-tool` parts exist in the message
    - Opens the SessionModal on click
  - Pass `threadId` from page context down to MessageList → MessageItem

  **Must NOT do**:
  - Do not add write/delete functionality to the Modal
  - Do not implement real-time log streaming (fetch on open is sufficient)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component creation with Modal, data fetching, expandable sections
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential)
  - **Blocks**: None
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `src/components/chat/agent-label.tsx` — AgentLabel component to reuse in Modal
  - `src/components/ui/` — shadcn/ui Dialog component for Modal

  **API/Type References**:
  - `src/app/api/sessions/route.ts` — API endpoint to fetch execution logs (created in Task 10)
  - `src/session/execution-log.ts` — ExecutionLog type

  **WHY Each Reference Matters**:
  - `agent-label.tsx`: Consistent agent styling in the Modal
  - `sessions/route.ts`: Data source for the Modal content
  - `ui/ Dialog`: shadcn/ui component for Modal implementation

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Session Modal opens and shows execution logs
    Tool: Playwright
    Preconditions: App running, multi-step conversation completed
    Steps:
      1. Find a message with tool calls (has info/eye button)
      2. Click the session detail button
      3. Wait for Modal to open and data to load
      4. Verify execution log entries are visible
    Expected Result: Modal opens with list of sub-agent executions (Actor, Scribe, Archivist)
    Failure Indicators: Modal doesn't open, no data, or error message
    Evidence: .sisyphus/evidence/task-11-modal-open.png

  Scenario: Expand execution log to see full details
    Tool: Playwright
    Preconditions: Modal open with execution logs
    Steps:
      1. Click on an Actor execution log entry
      2. Verify expanded view shows full output text
    Expected Result: Full Actor output visible in expanded section
    Failure Indicators: Output truncated, or expand doesn't work
    Evidence: .sisyphus/evidence/task-11-expand-detail.png

  Scenario: Modal shows empty state when no execution logs
    Tool: Playwright
    Preconditions: App running, simple conversation (no tool calls)
    Steps:
      1. Find a message without tool calls
      2. Verify no session detail button visible
    Expected Result: No session detail button on messages without tool calls
    Failure Indicators: Button visible but Modal empty, or button on wrong messages
    Evidence: .sisyphus/evidence/task-11-no-logs.png
  ```

  **Commit**: YES
  - Message: `feat(chat): subagent session Modal viewer`
  - Files: `src/components/chat/session-modal.tsx, src/components/chat/message-item.tsx`
  - Pre-commit: `npx tsc --noEmit`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, abort during streaming, missing .novel/. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `fix(chat): correct dynamic-tool part type handling` - message-item.tsx, message-list.tsx
- **Wave 1**: `feat(chat): add stop/abort functionality` - page.tsx, chat-input.tsx, route.ts
- **Wave 1**: `feat(chat): multi-line textarea input` - chat-input.tsx
- **Wave 1**: `feat(config): project path configurability + initStoryTool` - story-files.ts, registry.ts, routes
- **Wave 1**: `feat(session): custom FileSession persistence backend` - session/file-session.ts
- **Wave 2**: `feat(chat): render dynamic-tool parts with agent badges` - message-item.tsx
- **Wave 2**: `feat(session): wire characterSessions + execution log capture` - registry.ts, session/
- **Wave 2**: `chore: clean up .novel_backup` - .novel_backup/, .gitignore
- **Wave 3**: `feat(chat): multi-bubble step splitting` - message-item.tsx, message-list.tsx
- **Wave 3**: `feat(api): session execution log endpoints` - api/sessions/
- **Wave 4**: `feat(chat): subagent session Modal viewer` - session-modal.tsx

---

## Success Criteria

### Verification Commands
```bash
bun run build  # Expected: successful build with no errors
```

### Final Checklist
- [ ] Stop 按钮在 streaming 时可见且可点击
- [ ] 工具调用显示 agent 标签而非空白行
- [ ] 多步骤响应拆分为独立气泡
- [ ] 输入框支持多行 + 自动增长
- [ ] .novel/ 自动初始化
- [ ] PROJECT_DIR 可配置
- [ ] Subagent 执行日志可查看
- [ ] Session 数据持久化
