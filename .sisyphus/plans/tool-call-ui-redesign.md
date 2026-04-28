# Tool Call UI Redesign: Tag化 + 独立节点 + 侧边详情

## TL;DR

> **Quick Summary**: 将工具调用从嵌套在对话气泡内的大卡片，重构为独立的紧凑 Tag 标签 + 侧边抽屉详情面板。Tag 显示工具名和核心参数，hover 预览参数，click 打开 Sheet 查看完整输入/输出。
> 
> **Deliverables**:
> - 统一的工具元数据常量模块 `tool-meta.ts`
> - 紧凑 ToolTag 组件（替代 ToolCallCard）
> - ToolDetailSheet 侧边详情面板（含智能格式化）
> - MessageItem 重构：文本气泡与工具 Tag 分离渲染
> - shadcn/ui Sheet + Tooltip 组件添加
> - ToolCallCard 组件删除
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 6 → Task 7

---

## Context

### Original Request
工具调用渲染存在4个问题：(1) 嵌套在气泡内不优雅，应为独立节点；(2) 展示面积过大；(3) 下拉展开不优雅，应为小Tag+hover预览+click详情；(4) 工具调用参数应保留并支持查看。

### Interview Summary
**Key Discussions**:
- 详情展示方式：侧边抽屉（Sheet），从右侧滑入，不遮挡对话
- 多工具排列：横排 Tag 行，`flex flex-wrap gap-1.5`
- 输出格式化：智能格式化（文件工具→代码预览，agent工具→对话摘要，错误→红色提示）
- 测试策略：无自动化测试，通过 dev server 手动验证

**Research Findings**:
- `dynamic-tool` part 的 `input` 字段在存储中完整保留，UI层只在运行中时显示截断预览
- 当前 TOOL_META 缺少 `edit_file`、`resolve_character`、`list_characters`、`reset_story` 四个工具
- 颜色/名称/agent映射在 4 处重复定义，需统一
- `renderParts` 和 `renderSegmentParts` 近乎相同，需合并
- shadcn/ui 当前只有 7 个组件，没有 Sheet 和 Tooltip

### Metis Review
**Identified Gaps** (addressed):
- 布局架构：多步消息中 Tag 与文本的关系 → 采用 Option B：保持 agent 分段，每段内文本→气泡，工具→Tag行
- Sheet 单例 vs per-Tag → 单例，由 MessageItem 管理选中状态
- Hover 交互类型 → 使用 shadcn Tooltip（轻量，300ms延迟）
- 📋 Session Log 按钮位置 → 保持在消息头部
- 智能格式化细节 → 按工具类型分别指定
- base-nova 兼容性 → 需先验证 `bunx shadcn add sheet tooltip`

---

## Work Objectives

### Core Objective
将工具调用从"嵌套在大气泡内的展开卡片"重构为"独立的紧凑 Tag + 侧边 Sheet 详情"，实现：视觉轻量化、交互分层化、信息完整化（输入参数可查看）。

### Concrete Deliverables
- `src/components/chat/tool-meta.ts` — 统一工具元数据（11个工具的 label/color/icon/headlineParam/agentKey/category）
- `src/components/chat/tool-tag.tsx` — 紧凑 Tag 组件（4种状态 + hover Tooltip + click 回调）
- `src/components/chat/tool-detail-sheet.tsx` — 侧边详情 Sheet（输入参数 + 智能格式化输出）
- `src/components/ui/sheet.tsx` — shadcn Sheet 组件
- `src/components/ui/tooltip.tsx` — shadcn Tooltip 组件
- `src/components/chat/message-item.tsx` — 重构：文本/工具分离渲染
- 删除 `src/components/chat/tool-call-card.tsx`

### Definition of Done
- [ ] `bun run build` 零错误
- [ ] `bun run lint` 零错误
- [ ] 工具调用不再嵌套在对话气泡内
- [ ] 工具调用显示为紧凑 Tag（非全宽卡片）
- [ ] Tag hover 显示核心参数 Tooltip
- [ ] Tag click 打开右侧 Sheet，显示完整输入参数和格式化输出
- [ ] 多工具横排排列
- [ ] 纯工具调用的消息不产生空气泡
- [ ] ProgressIndicator 仍正常工作
- [ ] SessionModal 仍正常工作

### Must Have
- 所有 11 个工具在 tool-meta.ts 中有完整定义
- ToolTag 处理 4 种状态：input-streaming / input-available / output-available / output-error
- ToolDetailSheet 同时展示 input 参数和 output 结果
- 智能格式化：文件工具→代码预览、agent工具→对话摘要、glob→文件列表、错误→红色提示
- 保持 agent 分段结构（AgentLabel + 文本气泡 + Tag行）
- Sheet 为单例，由 MessageItem 级别管理选中状态
- 使用 toolCallId（非数组索引）作为 Sheet 选中 key

### Must NOT Have (Guardrails)
- 不修改任何 API 路由、后端逻辑或数据模型
- 不修改 chat-history.ts 持久化格式
- 不重新设计 SessionModal
- 不添加测试基础设施
- 不修改 ProgressIndicator 或 deriveProgress 逻辑
- 不修改 useChat hook 配置
- 不添加 Sheet/Tooltip 之外的 shadcn 组件
- 不添加 3 个未使用的审批状态（approval-requested/responded, output-denied）
- 不在 ToolTag 中使用纯 Badge variant（需要自定义样式）
- 不在 Sheet 中使用数组索引作为选中 key

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun:test for backend)
- **Automated tests**: None (user choice)
- **Framework**: none for UI
- **Agent-Executed QA**: ALWAYS — Playwright browser verification for every task

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) - Navigate, interact, assert DOM, screenshot
- **Component isolation**: Use Bash (bun dev) + Playwright to verify rendering

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — zero visual change, zero risk):
├── Task 1: Unified tool-meta constants [quick]
├── Task 2: Add shadcn Sheet + Tooltip components [quick]

Wave 2 (New components — built in isolation):
├── Task 3: ToolTag component [visual-engineering]
├── Task 4: ToolDetailSheet component [visual-engineering]
├── Task 5: Smart output formatter utility [unspecified-high]

Wave 3 (Integration — the critical refactor):
├── Task 6: MessageItem refactor: separate text/tool rendering [deep]
├── Task 7: Wire ToolTag hover + click interactions [visual-engineering]

Wave 4 (Cleanup):
└── Task 8: Remove ToolCallCard + dead code [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 6 → Task 7 → Task 8 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 3, 4, 5, 6 | 1 |
| 2 | — | 3, 4, 6 | 1 |
| 3 | 1, 2 | 6, 7 | 2 |
| 4 | 1, 2 | 6, 7 | 2 |
| 5 | 1 | 4, 6 | 2 |
| 6 | 1, 3, 4, 5 | 7, 8 | 3 |
| 7 | 6 | 8 | 3 |
| 8 | 7 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 3 tasks — T3 → `visual-engineering`, T4 → `visual-engineering`, T5 → `unspecified-high`
- **Wave 3**: 2 tasks — T6 → `deep`, T7 → `visual-engineering`
- **Wave 4**: 1 task — T8 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Unified tool-meta constants

  **What to do**:
  - Create `src/components/chat/tool-meta.ts` as the single source of truth for ALL tool metadata
  - Define a `ToolMeta` interface: `{ toolName: string; agentKey: AgentKey; label: string; color: string; icon: string; headlineParam?: string; category: "agent" | "file" | "character" | "system" }`
  - Populate `TOOL_META_MAP` with all 11 tools:
    - `call_actor`: { agentKey: "actor", label: "演员", color: "#EC4899", icon: "🎭", headlineParam: "character", category: "agent" }
    - `call_scribe`: { agentKey: "scribe", label: "书记", color: "#F59E0B", icon: "📝", headlineParam: "sceneContext", category: "agent" }
    - `call_archivist`: { agentKey: "archivist", label: "场记", color: "#10B981", icon: "📋", headlineParam: "narrativeSummary", category: "agent" }
    - `read_file`: { agentKey: "gm", label: "读取", color: "#6B7280", icon: "📄", headlineParam: "path", category: "file" }
    - `write_file`: { agentKey: "gm", label: "写入", color: "#6B7280", icon: "✏️", headlineParam: "path", category: "file" }
    - `edit_file`: { agentKey: "gm", label: "编辑", color: "#6B7280", icon: "🔧", headlineParam: "path", category: "file" }
    - `glob_files`: { agentKey: "gm", label: "查找", color: "#6B7280", icon: "🔍", headlineParam: "pattern", category: "file" }
    - `resolve_character`: { agentKey: "gm", label: "解析角色", color: "#6B7280", icon: "👤", headlineParam: "name", category: "character" }
    - `list_characters`: { agentKey: "gm", label: "列出角色", color: "#6B7280", icon: "👥", category: "character" }
    - `clear_interaction_log`: { agentKey: "gm", label: "清除记录", color: "#8B5CF6", icon: "🗑️", category: "system" }
    - `reset_story`: { agentKey: "gm", label: "重置故事", color: "#EF4444", icon: "⚠️", category: "system" }
  - Export `AGENT_COLORS`, `AGENT_NAMES`, `AGENT_KEY_MAP` (agentKey → color/name mapping), `TOOL_STEP_MAP` (toolName → step number for ProgressIndicator)
  - Export helper: `getToolMeta(toolName: string): ToolMeta` with fallback for unknown tools
  - Export helper: `getHeadlineValue(toolName: string, input: Record<string, unknown>): string` — extracts the headline parameter value, truncated to 30 chars
  - Export helper: `toolNameToAgentKey(toolName: string): AgentKey`
  - Replace ALL consumers:
    - `tool-call-card.tsx`: Replace `TOOL_META`, `DEFAULT_META`, `AGENT_TOOLS`, `getToolMeta`, `parseToolOutput`, `extractDisplayData` → import from tool-meta.ts (keep parseToolOutput/extractDisplayData locally for now, they'll move in Task 5)
    - `agent-label.tsx`: Replace `AGENT_COLORS`, `AGENT_NAMES` → import from tool-meta.ts. Keep `AgentLabel` component and `AgentKey` type export.
    - `message-item.tsx`: Replace `extractAgentLabel`, `getAgentKey` → import `toolNameToAgentKey` from tool-meta.ts
    - `message-segments.tsx`: Replace `toolNameToAgentKey` → import from tool-meta.ts
    - `message-list.tsx`: Replace `TOOL_STEP_MAP` → import from tool-meta.ts
    - `session-modal.tsx`: Replace `AGENT_KEY_MAP` → import from tool-meta.ts
    - `character-label.tsx`: Replace `AGENT_COLORS` import → import from tool-meta.ts
    - `progress-indicator.tsx`: If it references any tool constants → import from tool-meta.ts
  - Verify with `lsp_find_references` on old constants to ensure no missed consumers
  - Run `bun run build` to verify zero type errors

  **Must NOT do**:
  - Do not change any component's visual behavior
  - Do not add new UI features
  - Do not modify the `parseToolOutput` / `extractDisplayData` functions yet (move in Task 5)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical refactoring, no design decisions, well-defined scope
  - **Skills**: [`git-master`]
    - `git-master`: For safe rename/refactor tracking

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/components/chat/tool-call-card.tsx:14-26` — Current TOOL_META + AGENT_TOOLS + DEFAULT_META to replace
  - `src/components/chat/agent-label.tsx:6-18` — Current AGENT_COLORS + AGENT_NAMES to replace
  - `src/components/chat/message-item.tsx:37-42` — Current getAgentKey() to replace
  - `src/components/chat/message-segments.tsx:9-14` — Current toolNameToAgentKey() to replace
  - `src/components/chat/message-list.tsx:9-13` — Current TOOL_STEP_MAP to replace

  **API/Type References**:
  - `src/components/chat/agent-label.tsx:20` — AgentKey type definition (keep exporting from agent-label.ts for backward compat)
  - `src/components/chat/tool-call-card.tsx:6-12` — ToolCallCardProps interface (input type shape)

  **External References**:
  - AGENTS.md naming conventions: constants = SCREAMING_SNAKE_CASE, factories = get prefix

  **WHY Each Reference Matters**:
  - tool-call-card.tsx:14-26 — Defines the exact data to migrate (colors, labels)
  - agent-label.tsx:6-18 — Source of truth for agent colors that must be unified
  - message-item.tsx:37-42 — Duplicate mapping function that must be replaced
  - message-segments.tsx:9-14 — Another duplicate that must be replaced
  - message-list.tsx:9-13 — Step mapping that must be centralized

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Unified constants compile correctly
    Tool: Bash
    Preconditions: All file changes saved
    Steps:
      1. Run `bun run build`
      2. Check exit code is 0
      3. Run `grep -r "TOOL_META\b\|AGENT_TOOLS\b\|getAgentKey\b\|toolNameToAgentKey\b\|TOOL_STEP_MAP\b" src/ --include="*.ts" --include="*.tsx"`
    Expected Result: Build passes with zero errors. grep returns zero matches (all old constants replaced by imports from tool-meta.ts)
    Failure Indicators: Build fails with type error; grep finds old constant definitions still in source
    Evidence: .sisyphus/evidence/task-1-unified-constants.txt

  Scenario: No visual regression
    Tool: Playwright
    Preconditions: `bun dev` running on port 4477
    Steps:
      1. Navigate to http://localhost:4477
      2. Open a project with existing chat history containing tool calls
      3. Take screenshot of tool call rendering
    Expected Result: Tool calls render identically to before the refactor (same colors, same labels, same layout)
    Failure Indicators: Colors differ, labels change, layout breaks
    Evidence: .sisyphus/evidence/task-1-no-regression.png
  ```

  **Commit**: YES
  - Message: `refactor(chat): unify tool metadata into single source of truth`
  - Files: `src/components/chat/tool-meta.ts`, `src/components/chat/agent-label.tsx`, `src/components/chat/message-item.tsx`, `src/components/chat/message-segments.tsx`, `src/components/chat/message-list.tsx`, `src/components/chat/session-modal.tsx`, `src/components/chat/character-label.tsx`, `src/components/chat/tool-call-card.tsx`
  - Pre-commit: `bun run build`

- [x] 2. Add shadcn Sheet + Tooltip components

  **What to do**:
  - Run `bunx shadcn add sheet tooltip` to add both components
  - Verify the components are installed correctly in `src/components/ui/sheet.tsx` and `src/components/ui/tooltip.tsx`
  - Verify base-nova style compatibility — check that generated components use `@base-ui/react` primitives (not Radix)
  - Run `bun run build` to verify zero type errors
  - If `bunx shadcn add` doesn't work with base-nova, fall back to manually creating Sheet and Tooltip using `@base-ui/react` Dialog and Tooltip primitives, following the pattern in existing shadcn components (e.g., `badge.tsx`, `button.tsx`)

  **Must NOT do**:
  - Do not modify existing shadcn components
  - Do not add components beyond Sheet and Tooltip
  - Do not customize the Sheet/Tooltip yet (that's Task 4)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple infrastructure task, mostly running a CLI command
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 4, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/components/ui/badge.tsx` — Example of existing shadcn component pattern to match
  - `src/components/ui/button.tsx` — Another existing shadcn component

  **External References**:
  - `components.json` — shadcn configuration, specifies base-nova style

  **WHY Each Reference Matters**:
  - badge.tsx/button.tsx: Show the expected file structure and import patterns for shadcn components in this project
  - components.json: Determines whether `bunx shadcn add` will use Radix or base-nova primitives

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sheet and Tooltip components installed
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `ls src/components/ui/sheet.tsx src/components/ui/tooltip.tsx`
      2. Run `bun run build`
    Expected Result: Both files exist. Build passes with zero errors.
    Failure Indicators: Files missing or build fails
    Evidence: .sisyphus/evidence/task-2-components-installed.txt

  Scenario: Base-nova compatibility
    Tool: Bash
    Preconditions: Components installed
    Steps:
      1. Run `grep -l "@base-ui/react" src/components/ui/sheet.tsx src/components/ui/tooltip.tsx`
      2. If no match, run `grep -l "@radix-ui" src/components/ui/sheet.tsx src/components/ui/tooltip.tsx`
    Expected Result: At least one file imports from @base-ui/react, OR if Radix is used, the build still works (acceptable fallback)
    Failure Indicators: Build fails due to missing dependency
    Evidence: .sisyphus/evidence/task-2-base-nova-check.txt
  ```

  **Commit**: YES
  - Message: `chore(ui): add shadcn Sheet and Tooltip components`
  - Files: `src/components/ui/sheet.tsx`, `src/components/ui/tooltip.tsx`
  - Pre-commit: `bun run build`

- [x] 3. ToolTag component

  **What to do**:
  - Create `src/components/chat/tool-tag.tsx`
  - Define `ToolTagProps`: `{ toolName: string; state: DynamicToolState; input?: Record<string, unknown>; onClick?: () => void }`
  - Where `DynamicToolState = "input-streaming" | "input-available" | "output-available" | "output-error"`
  - Component renders a compact tag/badge:
    - Default: `icon + label + headlineValue` (e.g., `🎭 演员 · 塞莉娅`)
    - `input-streaming`: pulse animation on dot + "思考中..."
    - `input-available`: solid dot + "执行中..."
    - `output-available`: green check dot + headline value
    - `output-error`: red dot + "错误"
  - Style follows AgentLabel pattern: `style={{ color: meta.color, backgroundColor: `${meta.color}15` }}`
  - Layout: `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer`
  - Headline value extracted via `getHeadlineValue()` from tool-meta.ts, truncated to 30 chars with ellipsis
  - Add hover Tooltip (from Task 2) showing key parameters:
    - Show up to 3 key-value pairs from `input`
    - Each pair: `key: value` (value truncated to 50 chars)
    - Tooltip delay: 300ms
  - The `onClick` prop is a callback — the actual Sheet wiring happens in Task 7

  **Must NOT do**:
  - Do not wire Sheet opening (that's Task 7)
  - Do not import or reference ToolCallCard
  - Do not add expand/collapse behavior

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component creation with specific visual design requirements
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: For crafting the Tag visual design and hover interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/components/chat/agent-label.tsx:27-53` — Color + Badge pattern to follow exactly
  - `src/components/chat/character-label.tsx` — Another colored label pattern
  - `src/components/chat/tool-call-card.tsx:88-177` — Current rendering logic to understand states
  - `src/components/ui/badge.tsx` — Badge component structure

  **API/Type References**:
  - `src/components/chat/tool-meta.ts` (from Task 1) — `getToolMeta()`, `getHeadlineValue()`, `ToolMeta` type
  - `src/components/ui/tooltip.tsx` (from Task 2) — Tooltip component API

  **WHY Each Reference Matters**:
  - agent-label.tsx:27-53 — The exact color application pattern (hex + opacity) that ToolTag must match
  - tool-call-card.tsx:88-177 — Shows the 4 state machine that ToolTag must replicate in compact form
  - tool-meta.ts — Provides all tool metadata and headline extraction logic

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: ToolTag renders all 4 states
    Tool: Playwright
    Preconditions: `bun dev` running, ToolTag temporarily rendered on page with test data
    Steps:
      1. Render ToolTag with state="input-streaming" → observe pulsing dot + "思考中..."
      2. Render ToolTag with state="input-available" → observe solid dot + "执行中..."
      3. Render ToolTag with state="output-available" → observe green check + "🎭 演员 · 塞莉娅"
      4. Render ToolTag with state="output-error" → observe red dot + "错误"
      5. Take screenshot of each state
    Expected Result: Each state renders correctly with appropriate visual indicators
    Failure Indicators: Missing animation, wrong colors, wrong text, layout breaks
    Evidence: .sisyphus/evidence/task-3-tag-states.png

  Scenario: ToolTag hover shows tooltip
    Tool: Playwright
    Preconditions: ToolTag rendered with input data
    Steps:
      1. Hover over a ToolTag with toolName="call_actor", input={character: "塞莉娅", direction: "面对废墟中的身影"}
      2. Wait 500ms for tooltip to appear
      3. Observe tooltip content shows "character: 塞莉娅" and "direction: 面对废墟中的身影..."
    Expected Result: Tooltip appears with key parameter preview
    Failure Indicators: No tooltip, wrong content, tooltip doesn't disappear on mouse leave
    Evidence: .sisyphus/evidence/task-3-hover-tooltip.png
  ```

  **Commit**: YES
  - Message: `feat(chat): add ToolTag component for compact tool call display`
  - Files: `src/components/chat/tool-tag.tsx`
  - Pre-commit: `bun run build`

- [x] 4. ToolDetailSheet component

  **What to do**:
  - Create `src/components/chat/tool-detail-sheet.tsx`
  - Define `ToolDetailSheetProps`: `{ open: boolean; onOpenChange: (open: boolean) => void; toolName: string; input?: Record<string, unknown>; output?: string; error?: string; state?: DynamicToolState }`
  - Uses shadcn `Sheet` component, `side="right"`, width ~400px
  - Sheet header: tool icon + label (from tool-meta.ts), close button
  - Sheet body (ScrollArea):
    - Section 1: **调用参数** — structured display of `input`:
      - Each key-value pair on its own line
      - Key: `text-xs font-medium text-muted-foreground`
      - Value: `text-sm text-foreground`, long values in a `<pre>` block with `max-h-48 overflow-y-auto`
    - Section 2: **执行结果** — smart-formatted display of `output`:
      - Uses `formatToolOutput()` from Task 5
    - Error section (if `output-error`): red alert box with error message
  - Move `parseToolOutput()` and `extractDisplayData()` from tool-call-card.tsx into this file or a shared utility (they'll be deleted from tool-call-card.tsx in Task 8)

  **Must NOT do**:
  - Do not wire this to ToolTag clicks yet (that's Task 7)
  - Do not modify ToolCallCard
  - Do not add animation beyond Sheet's built-in slide-in

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with layout and formatting design
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: For Sheet layout design and content formatting

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/components/chat/tool-call-card.tsx:34-59` — parseToolOutput + extractDisplayData logic to move
  - `src/components/chat/session-modal.tsx` — Existing modal/sheet pattern in the codebase
  - `src/components/ui/scroll-area.tsx` — ScrollArea component for long content

  **API/Type References**:
  - `src/components/ui/sheet.tsx` (from Task 2) — Sheet component API
  - `src/lib/tool-result.ts` — ToolResult type definition ({ ok, data/error })
  - `src/components/chat/tool-meta.ts` (from Task 1) — Tool metadata for header

  **WHY Each Reference Matters**:
  - tool-call-card.tsx:34-59 — Contains the output parsing logic that must be preserved (not rewritten)
  - session-modal.tsx — Shows existing modal patterns (expand/collapse, ScrollArea usage)
  - tool-result.ts — Defines the JSON envelope format that parseToolOutput must handle

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sheet displays input parameters and output
    Tool: Playwright
    Preconditions: ToolDetailSheet rendered with test data
    Steps:
      1. Open Sheet with toolName="call_actor", input={character: "塞莉娅", direction: "面对废墟中的身影"}, output with agent result
      2. Observe "调用参数" section shows "character: 塞莉娅" and "direction: 面对废墟中的身影"
      3. Observe "执行结果" section shows formatted output
      4. Take screenshot
    Expected Result: Both input and output sections render correctly
    Failure Indicators: Missing sections, raw JSON shown, layout breaks
    Evidence: .sisyphus/evidence/task-4-sheet-content.png

  Scenario: Sheet handles error state
    Tool: Playwright
    Preconditions: ToolDetailSheet rendered with error
    Steps:
      1. Open Sheet with state="output-error", error="Unsafe path detected"
      2. Observe red error alert box
    Expected Result: Error displayed in red alert, no output section
    Failure Indicators: No error display, error in wrong format
    Evidence: .sisyphus/evidence/task-4-sheet-error.png

  Scenario: Sheet closes on Escape and outside click
    Tool: Playwright
    Preconditions: Sheet open
    Steps:
      1. Press Escape key
      2. Verify Sheet closes
      3. Open Sheet again
      4. Click outside Sheet
      5. Verify Sheet closes
    Expected Result: Sheet closes in both cases
    Failure Indicators: Sheet stays open
    Evidence: .sisyphus/evidence/task-4-sheet-close.png
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(chat): add ToolDetailSheet with smart output formatting`
  - Files: `src/components/chat/tool-detail-sheet.tsx`, `src/components/chat/format-tool-output.ts`
  - Pre-commit: `bun run build`

- [x] 5. Smart output formatter utility

  **What to do**:
  - Create `src/components/chat/format-tool-output.ts`
  - Define `formatToolOutput(toolName: string, rawOutput: string): React.ReactNode` (or a structured result type)
  - Implement per-category formatting:
    - **Agent tools** (`call_actor`, `call_scribe`, `call_archivist`): Extract `inner.output` from ToolResult envelope, render as formatted text with paragraph breaks. Show `sessionId` and `isNewSession` as metadata badges.
    - **File read tools** (`read_file`): Render content in a `<pre>` code block with syntax highlighting class (CSS-only, no runtime highlighter). Show file path as a header.
    - **File write/edit tools** (`write_file`, `edit_file`): Show success message with file path. If content is included in output, show diff preview (search/replace for edit_file).
    - **Glob tools** (`glob_files`): Parse file list, render as bulleted list of file paths.
    - **Character tools** (`resolve_character`): Show resolved character name and match info.
    - **System tools** (`clear_interaction_log`, `list_characters`, `reset_story`): Show simple success/failure message.
    - **Error**: Red alert box with error message.
  - Export `parseToolOutput()` and `extractDisplayData()` (moved from tool-call-card.tsx) for reuse by ToolDetailSheet

  **Must NOT do**:
  - Do not add runtime syntax highlighting (e.g., highlight.js, prism) — use CSS-only approach
  - Do not modify tool-call-card.tsx yet (it will be removed in Task 8)
  - Do not import React in this file if possible — return structured data, let the Sheet component render it

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Logic-heavy utility with multiple formatting paths and JSON parsing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 4 (if returning structured data), 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/components/chat/tool-call-card.tsx:34-59` — parseToolOutput + extractDisplayData to move here
  - `src/lib/tool-result.ts` — ToolResult envelope format

  **API/Type References**:
  - `src/components/chat/tool-meta.ts` (from Task 1) — ToolMeta.category for dispatching format logic

  **WHY Each Reference Matters**:
  - tool-call-card.tsx:34-59 — The existing parsing logic that must be preserved, not rewritten
  - tool-result.ts — Defines the JSON envelope that parseToolOutput must handle

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Format agent tool output
    Tool: Bash
    Preconditions: format-tool-output.ts created
    Steps:
      1. Import formatToolOutput in a temporary test script
      2. Call with toolName="call_actor", rawOutput='{"ok":true,"data":"{\"output\":\"塞莉娅缓缓转身...\",\"sessionId\":\"ses_123\",\"isNewSession\":true}"}'
      3. Verify result contains the output text and session metadata
    Expected Result: Returns structured data with output text and metadata
    Failure Indicators: Returns raw JSON string, parsing fails
    Evidence: .sisyphus/evidence/task-5-format-agent.txt

  Scenario: Format file list output
    Tool: Bash
    Preconditions: format-tool-output.ts created
    Steps:
      1. Call with toolName="glob_files", rawOutput='{"ok":true,"data":"characters/塞莉娅.md\\ncharacters/艾德蒙.md\\nworld.md"}'
      2. Verify result contains structured file list
    Expected Result: Returns array of file paths for list rendering
    Failure Indicators: Returns raw newline-separated string
    Evidence: .sisyphus/evidence/task-5-format-glob.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: (included in Task 4 commit)

- [x] 6. MessageItem refactor: separate text/tool rendering

  **What to do**:
  - **This is the critical integration task.** Refactor `src/components/chat/message-item.tsx` to separate text parts from tool parts in rendering.
  - Replace the current model (text + tools mixed in one bubble) with the new model (text → bubbles, tools → Tag rows)
  - Merge `renderParts()` and `renderSegmentParts()` into a single `renderMessageParts(parts: UIMessage["parts"])` function that returns `{ textParts: JSX.Element[], toolParts: JSX.Element[] }` — separated for independent rendering
  - New rendering model for **single-step messages** (user or simple assistant):
    ```
    [AgentLabel] [📋 button]
    [Text bubble: max-w-[80%] rounded-xl ...]
    [Tag row: flex flex-wrap gap-1.5]  ← only if tool parts exist
    ```
  - New rendering model for **multi-step messages** (segmented):
    ```
    [📋 button]
    For each segment:
      [AgentLabel]
      [Text bubble: max-w-[80%] rounded-xl ...]  ← only if text parts exist
      [Tag row: flex flex-wrap gap-1.5]  ← only if tool parts exist
    ```
  - Key rule: If a segment has ONLY tool parts and NO text, render only the Tag row — no empty bubble
  - Key rule: If a segment has ONLY text and NO tools, render only the bubble — no empty Tag row
  - Replace `ToolCallCard` rendering with `ToolTag` rendering
  - Add Sheet state management at MessageItem level:
    - `const [selectedTool, setSelectedTool] = useState<{toolName, input, output, error, state} | null>(null)`
    - Pass `onClick={() => setSelectedTool(...)}` to each ToolTag
    - Render `<ToolDetailSheet open={!!selectedTool} onOpenChange={...} {...selectedTool} />`
  - Use `toolCallId` from DynamicToolUIPart as stable key (not array index)
  - Update `extractAgentLabel` to use `toolNameToAgentKey` from tool-meta.ts
  - Keep SessionModal rendering as-is

  **Must NOT do**:
  - Do not modify MessageList or ProgressIndicator
  - Do not modify splitBySteps logic (only change how segments are rendered)
  - Do not remove the 📋 Session Log button
  - Do not change user message rendering

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core architectural refactor of the main rendering component, requires careful understanding of the message part model
  - **Skills**: [`git-master`]
    - `git-master`: For tracking the refactor changes

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Wave 2)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Tasks 1, 3, 4, 5

  **References**:

  **Pattern References**:
  - `src/components/chat/message-item.tsx:44-84` — Current renderParts() to refactor
  - `src/components/chat/message-item.tsx:86-119` — Current renderSegmentParts() to merge
  - `src/components/chat/message-item.tsx:121-203` — Current MessageItem component structure
  - `src/components/chat/message-segments.tsx:16-49` — splitBySteps() logic (keep unchanged)
  - `src/components/chat/tool-call-card.tsx:63-69` — Dynamic tool part type casting pattern

  **API/Type References**:
  - `src/components/chat/tool-tag.tsx` (from Task 3) — ToolTag component API
  - `src/components/chat/tool-detail-sheet.tsx` (from Task 4) — ToolDetailSheet component API
  - `src/components/chat/tool-meta.ts` (from Task 1) — toolNameToAgentKey helper

  **WHY Each Reference Matters**:
  - message-item.tsx:44-84 — The exact rendering logic being refactored, must understand part iteration
  - message-item.tsx:86-119 — Duplicate logic to merge, reducing maintenance burden
  - message-item.tsx:121-203 — The component structure that must be reorganized for text/tool separation
  - message-segments.tsx:16-49 — The segmentation logic that must be preserved (not changed)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Text and tools render as separate nodes
    Tool: Playwright
    Preconditions: `bun dev` running, project with multi-step chat history
    Steps:
      1. Navigate to chat with existing tool call messages
      2. Observe: text content renders in chat bubbles
      3. Observe: tool calls render as compact Tags in a horizontal row BELOW the bubble
      4. Observe: Tags are NOT inside any bubble
      5. Take screenshot
    Expected Result: Clear visual separation between text bubbles and tool Tag rows
    Failure Indicators: Tags still inside bubbles, layout broken, missing content
    Evidence: .sisyphus/evidence/task-6-separated-rendering.png

  Scenario: Tool-only message has no empty bubble
    Tool: Playwright
    Preconditions: Message with only tool calls (no text parts)
    Steps:
      1. Find a message that contains only dynamic-tool parts
      2. Observe: Only Tag row renders, no empty chat bubble
    Expected Result: No empty bubble, only Tags
    Failure Indicators: Empty bubble visible alongside Tags
    Evidence: .sisyphus/evidence/task-6-no-empty-bubble.png

  Scenario: Multi-step segmentation preserved
    Tool: Playwright
    Preconditions: Message with actor → scribe → archivist pipeline
    Steps:
      1. Observe: GM segment has AgentLabel "GM" + text bubble + Tag row
      2. Observe: Actor segment has AgentLabel "演员" + text bubble + Tag row
      3. Observe: Scribe segment has AgentLabel "书记" + text bubble + Tag row
      4. Observe: Archivist segment has AgentLabel "场记" + Tag row
    Expected Result: Each agent step is visually labeled and separated
    Failure Indicators: Labels missing, segments merged, wrong agent attribution
    Evidence: .sisyphus/evidence/task-6-segmentation.png

  Scenario: User messages unchanged
    Tool: Playwright
    Preconditions: Chat with user messages
    Steps:
      1. Observe user messages render as right-aligned blue bubbles
      2. Observe no Tags in user messages
    Expected Result: User message rendering identical to before refactor
    Failure Indicators: User messages changed layout or style
    Evidence: .sisyphus/evidence/task-6-user-messages.png
  ```

  **Commit**: YES
  - Message: `refactor(chat): separate text and tool rendering in MessageItem`
  - Files: `src/components/chat/message-item.tsx`
  - Pre-commit: `bun run build`

- [x] 7. Wire ToolTag hover + click interactions

  **What to do**:
  - Ensure ToolTag hover Tooltip is working in the integrated MessageItem context
  - Ensure ToolTag click opens ToolDetailSheet with the correct tool data
  - Verify Sheet is singleton: clicking Tag B while Sheet shows Tag A should switch to Tag B's content
  - Verify Sheet closes on Escape, outside click, and close button
  - Verify Sheet selection survives streaming re-renders (use toolCallId as key)
  - Verify Tooltip content shows the correct input parameters for each tool type
  - Verify Tooltip disappears on mouse leave
  - Test the full interaction flow: hover → see params → click → Sheet opens → see input + output → close

  **Must NOT do**:
  - Do not add new features beyond what's specified
  - Do not modify ToolDetailSheet formatting (that's Task 5's scope)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Interaction wiring and visual polish
  - **Skills**: [`/frontend-ui-ux`, `/playwright`]
    - `/frontend-ui-ux`: For interaction design refinement
    - `/playwright`: For browser-based interaction testing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Task 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `src/components/chat/tool-tag.tsx` (from Task 3) — ToolTag component with onClick prop
  - `src/components/chat/tool-detail-sheet.tsx` (from Task 4) — ToolDetailSheet component API
  - `src/components/chat/message-item.tsx` (from Task 6) — MessageItem with Sheet state management

  **WHY Each Reference Matters**:
  - tool-tag.tsx: Defines the click/hover interface that needs to be verified in context
  - tool-detail-sheet.tsx: The Sheet that opens on click, needs to receive correct data
  - message-item.tsx: Where the wiring happens, need to verify state management

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full hover → click → Sheet flow
    Tool: Playwright
    Preconditions: `bun dev` running, chat with completed tool calls
    Steps:
      1. Hover over a ToolTag → wait 500ms → observe Tooltip with key parameters
      2. Move mouse away → Tooltip disappears
      3. Click the ToolTag → Sheet slides in from right
      4. Observe Sheet header shows tool icon + label
      5. Observe "调用参数" section shows all input parameters
      6. Observe "执行结果" section shows formatted output
      7. Press Escape → Sheet closes
      8. Take screenshots at each step
    Expected Result: Complete interaction flow works smoothly
    Failure Indicators: Tooltip doesn't appear, Sheet doesn't open, missing data, Sheet doesn't close
    Evidence: .sisyphus/evidence/task-7-full-flow.png

  Scenario: Sheet singleton behavior
    Tool: Playwright
    Preconditions: Multiple tool Tags visible
    Steps:
      1. Click Tag A → Sheet opens with Tag A data
      2. Click Tag B (while Sheet is open) → Sheet content switches to Tag B data
      3. Verify Sheet didn't close and reopen (no flash)
    Expected Result: Sheet content switches smoothly without closing
    Failure Indicators: Sheet closes and reopens, two Sheets appear
    Evidence: .sisyphus/evidence/task-7-singleton.png

  Scenario: Streaming state survival
    Tool: Playwright
    Preconditions: `bun dev` running, about to send a story action
    Steps:
      1. Send a story action
      2. During streaming, click a ToolTag that just completed
      3. Sheet opens with the tool's data
      4. Wait for streaming to complete
      5. Verify Sheet is still open with correct data (not reset)
    Expected Result: Sheet stays open and correct during streaming updates
    Failure Indicators: Sheet closes during streaming, data resets
    Evidence: .sisyphus/evidence/task-7-streaming.png
  ```

  **Commit**: YES
  - Message: `feat(chat): wire ToolTag hover tooltip and click-to-sheet interaction`
  - Files: `src/components/chat/tool-tag.tsx`, `src/components/chat/message-item.tsx`
  - Pre-commit: `bun run build`

- [x] 8. Remove ToolCallCard + dead code

  **What to do**:
  - Delete `src/components/chat/tool-call-card.tsx`
  - Search for any remaining imports of `ToolCallCard` and remove them
  - Search for any remaining references to old constants (`TOOL_META`, `AGENT_TOOLS`, `DEFAULT_META`) that should have been replaced in Task 1
  - Run `bun run build` and `bun run lint` to verify zero errors
  - Run `grep -r "tool-call-card" src/` to verify no remaining references

  **Must NOT do**:
  - Do not delete tool-meta.ts or any new components
  - Do not modify any working component's behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple deletion and verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential after Task 7)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `src/components/chat/tool-call-card.tsx` — The file to delete

  **WHY Each Reference Matters**:
  - tool-call-card.tsx: Must verify all its logic has been migrated before deletion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Clean removal with no references
    Tool: Bash
    Preconditions: All previous tasks complete
    Steps:
      1. Run `grep -r "tool-call-card\|ToolCallCard" src/ --include="*.ts" --include="*.tsx"`
      2. Run `bun run build`
      3. Run `bun run lint`
    Expected Result: grep returns zero matches, build passes, lint passes
    Failure Indicators: grep finds remaining references, build fails
    Evidence: .sisyphus/evidence/task-8-clean-removal.txt
  ```

  **Commit**: YES
  - Message: `cleanup(chat): remove ToolCallCard component`
  - Files: delete `src/components/chat/tool-call-card.tsx`
  - Pre-commit: `bun run build && bun run lint`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `bun run lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state (`bun dev`). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, streaming states, dark mode. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `refactor(chat): unify tool metadata into single source of truth` — tool-meta.ts, agent-label.tsx, message-item.tsx, message-segments.tsx, message-list.tsx, session-modal.tsx, character-label.tsx, progress-indicator.tsx, tool-call-card.tsx
- **2**: `chore(ui): add shadcn Sheet and Tooltip components` — sheet.tsx, tooltip.tsx
- **3**: `feat(chat): add ToolTag component for compact tool call display` — tool-tag.tsx
- **4**: `feat(chat): add ToolDetailSheet with smart output formatting` — tool-detail-sheet.tsx, format-tool-output.ts
- **5**: `refactor(chat): separate text and tool rendering in MessageItem` — message-item.tsx
- **6**: `feat(chat): wire ToolTag hover tooltip and click-to-sheet interaction` — tool-tag.tsx, message-item.tsx
- **7**: `cleanup(chat): remove ToolCallCard component` — delete tool-call-card.tsx

---

## Success Criteria

### Verification Commands
```bash
bun run build  # Expected: zero errors
bun run lint   # Expected: zero errors
```

### Final Checklist
- [ ] Tool calls render as compact Tags (not large cards)
- [ ] Tags are independent nodes (not nested in chat bubbles)
- [ ] Hover on Tag shows key parameters tooltip
- [ ] Click on Tag opens right-side Sheet with input + output
- [ ] Multiple tool Tags display horizontally in a row
- [ ] Message with only tool calls has no empty bubble
- [ ] All 11 tools have metadata entries
- [ ] Smart formatting works per tool category
- [ ] ProgressIndicator still works during streaming
- [ ] SessionModal still works
- [ ] No regressions in user message rendering
