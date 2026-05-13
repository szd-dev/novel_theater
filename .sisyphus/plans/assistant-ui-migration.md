# assistant-ui Frontend Migration: Phase 0-4

## TL;DR

> **Quick Summary**: 将自由剧场前端从自定义聊天 UI（`useChat` + 手写 MessageList/ChatInput）迁移到 assistant-ui v0.14 体系，覆盖设计对齐、运行时替换、消息列表、工具渲染和面板整合，保留 Lexical 输入框不动。
>
> **Deliverables**:
> - assistant-ui `Thread` 组件替代手写 `MessageList`
> - 10+ 自定义组件图标迁移到 `lucide-react`，CSS 统一到 assistant-ui 设计语言
> - `useChatRuntime` + `AssistantChatTransport` 替代 `useChat` + `DefaultChatTransport`
> - `ThreadHistoryAdapter` 对接现有 `/api/narrative` 持久化
> - `makeAssistantToolUI` for `submit_schedule` 工具渲染（含进度条）
> - 自定义 `MessagePrimitive.Parts` 处理 `dynamic-tool` parts + Agent 分段
> - ToolDetailSheet / FileEditorSheet 视觉对齐
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves + pre-spike + final verification
> **Critical Path**: Spike S1 → T1 → T6 → T8 → T10 → T12 → T18 → F1-F4

---

## Context

### Original Request
用户要求使用 assistant-ui 重构整个前端页面（Phase 0-4），暂不动 Lexical 输入框（Phase 5 延后）。同时要求 ProjectSelector、StoryFileTree、ToolDetailSheet 等自定义组件视觉与 assistant-ui 保持一致。

### Interview Summary

**Key Discussions**:
- **Phase 0**: 设计对齐 — 图标迁移到 `lucide-react`，CSS 类名统一（`rounded-lg`、`px-3 py-2`、`data-active`、去掉 `uppercase tracking-wider`）
- **Phase 1**: 运行时替换 — `useChatRuntime` + `AssistantChatTransport` + `AssistantRuntimeProvider`
- **Phase 2**: 消息列表 — 脚手架 `Thread` 组件，自定义 `MessagePrimitive.Parts`
- **Phase 3**: 工具渲染 — `makeAssistantToolUI` for `submit_schedule`（唯一产生前端可见 tool parts 的工具）
- **Phase 4**: 面板对齐 — ToolDetailSheet、FileEditorSheet 视觉统一
- **测试策略**: 无单元测试，Playwright QA 场景验证
- **后端不变**: `/api/narrative` 端点、OpenAI Agents pipeline 完全不动

**Research Findings**:
- assistant-ui v0.14 + react-ai-sdk v1.3.23，兼容现有 `ai@^6` 和 `@ai-sdk/react@^3`
- `AssistantChatTransport` 支持 `body` 传参 projectId，但会额外发送 `system` + `tools` 字段到后端
- assistant-ui 和 shadcn 共享 Tailwind CSS v4 设计变量体系（颜色变量完全一致）
- `lucide-react` v1.11.0 已安装，无需额外依赖

### Metis Review — Critical Findings Incorporated

| Finding | Impact | Resolution |
|---|---|---|
| **仅 `submit_schedule` 产生前端可见 tool parts** | Phase 3 只需 1 个 `makeAssistantToolUI`，不是 13 个 | 已修正：Actor/Scribe/Archivist 可见性通过 `step-start` 分段处理 |
| **`ThreadHistoryAdapter` 必须实现 `withFormat`** | `useChatRuntime` 运行时抛错若缺少 | 已修正：T5 强制实现 `withFormat` 委托 |
| **`AssistantChatTransport` 自动发送 `system` + `tools`** | 后端 route.ts 只解构 `{ messages, projectId }` | Spike S1 验证兼容性，必要时更新后端忽略多余字段 |
| **自定义 part type 必须用 `data-*` 前缀** | assistant-ui 静默跳过未知 part 类型 | T7 实现 `dynamic-tool` → `data-dynamic-tool` 预处理 |

---

## Work Objectives

### Core Objective
用 assistant-ui 的 `Thread` 组件、`MessagePrimitive`、`makeAssistantToolUI` 替换手写聊天 UI，同时让所有自定义组件视觉与 assistant-ui 保持一致。

### Concrete Deliverables
- `src/components/assistant-ui/thread.tsx` — 定制的 Thread 组件
- `src/components/assistant-ui/markdown-text.tsx` — Markdown 渲染
- `src/components/assistant-ui/tool-fallback.tsx` — 工具回退 UI
- `src/components/chat/chat-runtime-provider.tsx` — Runtime 包装组件
- `src/components/chat/history-adapter.ts` — ThreadHistoryAdapter 实现
- `src/components/chat/part-preprocessor.ts` — dynamic-tool → data-dynamic-tool 转换
- `src/components/chat/submit-schedule-ui.tsx` — submit_schedule 工具 UI
- 更新 `src/app/page.tsx` — 集成 AssistantRuntimeProvider + Thread
- 更新 `src/components/chat/project-selector.tsx` — 图标 + CSS 对齐
- 更新 `src/components/chat/story-file-tree.tsx` — 图标 + CSS 对齐
- 更新 `src/components/chat/scene-indicator.tsx` — 图标 + CSS 对齐
- 更新 `src/components/chat/tool-detail-sheet.tsx` — CSS 对齐
- 更新 `src/components/chat/file-editor-sheet.tsx` — CSS 对齐
- 更新 `src/components/chat/tool-meta.ts` — emoji → lucide 图标（保持 color/agentKey 不变）

### Definition of Done
- [ ] `bun run build` 无错误
- [ ] `bun dev` 启动后页面正常渲染，聊天功能可用
- [ ] 所有 Playwright QA 场景通过
- [ ] 所有自定义组件视觉与 assistant-ui Thread 组件一致

### Must Have
- assistant-ui Thread 组件替代 MessageList
- `useChatRuntime` + `AssistantChatTransport` 替代 `useChat`
- `ThreadHistoryAdapter.withFormat` 实现消息持久化
- 自定义 `MessagePrimitive.Parts` 处理 `dynamic-tool` parts
- `makeAssistantToolUI` for `submit_schedule`（含进度条）
- 全部自定义组件图标迁移到 `lucide-react`
- 全部自定义组件 CSS 统一到 assistant-ui 风格

### Must NOT Have (Guardrails)
- **MUST NOT** 修改后端 `route.ts` 的 part type 命名（后端流格式是契约，前端适配）
- **MUST NOT** 注册 `makeAssistantToolUI` for Actor/Scribe/Archivist 工具（这些工具不产生前端可见 tool parts）
- **MUST NOT** 改变 `tool-meta.ts` 的 color/agentKey/category 结构（仅替换图标）
- **MUST NOT** 迁移 Lexical 输入框（Phase 5 延后）
- **MUST NOT** 移除现有 shadcn/ui Sheet 组件（assistant-ui 无等价物）
- **MUST NOT** 引入新的状态管理库（保持 prop drilling）
- **MUST NOT** 实现 `ThreadHistoryAdapter` 时不包含 `withFormat`（运行时抛错）

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed via Playwright.

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: NO — user chose Playwright QA only
- **Framework**: N/A for this migration

### QA Policy
Every task includes agent-executed Playwright QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.png`.

- **Frontend/UI**: Playwright opens browser at `http://localhost:4477`, navigates, interacts, asserts DOM, screenshots
- **API**: Bash (curl) to verify persistence endpoints still work

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Pre-Implementation Spike — sequential, must complete first):
├── S1: Transport + part type compatibility verification [deep]

Wave 1 (Foundation — MAX PARALLEL after Wave 0):
├── T1: Install packages + CLI scaffolding [quick]
├── T2: Icon migration — all custom components [quick]
├── T3: CSS alignment — all custom components [quick]
├── T4: Runtime replacement — useChatRuntime + AssistantRuntimeProvider [deep]
├── T5: ThreadHistoryAdapter with withFormat [deep]
├── T6: Thread component scaffolding + customization [visual-engineering]
├── T7: dynamic-tool preprocessing wrapper [deep]
└── T8: MessagePrimitive.Parts — agent segmentation [deep]

Wave 2 (Tool + Integration — after Wave 1, MAX PARALLEL):
├── T9: MarkdownText + ToolFallback integration [quick]
├── T10: makeAssistantToolUI for submit_schedule [visual-engineering]
├── T11: Submit schedule progress bar [visual-engineering]
├── T12: Tool click → ToolDetailSheet wire-up [quick]
├── T13: ToolDetailSheet visual alignment [visual-engineering]
└── T14: FileEditorSheet visual alignment [visual-engineering]

Wave 3 (Final Integration — after Wave 2):
├── T15: SceneIndicator + status polling migration [quick]
├── T16: Stop/Cancel via ComposerPrimitive [quick]
├── T17: ProjectSelector + StoryFileTree final verification [visual-engineering]
└── T18: End-to-end smoke test + cleanup [deep]

Wave FINAL (After ALL — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Playwright QA (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: S1 → T1 → T6 → T8 → T10 → T12 → T18 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 8 (Wave 1)
```

### Agent Dispatch Summary

- **0**: **1** — S1 → `deep`
- **1**: **8** — T1-T3 → `quick`, T4-T5 → `deep`, T6 → `visual-engineering`, T7-T8 → `deep`
- **2**: **6** — T9 → `quick`, T10-T11 → `visual-engineering`, T12 → `quick`, T13-T14 → `visual-engineering`
- **3**: **4** — T15-T16 → `quick`, T17 → `visual-engineering`, T18 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

### Wave 0: Pre-Implementation Spike

- [x] S1. Transport + Part Type Compatibility Verification

  **What to do**:
  - Install `@assistant-ui/react@^0.14` and `@assistant-ui/react-ai-sdk@^1.3` in a test branch
  - Create a minimal `AssistantRuntimeProvider` + `useChatRuntime` + `AssistantChatTransport({ api: "/api/narrative", body: { projectId } })` wrapper
  - Send a test message through the pipeline, log ALL received parts to console
  - Verify: (a) streaming works end-to-end, (b) no errors from extra `system`/`tools` fields sent by `AssistantChatTransport`, (c) confirm `dynamic-tool` parts exist and what their structure looks like in assistant-ui's `UIMessage` format
  - If backend rejects extra fields: update `route.ts` to destructure and ignore `system`/`tools`
  - Record all part type names encountered for use in T7/T8

  **Must NOT do**:
  - Do NOT modify the part type names in the backend
  - Do NOT start full migration until this spike passes

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful investigation of streaming protocol compatibility
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — direct exploration task

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential, blocks all other tasks)
  - **Parallel Group**: Wave 0
  - **Blocks**: All other tasks
  - **Blocked By**: None

  **References**:
  - `src/app/api/narrative/route.ts:26` — Backend request body destructuring (only `messages` + `projectId`)
  - `src/app/page.tsx:45-70` — Current `useChat` + `DefaultChatTransport` setup
  - `https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6` — useChatRuntime + AssistantChatTransport setup pattern

  **Acceptance Criteria**:
  - [ ] Console log shows all part types received during streaming
  - [ ] No transport-level errors (500s, CORS, etc.)
  - [ ] Documented report: which extra fields backend receives, whether they cause issues, full part type inventory

  **QA Scenarios**:

  ```
  Scenario: Transport compatibility — send message and receive stream
    Tool: Playwright
    Preconditions: dev server running, project selected, runtime wrapper in place
    Steps:
      1. Navigate to http://localhost:4477
      2. Select or create a project
      3. Type "你好" in the input and press Enter
      4. Wait for streaming response (timeout: 30s)
      5. Check browser console for part type log output
      6. Assert no fetch/network errors in console
    Expected Result: Stream completes, all parts logged, no transport errors
    Failure Indicators: 500 errors, "Failed to fetch", stream hangs
    Evidence: .sisyphus/evidence/s1-transport-compat.png

  Scenario: Verify part type inventory
    Tool: Bash (grep console output)
    Preconditions: S1 happy path scenario completed
    Steps:
      1. Check console log output for part type list
      2. Assert "dynamic-tool" is in the part type list
      3. Assert "text" is in the part type list
      4. Assert "step-start" is in the part type list
    Expected Result: Complete inventory of all part types encountered
    Evidence: .sisyphus/evidence/s1-part-types.txt
  ```

  **Evidence to Capture:**
  - [ ] Browser screenshot showing successful stream
  - [ ] Part type inventory text file

  **Commit**: YES (groups with S1)
  - Message: `spike(ui): verify assistant-ui transport compatibility with /api/narrative`
  - Files: spike code (revert after), documentation

---

### Wave 1: Foundation

- [x] T1. Install Packages + CLI Scaffolding

  **What to do**:
  - Run `bun add @assistant-ui/react@^0.14 @assistant-ui/react-ai-sdk@^1.3`
  - Run `npx assistant-ui@latest add thread` → creates `src/components/assistant-ui/thread.tsx`
  - Run `npx assistant-ui@latest add markdown-text` → creates `src/components/assistant-ui/markdown-text.tsx`
  - Run `npx assistant-ui@latest add tool-fallback` → creates `src/components/assistant-ui/tool-fallback.tsx`
  - Verify `bun run build` still succeeds
  - Verify `bun dev` starts without errors

  **Must NOT do**:
  - Do NOT remove `@ai-sdk/react` or `ai` packages (still needed)
  - Do NOT modify the scaffolded files yet (customization in T6/T9)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward install + CLI commands
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — trivial setup task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T6, T9, T10
  - **Blocked By**: S1

  **References**:
  - `package.json` — Current dependencies
  - `https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6#install-dependencies` — Package list
  - `https://www.assistant-ui.com/docs/ui/thread` — Thread component scaffolding
  - `https://www.assistant-ui.com/docs/ui/markdown` — MarkdownText scaffolding

  **Acceptance Criteria**:
  - [ ] `@assistant-ui/react@^0.14` in package.json
  - [ ] `@assistant-ui/react-ai-sdk@^1.3` in package.json
  - [ ] `src/components/assistant-ui/thread.tsx` exists
  - [ ] `src/components/assistant-ui/markdown-text.tsx` exists
  - [ ] `src/components/assistant-ui/tool-fallback.tsx` exists
  - [ ] `bun run build` passes

  **QA Scenarios**:

  ```
  Scenario: Verify build after install
    Tool: Bash
    Preconditions: packages installed
    Steps:
      1. Run: bun run build
      2. Assert exit code 0
    Expected Result: Build succeeds without errors
    Failure Indicators: Build errors, missing dependencies
    Evidence: .sisyphus/evidence/t1-build-success.txt
  ```

  **Evidence to Capture:**
  - [ ] Build output log

  **Commit**: YES (groups with T1)
  - Message: `chore(ui): install @assistant-ui/react and @assistant-ui/react-ai-sdk, scaffold thread/markdown/tool-fallback`
  - Files: `package.json`, `bun.lockb`, `src/components/assistant-ui/*`
  - Pre-commit: `bun run build`

- [x] T2. Icon Migration — All Custom Components

  **What to do**:
  - Replace all inline SVG icons in custom components with `lucide-react` equivalents:
    - `project-selector.tsx`: Plus (`+`), Check (confirm delete), Trash2 (delete) → `<Plus className="size-4" />`, `<Check className="size-4" />`, `<Trash2 className="size-4" />`
    - `story-file-tree.tsx`: ChevronRight, RefreshCw, FileText, Folder, Users, Clapperboard → `<ChevronRight className="size-3" />`, `<RefreshCw className="size-3" />`, `<FileText className="size-4" />`, `<Folder className="size-4" />`, `<Users className="size-4" />`, `<Clapperboard className="size-4" />`
    - `scene-indicator.tsx`: MapPin, ClipboardList → `<MapPin className="size-3.5" />`, `<ClipboardList className="size-3.5" />`
    - `tool-detail-sheet.tsx`: Keep emoji icons as-is (checkmark ✓, warning ⚠)
    - `file-editor-sheet.tsx`: Save, AlertTriangle → `<Save className="size-4" />`, `<AlertTriangle className="size-4" />`
    - `tool-meta.ts`: Replace emoji icons with lucide icon name strings — `Calendar` for 📅, `FileText` for 📄, `Pencil` for ✏️, `Search` for 🔍, `User` for 👤, `Drama` for 🎭, `ScrollText` for 📝, `Film` for 🎬, `Globe` for 🌍, `BookOpen` for 📖, `Clock` for ⏳, `Link` for 🔗, `Wrench` for 🔧
  - Update `tool-tag.tsx` to render lucide icon components instead of emoji strings from tool-meta

  **Must NOT do**:
  - Do NOT change `tool-meta.ts` color/agentKey/category values
  - Do NOT change icon sizes beyond `size-3`/`size-3.5`/`size-4` (consistent with assistant-ui)
  - Do NOT remove `AGENT_COLORS` or `AGENT_NAMES` constants

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward icon replacement, no logic changes
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — simple replacement task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: None
  - **Blocked By**: S1

  **References**:
  - `src/components/chat/project-selector.tsx` — Inline SVG icons
  - `src/components/chat/story-file-tree.tsx` — Inline SVG icons + emoji icons
  - `src/components/chat/scene-indicator.tsx` — Emoji icons
  - `src/components/chat/tool-tag.tsx` — Renders tool-meta icon strings
  - `src/components/chat/tool-meta.ts` — All emoji icon definitions
  - `node_modules/lucide-react` — Already installed v1.11.0

  **Acceptance Criteria**:
  - [ ] All inline SVG `<svg>` elements replaced with lucide-react components
  - [ ] All emoji icon strings in `tool-meta.ts` replaced with lucide icon name strings
  - [ ] `tool-tag.tsx` renders lucide icons instead of emoji characters
  - [ ] `bun run build` passes

  **QA Scenarios**:

  ```
  Scenario: Verify icons render correctly
    Tool: Playwright
    Preconditions: dev server running, project selected
    Steps:
      1. Navigate to http://localhost:4477
      2. Select a project
      3. Assert: sidebar "+" button renders (Plus icon visible)
      4. Assert: file tree chevron and refresh icons render
      5. Send a message that triggers tools
      6. Assert: tool tags show lucide icons, not emoji
    Expected Result: All icons visible, no broken images, no emoji in tool tags
    Failure Indicators: Missing icons, emoji characters still present
    Evidence: .sisyphus/evidence/t2-icons-sidebar.png, .sisyphus/evidence/t2-icons-tools.png
  ```

  **Evidence to Capture:**
  - [ ] Sidebar with icons screenshot
  - [ ] Tool tags with new icons screenshot

  **Commit**: YES (groups with T2)
  - Message: `refactor(ui): migrate icons from inline SVG/emoji to lucide-react`
  - Files: `project-selector.tsx`, `story-file-tree.tsx`, `scene-indicator.tsx`, `tool-detail-sheet.tsx`, `file-editor-sheet.tsx`, `tool-meta.ts`, `tool-tag.tsx`
  - Pre-commit: `bun run build`

- [x] T3. CSS Alignment — All Custom Components

  **What to do**:
  - Apply assistant-ui design patterns across all custom components:
    - **Section headers**: Remove `uppercase tracking-wider`, keep `text-xs font-medium text-muted-foreground`
    - **List items**: `rounded-md px-2 py-1.5` → `rounded-lg px-3 py-2`
    - **Active state**: `cn(..., isActive && "bg-muted font-medium")` → `className="hover:bg-muted data-active:bg-muted"` with `data-active` attribute
    - **Component-specific**:
      - `project-selector.tsx`: Align item spacing, add section header pattern
      - `story-file-tree.tsx`: Align item spacing, section header, collapsible trigger padding
      - `scene-indicator.tsx`: Align badge/padding to `px-3 py-2` style
      - `tool-detail-sheet.tsx`: Align internal spacing to `gap-3`/`rounded-lg` pattern
      - `file-editor-sheet.tsx`: Align toolbar buttons, tab buttons, save status indicator
      - `message-item.tsx` (if still used during transition): Align text bubble `rounded-xl` → `rounded-lg` (or keep `rounded-xl` if assistant-ui Thread component already does)
  - Use assistant-ui's `data-active` pattern for selected/active states throughout

  **Must NOT do**:
  - Do NOT change color variables (already identical between shadcn and assistant-ui)
  - Do NOT change inline `style={}` colors for agent badges (semantic colors)
  - Do NOT remove `group-hover:opacity-100` pattern (already matches assistant-ui)
  - Do NOT change component logic or behavior

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Visual consistency work requiring design judgement
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: None
  - **Blocked By**: S1

  **References**:
  - `src/components/chat/project-selector.tsx` — Section header + list items
  - `src/components/chat/story-file-tree.tsx` — Section header + collapsible items
  - `src/components/chat/scene-indicator.tsx` — Badge styling
  - `src/components/chat/tool-detail-sheet.tsx` — Internal panel spacing
  - `src/components/chat/file-editor-sheet.tsx` — Toolbar + tab buttons
  - `https://www.assistant-ui.com/docs/primitives/thread-list` — ThreadListItem styling patterns (`rounded-lg`, `data-active:bg-muted`, `px-3 py-2`)

  **Acceptance Criteria**:
  - [ ] All section headers use `text-xs font-medium text-muted-foreground` (no uppercase/tracking)
  - [ ] All list items use `rounded-lg px-3 py-2`
  - [ ] All active states use `data-active:bg-muted` pattern
  - [ ] `bun run build` passes
  - [ ] Visual comparison: custom components look like they belong in assistant-ui

  **QA Scenarios**:

  ```
  Scenario: Verify visual consistency
    Tool: Playwright
    Preconditions: dev server running, project selected
    Steps:
      1. Navigate to http://localhost:4477
      2. Select a project
      3. Screenshot the full page
      4. Assert: sidebar item spacing is consistent
      5. Assert: section headers are not uppercase
      6. Assert: active project/file has highlighted background
    Expected Result: All components visually cohesive with assistant-ui style
    Failure Indicators: Uppercase section headers, inconsistent border-radius, wrong spacing
    Evidence: .sisyphus/evidence/t3-visual-consistency.png
  ```

  **Evidence to Capture:**
  - [ ] Full page screenshot showing visual consistency

  - [x] T4. Runtime Replacement — useChatRuntime + AssistantRuntimeProvider

  **What to do**:
  - Create `src/components/chat/chat-runtime-provider.tsx`:
    ```tsx
    "use client";
    import { AssistantRuntimeProvider } from "@assistant-ui/react";
    import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";

    interface ChatRuntimeProviderProps {
      children: React.ReactNode;
      projectId: string;
    }

    export function ChatRuntimeProvider({ children, projectId }: ChatRuntimeProviderProps) {
      const runtime = useChatRuntime({
        transport: new AssistantChatTransport({
          api: "/api/narrative",
          body: { projectId },
        }),
      });
      return (
        <AssistantRuntimeProvider runtime={runtime}>
          {children}
        </AssistantRuntimeProvider>
      );
    }
    ```
  - In `page.tsx`: Replace `useChat` + `DefaultChatTransport` with `ChatRuntimeProvider` wrapper around `ProjectChat`
  - Remove: `useChat` import, `DefaultChatTransport` import, `transport` useMemo, `messages`/`status`/`sendMessage`/`stop`/`setMessages`/`error`/`clearError` destructuring
  - Keep: `sheetContent` state, `fileTreeRef`, `statusData` polling, `projectId` selection
  - Temporarily keep `MessageList` + `ChatInput` components (will be replaced in T6/T16)

  **Must NOT do**:
  - Do NOT remove `SceneIndicator` or sidebar components
  - Do NOT change `ChatInput`/Lexical code
  - Do NOT remove the `onFinish` persistence logic (will be handled by T5)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core architecture change requiring careful integration
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T5, T6, T7, T8)
  - **Blocks**: T9-T18 (all subsequent tasks)
  - **Blocked By**: S1, T1

  **References**:
  - `src/app/page.tsx` — Current ProjectChat with useChat
  - `https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6#set-up-the-frontend` — useChatRuntime pattern
  - `https://www.assistant-ui.com/docs/api-reference/integrations/react-ai-sdk` — AssistantChatTransport API
  - `https://www.assistant-ui.com/docs/api-reference/context-providers/assistant-runtime-provider` — AssistantRuntimeProvider API

  **Acceptance Criteria**:
  - [ ] `ChatRuntimeProvider` component created and exported
  - [ ] `page.tsx` uses `ChatRuntimeProvider` instead of `useChat`
  - [ ] `bun run build` passes
  - [ ] App loads without console errors
  - [ ] Message list still renders (via existing MessageList in Thread-free mode)

  **QA Scenarios**:

  ```
  Scenario: Runtime provider mounts without errors
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. Navigate to http://localhost:4477
      2. Select a project
      3. Assert: no React errors in console
      4. Assert: no "useChatRuntime" related errors
      5. Assert: sidebar and chat area render
    Expected Result: Page loads cleanly with runtime provider active
    Failure Indicators: Console errors, blank page, provider not found warnings
    Evidence: .sisyphus/evidence/t4-runtime-mount.png
  ```

  **Evidence to Capture:**
  - [ ] Browser console screenshot (clean)
  - [ ] Page rendering screenshot

  **Commit**: YES (groups with T4)
  - Message: `refactor(ui): replace useChat with useChatRuntime + AssistantRuntimeProvider`
  - Files: `src/components/chat/chat-runtime-provider.tsx`, `src/app/page.tsx`
  - Pre-commit: `bun run build`

- [x] T5. ThreadHistoryAdapter with withFormat

  **What to do**:
  - Create `src/components/chat/history-adapter.ts` implementing `ThreadHistoryAdapter`:
    - Implement `withFormat(fmt)` delegate (REQUIRED by useChatRuntime):
      - `load()`: calls `GET /api/narrative?projectId={projectId}`, maps rows through `fmt.decode()`
      - `append(item)`: calls `PUT /api/narrative` with `{ projectId, messages }`, using `fmt.encode(item)` for content
      - Uses `fmt.getId(item.message)` for message ID and `fmt.format` for format tracking
    - Implement stub `load()`/`append()` on top level (required by interface but unused by useChatRuntime — just return empty)
  - Pass adapter to `useChatRuntime` in `chat-runtime-provider.tsx`:
    ```tsx
    const runtime = useChatRuntime({
      transport: new AssistantChatTransport({ api: "/api/narrative", body: { projectId } }),
      adapters: { history: createHistoryAdapter(projectId) },
    });
    ```
  - Remove manual `onFinish` persistence and `handleStop` persistence from `page.tsx` (now handled by adapter)

  **Must NOT do**:
  - Do NOT implement without `withFormat` — useChatRuntime throws at runtime
  - Do NOT change the `/api/narrative` GET/PUT contract
  - Do NOT remove the `projectId` parameter from adapter

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding of assistant-ui persistence protocol and withFormat contract
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4, T6, T7, T8)
  - **Blocks**: None (can be done independently)
  - **Blocked By**: S1, T1

  **References**:
  - `src/app/api/narrative/route.ts:96-137` — GET + PUT persistence handlers
  - `src/session/chat-history.ts` — readChatHistory/saveChatHistory implementations
  - `https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6#persisting-chat-history` — ThreadHistoryAdapter withFormat pattern
  - `https://www.assistant-ui.com/docs/api-reference/adapters/persistence` — Persistence adapter contract

  **Acceptance Criteria**:
  - [ ] `history-adapter.ts` implements `ThreadHistoryAdapter` with `withFormat`
  - [ ] `load()` calls `GET /api/narrative` and maps through `fmt.decode()`
  - [ ] `append()` calls `PUT /api/narrative` with `fmt.encode()` output
  - [ ] `bun run build` passes
  - [ ] Messages persist across page reloads

  **QA Scenarios**:

  ```
  Scenario: Messages persist across reload
    Tool: Playwright
    Preconditions: dev server running, project selected
    Steps:
      1. Navigate to http://localhost:4477
      2. Select a project
      3. Send message "测试持久化"
      4. Wait for response
      5. Reload the page (Ctrl+R / Cmd+R)
      6. Assert: message "测试持久化" still visible
      7. Assert: AI response still visible
    Expected Result: Messages survive page reload
    Failure Indicators: Empty message list after reload, messages missing
    Evidence: .sisyphus/evidence/t5-persistence-before.png, .sisyphus/evidence/t5-persistence-after.png

  Scenario: New project starts with empty history
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. Create a new project
      2. Assert: message list is empty (shows welcome text)
    Expected Result: Clean slate for new project
    Evidence: .sisyphus/evidence/t5-new-project-empty.png
  ```

  **Evidence to Capture:**
  - [ ] Before/after reload screenshots
  - [ ] New project empty state screenshot

  **Commit**: YES (groups with T5)
  - Message: `feat(ui): implement ThreadHistoryAdapter with withFormat for message persistence`
  - Files: `src/components/chat/history-adapter.ts`, `src/components/chat/chat-runtime-provider.tsx`, `src/app/page.tsx`
  - Pre-commit: `bun run build`

- [x] T6. Thread Component Scaffolding + Customization

  **What to do**:
  - Customize the scaffolded `src/components/assistant-ui/thread.tsx`:
    - Integrate `SceneIndicator` above the message list area
    - Add project header (自由剧场 title) in the Thread layout or keep in page.tsx
    - Keep the sidebar outside Thread (Thread only handles chat area)
  - Replace `MessageList` in `page.tsx` with `<Thread />` component
  - The layout should be:
    ```
    <ChatRuntimeProvider projectId={projectId}>
      <div className="flex h-dvh">
        <aside>{/* ProjectSelector + StoryFileTree */}</aside>
        <main className="flex-1 flex flex-col">
          <SceneIndicator />
          <Thread />  {/* assistant-ui Thread replaces MessageList */}
        </main>
        <Sheet>{/* panels */}</Sheet>
      </div>
    </ChatRuntimeProvider>
    ```
  - Ensure Thread's built-in Composer renders (but does NOT interfere with our existing ChatInput — ChatInput is separate and below Thread)

  **Must NOT do**:
  - Do NOT replace ChatInput with Thread's built-in composer (keep Lexical ChatInput below Thread)
  - Do NOT move ProjectSelector or StoryFileTree into Thread
  - Do NOT remove SceneIndicator

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Layout composition and visual integration
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4, T5, T7, T8)
  - **Blocks**: T9, T10, T11, T12
  - **Blocked By**: S1, T1

  **References**:
  - `src/components/assistant-ui/thread.tsx` — Scaffolded Thread component
  - `src/app/page.tsx:180-241` — Current ProjectChat layout
  - `src/components/chat/message-list.tsx` — Current MessageList to be replaced
  - `https://www.assistant-ui.com/docs/ui/thread` — Thread component customization

  **Acceptance Criteria**:
  - [ ] `Thread` component renders in place of `MessageList`
  - [ ] Sidebar + SceneIndicator + ChatInput all still render
  - [ ] `bun run build` passes
  - [ ] Messages from useChatRuntime flow into Thread

  **QA Scenarios**:

  ```
  Scenario: Thread renders with existing messages
    Tool: Playwright
    Preconditions: dev server running, project with history selected
    Steps:
      1. Navigate to http://localhost:4477
      2. Select a project that has message history
      3. Assert: messages visible in Thread component
      4. Assert: sidebar visible on the left
      5. Assert: SceneIndicator visible above messages
      6. Assert: ChatInput visible below messages
    Expected Result: Full layout with Thread component replacing MessageList
    Failure Indicators: Missing messages, broken layout, Thread not rendering
    Evidence: .sisyphus/evidence/t6-thread-layout.png
  ```

  **Evidence to Capture:**
  - [ ] Full layout screenshot with Thread component

  **Commit**: YES (groups with T6)
  - Message: `refactor(ui): integrate assistant-ui Thread component, replace MessageList`
  - Files: `src/components/assistant-ui/thread.tsx`, `src/app/page.tsx`
  - Pre-commit: `bun run build`

- [x] T7. dynamic-tool Preprocessing Wrapper

  **What to do**:
  - Create `src/components/chat/part-preprocessor.ts`:
    - Export `preprocessParts(parts: UIMessage['parts']): UIMessage['parts']` function
    - Maps `type: "dynamic-tool"` → `type: "data"` with `name: "dynamic-tool"` and `data: { ...originalPartFields }`
    - Passes through all other part types unchanged
  - Integrate into Thread's message rendering: before `MessagePrimitive.Parts` renders, preprocess parts
  - This enables assistant-ui to handle our custom part type without backend changes

  **Must NOT do**:
  - Do NOT modify the backend to change part type names
  - Do NOT lose any fields during conversion (toolName, state, input, output, error, toolCallId)
  - Do NOT change the `isDynamicToolPart` type guard (still needed for type checking before conversion)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding of both AI SDK and assistant-ui part type systems
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4, T5, T6, T8)
  - **Blocks**: T10, T11
  - **Blocked By**: S1

  **References**:
  - `src/components/chat/types.ts` — DynamicToolPart interface
  - `src/components/chat/tool-meta.ts` — Tool metadata for part identification
  - `https://www.assistant-ui.com/docs/primitives/message-part` — MessagePartPrimitive data part handling
  - `https://www.assistant-ui.com/docs/migrations/v0-11` — ContentPart → MessagePart rename context

  **Acceptance Criteria**:
  - [ ] `preprocessParts()` converts `dynamic-tool` → `data` parts correctly
  - [ ] All original fields preserved in `data` object
  - [ ] Other part types pass through unchanged
  - [ ] Unit-level verification: call `preprocessParts` with mock parts, verify output

  **QA Scenarios**:

  ```
  Scenario: dynamic-tool parts render as data parts
    Tool: Bash (bun test for preprocessor)
    Preconditions: preprocessor function available
    Steps:
      1. Create mock parts array with dynamic-tool part
      2. Call preprocessParts(mockParts)
      3. Assert: output has part with type "data"
      4. Assert: data.name === "dynamic-tool"
      5. Assert: data.data contains original fields
    Expected Result: Conversion preserves all data
    Evidence: .sisyphus/evidence/t7-preprocessor-test.txt

  Scenario: Non-dynamic-tool parts pass through
    Tool: Bash (bun test)
    Steps:
      1. Create mock parts with text and step-start parts
      2. Call preprocessParts(mockParts)
      3. Assert: text part unchanged
      4. Assert: step-start part unchanged
    Expected Result: Only dynamic-tool parts converted
    Evidence: .sisyphus/evidence/t7-passthrough-test.txt
  ```

  **Evidence to Capture:**
  - [ ] Test output showing correct conversion

  **Commit**: YES (groups with T7)
  - Message: `feat(ui): add dynamic-tool → data part preprocessor for assistant-ui compatibility`
  - Files: `src/components/chat/part-preprocessor.ts`
  - Pre-commit: `bun run build`

- [x] T8. MessagePrimitive.Parts — Agent Segmentation

  **What to do**:
  - Customize `MessagePrimitive.Parts` children render function in Thread to:
    - Group parts by `step-start` boundaries (similar to current `splitBySteps()`)
    - Each group gets an `AgentLabel` badge showing which agent (GM/Actor/Scribe/Archivist)
    - Agent determination: for `data-dynamic-tool` parts, use `toolNameToAgentKey(part.data.toolName)` from `tool-meta.ts`
    - Text parts inherit the agent from the most recent tool part in the same step
  - Render pattern:
    ```tsx
    <MessagePrimitive.Parts>
      {({ part }) => {
        if (part.type === "step-start") {
          // Start new agent segment
          return <AgentSegmentDivider />;
        }
        if (part.type === "data" && part.name === "dynamic-tool") {
          // Agent label determined by toolName
          return <AgentLabel agent={toolNameToAgentKey(part.data.toolName)} />;
        }
        // Fallback to standard rendering
        return null; // Let registered UIs handle it
      }}
    </MessagePrimitive.Parts>
    ```

  **Must NOT do**:
  - Do NOT remove `splitBySteps()` from `message-segments.tsx` yet (keep as reference)
  - Do NOT change agent color/name definitions in `tool-meta.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex rendering logic with part grouping and agent attribution
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T4, T5, T6, T7)
  - **Blocks**: T10, T11
  - **Blocked By**: S1, T7

  **References**:
  - `src/components/chat/message-segments.tsx` — Current splitBySteps implementation
  - `src/components/chat/agent-label.tsx` — AgentLabel component with AGENT_COLORS/AGENT_NAMES
  - `src/components/chat/tool-meta.ts` — toolNameToAgentKey, AGENT_COLORS, AGENT_NAMES
  - `https://www.assistant-ui.com/docs/primitives/message` — MessagePrimitive.Parts children pattern
  - `https://www.assistant-ui.com/docs/ui/part-grouping` — Part grouping patterns

  **Acceptance Criteria**:
  - [ ] Messages with step-start parts show agent-segmented rendering
  - [ ] Agent labels match colors from AGENT_COLORS (GM=purple, Actor=pink, Scribe=amber, Archivist=green)
  - [ ] Text parts inherit correct agent attribution
  - [ ] Messages without step-start render normally

  **QA Scenarios**:

  ```
  Scenario: Agent segmentation visible in messages
    Tool: Playwright
    Preconditions: dev server running, project with multi-agent response history
    Steps:
      1. Navigate to http://localhost:4477
      2. Select project with existing multi-agent conversation
      3. Assert: Agent labels visible for different agents
      4. Assert: GM label is purple (#8B5CF6)
      5. Assert: Actor label is pink (#EC4899)
    Expected Result: Messages show color-coded agent segmentation
    Failure Indicators: No agent labels, wrong colors, messages not segmented
    Evidence: .sisyphus/evidence/t8-agent-segmentation.png
  ```

  **Evidence to Capture:**
  - [ ] Multi-agent message screenshot

   **Commit**: YES (groups with T8)
  - Message: `feat(ui): implement agent segmentation in MessagePrimitive.Parts via step-start grouping`
  - Files: `src/components/assistant-ui/thread.tsx`
  - Pre-commit: `bun run build`

---

### Wave 2: Tool + Integration

- [x] T9. MarkdownText + ToolFallback Integration

  **What to do**:
  - Wire `MarkdownText` component into Thread's `MessagePrimitive.Parts` for text part rendering
  - Wire `ToolFallback` component for any unregistered tool parts
  - In `MessagePrimitive.Parts` children, for `part.type === "text"`:
    ```tsx
    {part.type === "text" ? <MarkdownText /> : null}
    ```
  - For parts where no custom UI is registered, `ToolFallback` should render automatically via assistant-ui's registry — verify this
  - If not automatic, explicitly add ToolFallback as default for tool-call parts

  **Must NOT do**:
  - Do NOT remove agent segmentation logic from T8
  - Do NOT replace the existing text rendering for non-markdown content — MarkdownText handles both

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Wire-up existing scaffolded components
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T10, T11, T12, T13, T14)
  - **Blocks**: None
  - **Blocked By**: T6

  **References**:
  - `src/components/assistant-ui/markdown-text.tsx` — Scaffolded markdown component
  - `src/components/assistant-ui/tool-fallback.tsx` — Scaffolded fallback component
  - `https://www.assistant-ui.com/docs/ui/markdown` — MarkdownText usage
  - `https://www.assistant-ui.com/docs/ui/tool-fallback` — ToolFallback usage

  **Acceptance Criteria**:
  - [ ] Text parts render through MarkdownText
  - [ ] ToolFallback renders for any tool parts without custom UI
  - [ ] `bun run build` passes

  **QA Scenarios**:

  ```
  Scenario: Markdown text renders correctly
    Tool: Playwright
    Preconditions: dev server running, project selected
    Steps:
      1. Send message with **bold** and *italic* markdown
      2. Assert: bold text renders as bold
      3. Assert: italic text renders as italic
    Expected Result: Markdown formatting applied
    Evidence: .sisyphus/evidence/t9-markdown-render.png
  ```

  **Evidence to Capture:**
  - [ ] Markdown rendering screenshot

  **Commit**: YES (groups with T9)
  - Message: `feat(ui): integrate MarkdownText and ToolFallback into Thread message rendering`
  - Files: `src/components/assistant-ui/thread.tsx`
  - Pre-commit: `bun run build`

- [x] T10. makeAssistantToolUI for submit_schedule

  **What to do**:
  - Create `src/components/chat/submit-schedule-ui.tsx`:
    - Use `makeAssistantToolUI` with `toolName: "submit_schedule"`
    - Render function receives `{ args, result, status }`:
      - **Running**: Show "排程中..." with animated pulse dot (GM purple #8B5CF6)
      - **Complete**: Show "排程 · {character names}" with green dot + clickable to open ToolDetailSheet
      - **Error**: Show "排程失败" with red dot
    - Reuse the `getHeadlineValue` logic from `tool-meta.ts` to extract character names from `args.schedule`
  - Register the UI component inside `ChatRuntimeProvider`:
    ```tsx
    <AssistantRuntimeProvider runtime={runtime}>
      <SubmitScheduleUI />
      {children}
    </AssistantRuntimeProvider>
    ```

  **Must NOT do**:
  - Do NOT register `makeAssistantToolUI` for any other tool (Actor, Scribe, Archivist, file tools)
  - Do NOT change the `submit_schedule` tool definition in the backend
  - Do NOT duplicate the `getHeadlineValue` logic — import from `tool-meta.ts`

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Custom tool UI with visual states, progress, and interaction
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T9, T11, T12, T13, T14)
  - **Blocks**: T15
  - **Blocked By**: T6, T7, T8

  **References**:
  - `src/components/chat/tool-tag.tsx` — Current ToolTag rendering for submit_schedule (state colors, headline extraction)
  - `src/components/chat/tool-meta.ts:34-42` — submit_schedule ToolMeta (color: #8B5CF6, headlineParam: "schedule")
  - `src/components/chat/agent-label.tsx` — AgentLabel pattern for colored badges
  - `https://www.assistant-ui.com/docs/guides/tools#component-based-apis` — makeAssistantToolUI API
  - `https://www.assistant-ui.com/docs/copilots/make-assistant-tool-ui` — makeAssistantToolUI reference

  **Acceptance Criteria**:
  - [ ] `SubmitScheduleUI` registered and renders for submit_schedule tool parts
  - [ ] Running state shows animated pulse
  - [ ] Complete state shows character names + green dot
  - [ ] Error state shows red dot + error text
  - [ ] Click opens ToolDetailSheet (wire in T12)

  **QA Scenarios**:

  ```
  Scenario: Submit schedule tool renders with states
    Tool: Playwright
    Preconditions: dev server running, project selected
    Steps:
      1. Send message "开始一个新的场景"
      2. Wait for submit_schedule tool to appear in stream
      3. Assert: during running, animated pulse dot visible
      4. Wait for completion
      5. Assert: green dot visible, character names shown
      6. Click the tool tag
      7. Assert: ToolDetailSheet opens
    Expected Result: Full tool lifecycle rendering with states
    Failure Indicators: Tool not rendering, missing states, no click response
    Evidence: .sisyphus/evidence/t10-submit-running.png, .sisyphus/evidence/t10-submit-complete.png
  ```

  **Evidence to Capture:**
  - [ ] Running state screenshot
  - [ ] Complete state screenshot

  **Commit**: YES (groups with T10)
  - Message: `feat(ui): add makeAssistantToolUI for submit_schedule tool rendering`
  - Files: `src/components/chat/submit-schedule-ui.tsx`, `src/components/chat/chat-runtime-provider.tsx`
  - Pre-commit: `bun run build`

- [x] T11. Submit Schedule Progress Bar

  **What to do**:
  - Enhance `submit-schedule-ui.tsx` to show progress bar during execution:
    - When `args.schedule` has multiple characters, show step progress: "角色 2/5"
    - Read progress from `statusData.toolProgress` (existing polling data from `/api/narrative/status`)
    - Progress bar: horizontal bar with phase color, percentage fill, phase label
    - Phase-specific colors: Actor=pink, Scribe=amber, Archivist=green
  - The progress info comes from the existing `toolProgress` prop (migrated from MessageList → accessible via useAuiState or context)
  - Use React context to pass progress data to the tool UI component

  **Must NOT do**:
  - Do NOT change the polling mechanism (keep existing `/api/narrative/status` polling)
  - Do NOT remove phase labels (角色演绎/文学叙事/归档更新)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Animated progress bar with phase-specific styling
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T9, T10, T12, T13, T14)
  - **Blocks**: None
  - **Blocked By**: T8, T10

  **References**:
  - `src/components/chat/tool-tag.tsx:78-159` — Current progress bar implementation (PHASE_LABELS, PHASE_ICONS, progress bar)
  - `src/lib/tool-progress.ts` — ToolProgress interface and store
  - `src/app/page.tsx:106-146` — Current polling logic (`statusData.toolProgress`)

  **Acceptance Criteria**:
  - [ ] Progress bar renders during submit_schedule execution
  - [ ] Phase label matches current phase (角色演绎/文学叙事/归档更新)
  - [ ] Step counter shows correctly (e.g., "2/5")
  - [ ] Progress bar color matches phase agent color
  - [ ] Progress bar disappears on completion

  **QA Scenarios**:

  ```
  Scenario: Progress bar shows during multi-step execution
    Tool: Playwright
    Preconditions: dev server running, project selected
    Steps:
      1. Send message that triggers multi-character scene
      2. Wait for submit_schedule tool to start
      3. Assert: progress bar visible with phase label
      4. Assert: step counter increments
      5. Wait for completion
      6. Assert: progress bar replaced by complete state
    Expected Result: Live progress tracking during execution
    Failure Indicators: No progress bar, stuck counter, wrong colors
    Evidence: .sisyphus/evidence/t11-progress-mid.png, .sisyphus/evidence/t11-progress-complete.png
  ```

  **Evidence to Capture:**
  - [ ] Mid-execution progress screenshot
  - [ ] Post-completion screenshot

  **Commit**: YES (groups with T11)
  - Message: `feat(ui): add progress bar to submit_schedule tool UI`
  - Files: `src/components/chat/submit-schedule-ui.tsx`
  - Pre-commit: `bun run build`

- [x] T12. Tool Click → ToolDetailSheet Wire-up

  **What to do**:
  - Wire up the `onClick` handler in `submit-schedule-ui.tsx` to open ToolDetailSheet
  - The click passes: `{ toolName, input, output, error, state }` to the existing Sheet
  - Use the existing `setSheetContent` pattern from `page.tsx`:
    ```tsx
    setSheetContent({ kind: "tool-detail", toolName, input, output, error, state })
    ```
  - Pass `setSheetContent` to the tool UI via React context
  - Ensure the sheet opens on the right side with correct content

  **Must NOT do**:
  - Do NOT change `ToolDetailContent` component internals (visual alignment is T13)
  - Do NOT change the Sheet mechanism (keep shadcn Sheet)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple event wiring
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T9, T10, T11, T13, T14)
  - **Blocks**: None
  - **Blocked By**: T10

  **References**:
  - `src/app/page.tsx:38-43` — handleToolClick callback
  - `src/app/page.tsx:214-239` — Sheet rendering with ToolDetailContent
  - `src/components/chat/tool-detail-sheet.tsx` — ToolDetailContent props

  **Acceptance Criteria**:
  - [ ] Clicking submit_schedule UI opens ToolDetailSheet
  - [ ] Sheet shows correct toolName, input, output
  - [ ] Sheet closes on `onOpenChange`
  - [ ] Works for both running and complete states

  **QA Scenarios**:

  ```
  Scenario: Click tool → open detail sheet
    Tool: Playwright
    Preconditions: dev server running, tool rendered in message
    Steps:
      1. Click on submit_schedule tool tag
      2. Assert: Sheet slides in from right
      3. Assert: tool name "排程" visible in sheet header
      4. Assert: input parameters visible
      5. Click outside or close button
      6. Assert: Sheet closes
    Expected Result: Tool detail sheet opens and closes correctly
    Failure Indicators: Sheet doesn't open, wrong content, can't close
    Evidence: .sisyphus/evidence/t12-tool-sheet-open.png
  ```

  **Evidence to Capture:**
  - [ ] Sheet open screenshot

  **Commit**: YES (groups with T12)
  - Message: `feat(ui): wire tool click to ToolDetailSheet in submit_schedule UI`
  - Files: `src/components/chat/submit-schedule-ui.tsx`, `src/app/page.tsx`
  - Pre-commit: `bun run build`

- [x] T13. ToolDetailSheet Visual Alignment

  **What to do**:
  - Align `ToolDetailContent` internal styling to assistant-ui patterns:
    - Section headers: `text-xs font-medium text-muted-foreground` (remove uppercase tracking-wider)
    - Content blocks: `rounded-lg` instead of `rounded-md`
    - Code/pre blocks: `bg-muted/50 rounded-lg p-2.5` (consistent border-radius)
    - Status indicators: Use lucide-react icons instead of raw emoji/unicode
    - Error block: `rounded-lg` for error container
    - Loading state: Match assistant-ui's `animate-pulse` dot pattern
    - Metadata badges: `rounded-full bg-muted px-2 py-0.5` pattern
  - Run `bun run build` to verify no regressions

  **Must NOT do**:
  - Do NOT change the Sheet wrapper (shadcn Sheet stays)
  - Do NOT change the data formatting logic (only visual)
  - Do NOT change the category-based rendering (agent-result/code/file-list/success/text)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Visual refinement of existing panel
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T9, T10, T11, T12, T14)
  - **Blocks**: None
  - **Blocked By**: none (independent visual task)

  **References**:
  - `src/components/chat/tool-detail-sheet.tsx` — Full component
  - `https://www.assistant-ui.com/docs/ui/tool-fallback` — ToolFallback styling patterns
  - `https://www.assistant-ui.com/docs/primitives/thread-list` — Data display patterns (badge, list item)

  **Acceptance Criteria**:
  - [ ] Section headers match assistant-ui style (no uppercase tracking-wider)
  - [ ] Code blocks use `rounded-lg`
  - [ ] Status indicators use lucide-react icons
  - [ ] `bun run build` passes

  **QA Scenarios**:

  ```
  Scenario: Tool detail sheet looks like assistant-ui
    Tool: Playwright
    Preconditions: dev server running, tool detail sheet open
    Steps:
      1. Click on a completed tool tag
      2. Assert: Sheet opens
      3. Screenshot the sheet
      4. Assert: section headers use text-xs font-medium (not uppercase)
      5. Assert: content blocks have rounded-lg corners
      6. Assert: overall spacing consistent with assistant-ui
    Expected Result: Sheet visually matches assistant-ui design language
    Failure Indicators: Uppercase headers, inconsistent border-radius
    Evidence: .sisyphus/evidence/t13-tool-sheet-aligned.png
  ```

  **Evidence to Capture:**
  - [ ] Aligned tool detail sheet screenshot

  **Commit**: YES (groups with T13)
  - Message: `style(ui): align ToolDetailSheet visuals with assistant-ui design language`
  - Files: `src/components/chat/tool-detail-sheet.tsx`
  - Pre-commit: `bun run build`

- [x] T14. FileEditorSheet Visual Alignment

  **What to do**:
  - Align `FileEditorSheet` internal styling to assistant-ui patterns:
    - Tab buttons: `rounded-lg` + `data-active` pattern for active tab (not `border-b-2`)
    - Save button: `rounded-lg` styling
    - Conflict banner: `rounded-lg` for `rounded-md`
    - Status indicators: replace emoji (✓/●/Saved ✓) with lucide-react icons (`Check`, `Circle`, `AlertCircle`)
    - Section layout: consistent `gap-3`/`px-4` spacing
  - Run `bun run build` to verify no regressions
  - CodeMirror editor itself stays unchanged

  **Must NOT do**:
  - Do NOT change CodeMirror styling or configuration
  - Do NOT change the file loading/saving logic
  - Do NOT change the conflict resolution workflow

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Visual refinement of editor panel
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T9, T10, T11, T12, T13)
  - **Blocks**: None
  - **Blocked By**: none (independent visual task)

  **References**:
  - `src/components/chat/file-editor-sheet.tsx` — Full component
  - `https://www.assistant-ui.com/docs/ui/thread-list` — Tab/button patterns

  **Acceptance Criteria**:
  - [ ] Tab buttons use `data-active` pattern (not `border-b-2`)
  - [ ] Save/status indicators use lucide-react icons
  - [ ] Border-radius consistent with assistant-ui (`rounded-lg`)
  - [ ] `bun run build` passes

  **QA Scenarios**:

  ```
  Scenario: File editor sheet looks like assistant-ui
    Tool: Playwright
    Preconditions: dev server running, file editor open
    Steps:
      1. Click on a file in StoryFileTree
      2. Assert: File editor sheet opens
      3. Screenshot the sheet
      4. Assert: tab buttons use data-active pattern
      5. Assert: save status uses lucide icon, not emoji
      6. Assert: conflict banner has rounded-lg corners
    Expected Result: Editor sheet visually matches assistant-ui
    Failure Indicators: border-b-2 tabs, emoji status indicators, inconsistent radius
    Evidence: .sisyphus/evidence/t14-file-editor-aligned.png
  ```

  **Evidence to Capture:**
  - [ ] Aligned file editor sheet screenshot

  **Commit**: YES (groups with T14)
  - Message: `style(ui): align FileEditorSheet visuals with assistant-ui design language`
  - Files: `src/components/chat/file-editor-sheet.tsx`
  - Pre-commit: `bun run build`

---

### Wave 3: Final Integration

- [x] T15. SceneIndicator + Status Polling Migration

  **What to do**:
  - Migrate status polling from `page.tsx`'s `useEffect` into a `SceneIndicator` context provider or pass via props
  - Use `useAuiState` to check streaming status for polling interval adjustment (active=1s, idle=5s)
  - Keep existing `/api/narrative/status` endpoint
  - SceneIndicator component updated with lucide-react icons (from T2), assistant-ui CSS (from T3)
  - Ensure sceneId and location display correctly above Thread

  **Must NOT do**:
  - Do NOT change the `/api/narrative/status` endpoint
  - Do NOT remove the polling logic — keep it functional

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Wiring existing polling logic to new provider context
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T16, T17, T18)
  - **Blocks**: None
  - **Blocked By**: S1

  **References**:
  - `src/app/page.tsx:106-146` — Current polling useEffect
  - `src/components/chat/scene-indicator.tsx` — SceneIndicator component
  - `https://www.assistant-ui.com/docs/api-reference/hooks/state` — useAuiState API

  **Acceptance Criteria**:
  - [ ] Scene location visible above Thread
  - [ ] Polling interval adjusts based on streaming status
  - [ ] SceneId badge renders correctly
  - [ ] `bun run build` passes

  **QA Scenarios**:

  ```
  Scenario: Scene indicator updates during streaming
    Tool: Playwright
    Preconditions: dev server running, project selected
    Steps:
      1. Send message that triggers a new scene
      2. Wait for streaming to start
      3. Assert: SceneIndicator shows location and sceneId
      4. Assert: indicators update as scene progresses
    Expected Result: Live scene information displayed
    Evidence: .sisyphus/evidence/t15-scene-indicator.png
  ```

  **Evidence to Capture:**
  - [ ] Scene indicator screenshot

  **Commit**: YES (groups with T15)
  - Message: `refactor(ui): migrate status polling to work with useChatRuntime, update SceneIndicator`
  - Files: `src/app/page.tsx`, `src/components/chat/scene-indicator.tsx`
  - Pre-commit: `bun run build`

- [x] T16. Stop/Cancel via ComposerPrimitive

  **What to do**:
  - The assistant-ui Thread component's Composer has built-in stop/cancel support
  - Ensure the stop button works with the existing `/api/narrative` abort mechanism
  - The Thread's Composer automatically handles `cancelRun()` — verify this works
  - If the Lexical ChatInput (separate component, not inside Thread) has its own stop button, ensure it calls `useAui().thread().cancelRun()`
  - Verify that stopping also triggers message persistence via T5's ThreadHistoryAdapter

  **Must NOT do**:
  - Do NOT remove the Lexical ChatInput stop button (keep it functional)
  - Do NOT change the backend abort handling

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verify existing cancel mechanism works with new runtime
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T15, T17, T18)
  - **Blocks**: None
  - **Blocked By**: T6

  **References**:
  - `src/app/page.tsx:81-86` — Current handleStop with stop + persistMessages
  - `src/components/chat/chat-input.tsx:38-42` — Stop button rendering
  - `https://www.assistant-ui.com/docs/api-reference/hooks/state` — useAui cancelRun API

  **Acceptance Criteria**:
  - [ ] Thread's built-in cancel stops the stream
  - [ ] Lexical ChatInput stop button stops the stream
  - [ ] Messages persist after stop
  - [ ] `bun run build` passes

  **QA Scenarios**:

  ```
  Scenario: Stop button cancels streaming
    Tool: Playwright
    Preconditions: dev server running, streaming in progress
    Steps:
      1. Send a message that triggers long response
      2. Wait for partial response
      3. Click the stop button
      4. Assert: streaming indicator disappears
      5. Assert: partial response still visible
      6. Reload page
      7. Assert: partial response persisted
    Expected Result: Stream stops cleanly, messages persist
    Failure Indicators: Stream continues, messages lost, errors
    Evidence: .sisyphus/evidence/t16-stop-stream.png
  ```

  **Evidence to Capture:**
  - [ ] Post-stop screenshot

  **Commit**: YES (groups with T16)
  - Message: `fix(ui): ensure stop/cancel works with useChatRuntime and new Thread component`
  - Files: `src/app/page.tsx`
  - Pre-commit: `bun run build`

- [x] T17. ProjectSelector + StoryFileTree Final Verification

  **What to do**:
  - Final visual pass: verify ProjectSelector and StoryFileTree icons (T2) + CSS (T3) are fully aligned
  - Verify project switching works correctly with new runtime:
    - Switching project re-initializes ThreadHistoryAdapter for new projectId
    - Messages load for selected project
  - Verify file tree refresh works after scene completion
  - Verify file click → FileEditorSheet still works
  - Clean up any unused imports or dead code in these components

  **Must NOT do**:
  - Do NOT change component functionality
  - Do NOT introduce new features

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Visual verification and polish
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T15, T16, T18)
  - **Blocks**: None
  - **Blocked By**: T2, T3, T5

  **References**:
  - `src/components/chat/project-selector.tsx` — Updated with lucide icons + CSS
  - `src/components/chat/story-file-tree.tsx` — Updated with lucide icons + CSS
  - `src/app/page.tsx` — Project switching logic

  **Acceptance Criteria**:
  - [ ] Project switching loads correct messages
  - [ ] File tree refreshes after scene completion
  - [ ] File click opens FileEditorSheet
  - [ ] All icons render correctly
  - [ ] Visual consistency with assistant-ui confirmed

  **QA Scenarios**:

  ```
  Scenario: Project switching works end-to-end
    Tool: Playwright
    Preconditions: dev server running, multiple projects exist
    Steps:
      1. Navigate to http://localhost:4477
      2. Select Project A
      3. Verify messages for Project A load
      4. Select Project B
      5. Verify messages for Project B load
      6. Verify sidebar highlights correct project
    Expected Result: Seamless project switching
    Evidence: .sisyphus/evidence/t17-project-switch.png

  Scenario: File tree refreshes after scene
    Tool: Playwright
    Preconditions: dev server running, project selected
    Steps:
      1. Note current file list
      2. Send message that triggers scene completion
      3. Wait for completion
      4. Assert: file tree items update if new files created
    Expected Result: File tree stays in sync
    Evidence: .sisyphus/evidence/t17-file-tree-refresh.png
  ```

  **Evidence to Capture:**
  - [ ] Project switching screenshot
  - [ ] File tree refresh screenshot

  **Commit**: YES (groups with T17)
  - Message: `chore(ui): final verification and cleanup of ProjectSelector and StoryFileTree`
  - Files: `src/components/chat/project-selector.tsx`, `src/components/chat/story-file-tree.tsx`, `src/app/page.tsx`
  - Pre-commit: `bun run build`

- [x] T18. End-to-End Smoke Test + Cleanup

  **What to do**:
  - Full end-to-end test: create project → send messages → verify streaming → verify tools → stop → reload → verify persistence
  - Verify: `bun run build` passes, `bun dev` works
  - Run `bun run lint` and fix any ESLint issues
  - Remove dead code:
    - `chat-layout.tsx` (unused — confirmed by explore agent)
    - Unused imports in `page.tsx`
    - Old `MessageList` if no longer referenced
    - Keep `message-item.tsx` and `message-segments.tsx` for reference (can remove later)
  - Verify no console errors in browser

  **Must NOT do**:
  - Do NOT delete files that other code imports
  - Do NOT change any remaining logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Comprehensive verification requiring broad codebase understanding
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T15, T16, T17)
  - **Blocks**: F1-F4 (final verification wave)
  - **Blocked By**: All other implementation tasks (S1-T17)

  **References**:
  - All changed files
  - `src/components/chat/chat-layout.tsx` — Unused component (cite explore agent finding)

  **Acceptance Criteria**:
  - [ ] `bun run build` passes with zero errors
  - [ ] `bun run lint` passes
  - [ ] Full user flow works: create project → chat → stop → reload
  - [ ] No browser console errors
  - [ ] Dead code removed

  **QA Scenarios**:

  ```
  Scenario: Full user flow
    Tool: Playwright
    Preconditions: dev server running, clean state
    Steps:
      1. Navigate to http://localhost:4477
      2. Create a new project "E2E Test"
      3. Send message "你好，请介绍一下这个世界"
      4. Wait for streaming response (timeout: 60s)
      5. Assert: AI response visible with text
      6. Assert: tool calls rendered (if any)
      7. Click stop if still streaming
      8. Reload the page
      9. Assert: conversation history preserved
    Expected Result: Complete user flow works end-to-end
    Failure Indicators: Any error, missing messages after reload
    Evidence: .sisyphus/evidence/t18-full-flow-start.png, .sisyphus/evidence/t18-full-flow-after-reload.png
  ```

  **Evidence to Capture:**
  - [ ] Full flow start screenshot
  - [ ] Post-reload screenshot

  **Commit**: YES (groups with T18)
  - Message: `chore(ui): end-to-end verification, lint fixes, and dead code cleanup`
  - Files: cleanup targets
  - Pre-commit: `bun run lint && bun run build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `bun run lint` + `bun run build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Playwright QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid project switching.
  Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Task | Commit Message | Files |
|---|---|---|---|
| 0 | S1 | `spike(ui): verify assistant-ui transport compatibility with /api/narrative` | spike code (revert), docs |
| 1 | T1 | `chore(ui): install @assistant-ui/react and @assistant-ui/react-ai-sdk, scaffold thread/markdown/tool-fallback` | `package.json`, `bun.lockb`, `src/components/assistant-ui/*` |
| 1 | T2 | `refactor(ui): migrate icons from inline SVG/emoji to lucide-react` | 7 files |
| 1 | T3 | `style(ui): align custom component CSS with assistant-ui design language` | 6 files |
| 1 | T4 | `refactor(ui): replace useChat with useChatRuntime + AssistantRuntimeProvider` | 2 files |
| 1 | T5 | `feat(ui): implement ThreadHistoryAdapter with withFormat for message persistence` | 3 files |
| 1 | T6 | `refactor(ui): integrate assistant-ui Thread component, replace MessageList` | 2 files |
| 1 | T7 | `feat(ui): add dynamic-tool → data part preprocessor for assistant-ui compatibility` | 1 file |
| 1 | T8 | `feat(ui): implement agent segmentation in MessagePrimitive.Parts via step-start grouping` | 1 file |
| 2 | T9 | `feat(ui): integrate MarkdownText and ToolFallback into Thread message rendering` | 1 file |
| 2 | T10 | `feat(ui): add makeAssistantToolUI for submit_schedule tool rendering` | 2 files |
| 2 | T11 | `feat(ui): add progress bar to submit_schedule tool UI` | 1 file |
| 2 | T12 | `feat(ui): wire tool click to ToolDetailSheet in submit_schedule UI` | 2 files |
| 2 | T13 | `style(ui): align ToolDetailSheet visuals with assistant-ui design language` | 1 file |
| 2 | T14 | `style(ui): align FileEditorSheet visuals with assistant-ui design language` | 1 file |
| 3 | T15 | `refactor(ui): migrate status polling to work with useChatRuntime, update SceneIndicator` | 2 files |
| 3 | T16 | `fix(ui): ensure stop/cancel works with useChatRuntime and new Thread component` | 1 file |
| 3 | T17 | `chore(ui): final verification and cleanup of ProjectSelector and StoryFileTree` | 3 files |
| 3 | T18 | `chore(ui): end-to-end verification, lint fixes, and dead code cleanup` | cleanup targets |

---

## Success Criteria

### Verification Commands
```bash
bun run build                  # Expected: exit 0, no errors
bun run lint                   # Expected: exit 0
bun dev                        # Expected: app loads on http://localhost:4477
```

### Final Checklist
- [ ] All "Must Have" present (8 items)
- [ ] All "Must NOT Have" absent (7 guardrails)
- [ ] All 18 task QA scenarios pass (via F3)
- [ ] All 4 final review agents APPROVE (via F1-F4)
- [ ] `bun run build` passes
- [ ] `bun run lint` passes
- [ ] Zero console errors in browser
- [ ] Messages persist across page reloads
- [ ] Project switching loads correct messages
- [ ] All custom components visually match assistant-ui