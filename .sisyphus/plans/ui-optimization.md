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

- [ ] 1. Fix dynamic-tool part type check

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

- [ ] 2. Add stop/abort functionality

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

- [ ] 3. Replace input with auto-resize textarea

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

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, abort during streaming, missing .novel/. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
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
