# Lexical 聊天输入 + @角色 Mention

## TL;DR

> **Quick Summary**: 将当前纯 textarea 聊天输入替换为 Lexical 富文本编辑器，集成 lexical-beautiful-mentions 实现 @角色引用（pill 渲染 + 结构化数据），仅完成到可发送 mention 消息为止。
> 
> **Deliverables**:
> - 新 `GET /api/projects/:id/characters` API 返回 `{ name, l0 }[]`
> - 新 `useCharacters(projectId)` hook 轮询角色数据
> - 新 Lexical 编辑器组件替代 `ChatInput`（含 @角色 mention、Enter 发送、Shift+Enter 换行、自动高度）
> - `page.tsx` 集成（移除 input/setInput 状态，改用 onSend 回调）
> - SSR 处理（dynamic import + ssr: false）
> 
> **Estimated Effort**: Short (~1.5 天)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 6

---

## Context

### Original Request
用户希望在输入框中通过 @ 的方式直接引用已存在的角色，简化输入的同时给 LLM 更清晰的角色输入。经广泛调研（8 个富文本编辑器、多个叙事 AI 产品、多个开源聊天 UI），选定 Lexical + lexical-beautiful-mentions 方案。

### Interview Summary
**Key Discussions**:
- @角色 mention 是核心需求，slash 命令/消息气泡渲染/草稿持久化暂不需要
- 叙事类产品输入本质是纯文本，不需要富格式（加粗/斜体等）
- CJK/IME 兼容对中文用户群体至关重要 → Lexical 是最佳选择
- 用户明确限定范围到 Phase 0-3

**Research Findings**:
- lexical-beautiful-mentions v0.1.48: `items: Record<string, (string | {value, ...data})[]>`, `creatable`, `menuComponent`/`menuItemComponent`
- BeautifulMentionNode.getTextContent() 返回 trigger+value（如 `@林黛玉`），LLM 原生理解
- $getRoot().getTextContent() 在段落间产生 `\n\n` — 需 LineBreakNode 方案
- sendMessage({ text }, { body: { mentions } }) 可传递 mention 元数据
- Next.js SSR: 需要 `dynamic(() => import(...), { ssr: false })`
- 已知 IME 闪烁 bug: facebook/lexical#7985

### Metis Review
**Identified Gaps** (addressed):
- BeautifulMentionNode 必须注册在 editor nodes 数组中 → 已纳入 Task 3
- $getTextContent() 段落间 \n\n 问题 → 采用 LineBreakNode 方案
- Mention 菜单与 Enter 提交的键盘冲突 → 用 onMenuOpen/onMenuClose 追踪状态
- SSR 需要 dynamic import → 已纳入 Task 5

---

## Work Objectives

### Core Objective
用 Lexical + lexical-beautiful-mentions 替换纯 textarea，实现 @角色 mention 功能（pill 渲染 + 结构化数据提取 + AI SDK 消息发送集成）。

### Concrete Deliverables
- `src/app/api/projects/[id]/characters/route.ts` — 角色列表 API
- `src/components/chat/use-characters.ts` — 角色数据 hook
- `src/components/chat/chat-input.tsx` — 重写为 Lexical 编辑器
- `src/components/chat/chat-input/` — 编辑器子组件目录
- `src/app/page.tsx` — 集成改动

### Definition of Done
- [ ] 输入 `@` 弹出角色下拉列表，显示角色名 + L0 描述
- [ ] 选择角色后渲染为彩色 pill（可整块删除）
- [ ] Enter 发送消息，Shift+Enter 换行
- [ ] 发送后编辑器清空
- [ ] GM 收到含 `@角色名` 的纯文本
- [ ] `bun run build` 通过

### Must Have
- @角色 mention pill 渲染
- 角色下拉列表（搜索过滤）
- Enter 发送 / Shift+Enter 换行
- 编辑器自动高度（单行→350px）
- SSR 正常工作
- 现有功能不退化（停止按钮、disabled 状态）

### Must NOT Have (Guardrails)
- 不实现消息气泡中的 mention 渲染
- 不实现 / 斜杠命令
- 不实现草稿持久化
- 不实现 #场景 mention
- 不修改后端 narrative route 的 mention 处理逻辑
- 不引入 Tiptap、Plate 或其他富文本编辑器
- 不在编辑器中支持富格式（加粗/斜体/代码块等）
- 不使用 lexical-beautiful-mentions 的 combobox 模式

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun:test)
- **Automated tests**: Tests-after
- **Framework**: bun:test

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, type @, assert dropdown, select, assert pill, screenshot
- **API**: Use Bash (curl) — Send request, assert status + response fields
- **Module**: Use Bash (bun test) — Import, call, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - foundation):
├── Task 1: Install dependencies [quick]
└── Task 2: Character data API + hook [unspecified-high]

Wave 2 (After Wave 1 - core editor):
├── Task 3: Lexical editor component [deep]
├── Task 4: Editor theme + mention menu styling [visual-engineering]
└── Task 5: page.tsx integration + SSR [unspecified-high]

Wave FINAL (After ALL tasks — 3 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
└── Task F3: Real manual QA (unspecified-high + playwright)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 5
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | - | 3, 4 |
| 2 | - | 3 |
| 3 | 1, 2 | 5 |
| 4 | 1 | 5 |
| 5 | 3, 4 | F1-F3 |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `unspecified-high`
- **Wave 2**: 3 tasks — T3 → `deep`, T4 → `visual-engineering`, T5 → `unspecified-high`
- **FINAL**: 3 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`

---

## TODOs

- [x] 1. 安装 Lexical + beautiful-mentions 依赖

  **What to do**:
  - 运行 `bun add lexical @lexical/react @lexical/plain-text @lexical/history @lexical/list @lexical/clear-editor lexical-beautiful-mentions`
  - 验证安装成功：`bun run build` 不报错
  - 检查 lexical-beautiful-mentions 的 peer dependency 是否与已安装的 lexical 版本兼容

  **Must NOT do**:
  - 不安装 @lexical/rich-text（聊天输入不需要富格式）
  - 不安装 tiptap、plate 或其他编辑器

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `package.json` — 当前依赖列表，确认不与现有包冲突

  **External References**:
  - npm: `lexical@0.44.0`, `@lexical/react@0.44.0`, `lexical-beautiful-mentions@0.1.48`
  - lexical-beautiful-mentions peer deps: `lexical >=0.11.0`, `@lexical/react >=0.11.0`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 依赖安装成功
    Tool: Bash
    Steps:
      1. Run `bun run build`
      2. Assert exit code 0
    Expected Result: Build passes with new dependencies
    Failure Indicators: Build fails, peer dependency warnings
    Evidence: .sisyphus/evidence/task-1-install-success.txt
  ```

  **Commit**: YES
  - Message: `feat(deps): add lexical + beautiful-mentions for chat input`
  - Files: `package.json`, `bun.lock`

---

- [x] 2. 角色数据 API + useCharacters hook

  **What to do**:
  - 新建 `src/app/api/projects/[id]/characters/route.ts`
    - GET handler：获取 project → 用 `listAllCharacters(storyDir)` 返回 `{ success: true, characters: { name: string; l0: string }[] }`
    - 复用现有 `getProject()` + `getProjectDir()` 模式（参照 `files/route.ts`）
  - 新建 `src/components/chat/use-characters.ts`
    - `useCharacters(projectId: string)` hook
    - fetch `/api/projects/:id/characters`
    - 5s 轮询（复用 SceneIndicator 的轮询模式）
    - 返回 `{ characters: { name: string; l0: string }[], loading: boolean }`
    - 使用 `useCallback` + `useEffect` + `setInterval` 模式

  **Must NOT do**:
  - 不修改现有 `/api/narrative/status` route
  - 不修改 `listAllCharacters()` 函数
  - 不添加角色 CRUD 功能

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/app/api/projects/[id]/files/route.ts:10-35` — GET handler 模式（getProject → storyDir → globNovelFiles）
  - `src/app/api/narrative/status/route.ts:34-36` — 角色文件列表获取模式
  - `src/components/chat/scene-indicator.tsx:17-38` — 5s 轮询 hook 模式
  - `src/context/character-resolver.ts:30-43` — `listAllCharacters()` 函数签名和返回类型
  - `src/project/manager.ts:51-61` — `getProject()` 函数

  **API/Type References**:
  - `src/project/types.ts:Project` — `{ id, name, createdAt, dataDir }`
  - `src/lib/project-path.ts:getProjectDir()` — 获取 `.novel` 目录名

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Characters API 返回角色列表
    Tool: Bash (curl)
    Preconditions: 项目存在且包含角色文件
    Steps:
      1. `curl http://localhost:4477/api/projects/{projectId}/characters`
      2. Assert response JSON has `success: true`
      3. Assert `characters` is array of `{ name: string, l0: string }`
    Expected Result: `{ success: true, characters: [{ name: "林黛玉", l0: "绛珠仙草转世..." }, ...] }`
    Failure Indicators: 404, missing characters field, wrong shape
    Evidence: .sisyphus/evidence/task-2-api-response.json

  Scenario: Characters API 项目不存在返回 404
    Tool: Bash (curl)
    Steps:
      1. `curl http://localhost:4477/api/projects/nonexistent/characters`
      2. Assert status 404
    Expected Result: `{ success: false, message: "Project not found: nonexistent" }`
    Evidence: .sisyphus/evidence/task-2-api-404.json
  ```

  **Commit**: YES
  - Message: `feat(api): add characters endpoint + useCharacters hook`
  - Files: `src/app/api/projects/[id]/characters/route.ts`, `src/components/chat/use-characters.ts`

---

- [x] 3. Lexical 编辑器核心组件

  **What to do**:
  - 创建目录 `src/components/chat/chat-input/`
  - 新建 `src/components/chat/chat-input/editor.tsx` — LexicalComposer 主组件
    - `initialConfig`: namespace='ChatInput', nodes=[BeautifulMentionNode], theme (含 beautifulMentions)
    - 使用 `PlainTextPlugin`（非 RichText，聊天输入不需要富格式）
    - 集成 `BeautifulMentionsPlugin`：items 来自 useCharacters，creatable=false，allowSpaces=false，autoSpace=true，menuComponent/menuItemComponent 自定义
    - 集成 `ClearEditorPlugin`
    - 集成 `HistoryPlugin`（undo/redo）
    - 集成自定义 `SubmitOnEnterPlugin`
    - 集成自定义 `AutoResizePlugin`
  - 新建 `src/components/chat/chat-input/plugins/submit-on-enter.tsx`
    - 注册 `KEY_ENTER_COMMAND` at `COMMAND_PRIORITY_HIGH`
    - Enter（无 Shift）：提取 text + mentions → 调用 onSend → CLEAR_EDITOR_COMMAND
    - Shift+Enter：返回 false 让 Lexical 默认处理（插入换行）
    - 追踪 mention 菜单状态（menuOpen ref）：菜单打开时 Enter 不提交
    - 使用 `$findBeautifulMentionNodes()` 提取 mention 元数据
    - **关键**：拦截 Enter 插入 LineBreakNode（而非新 ParagraphNode），避免 $getTextContent() 产生 \n\n
  - 新建 `src/components/chat/chat-input/plugins/auto-resize.tsx`
    - 监听编辑器内容变化，动态调整容器高度
    - min: ~40px（单行），max: 350px，超出后内部滚动
  - 新建 `src/components/chat/chat-input/utils.ts`
    - `extractMentions(editor)` → `{ trigger: string; value: string; data?: Record<string, unknown> }[]`
    - 使用 `$findBeautifulMentionNodes()` 实现
  - 新建 `src/components/chat/chat-input/theme.ts`
    - Lexical 主题对象，映射到 Tailwind class
    - `paragraph: 'mb-0'`（移除段落间距）
    - `beautifulMentions`: '@' 角色样式（使用 AGENT_COLORS.actor 颜色系）

  **Must NOT do**:
  - 不使用 RichTextPlugin（用 PlainTextPlugin）
  - 不实现 slash 命令
  - 不实现 #场景 mention
  - 不引入 tippy.js 或 @floating-ui/dom（beautiful-mentions 内置定位）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, but this is the critical path)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/components/chat/chat-input.tsx` — 当前 textarea 实现（替换目标），注意 composing 状态处理、adjustHeight、disabled 状态
  - `src/components/chat/character-label.tsx` — 角色标签渲染（复用颜色系统）
  - `src/components/chat/tool-meta.ts:13-18` — AGENT_COLORS 定义

  **API/Type References**:
  - `lexical@0.44.0`: `LexicalComposer`, `$getRoot`, `$getSelection`, `$isRangeSelection`, `$createParagraphNode`, `$createLineBreakNode`, `KEY_ENTER_COMMAND`, `COMMAND_PRIORITY_HIGH`, `CLEAR_EDITOR_COMMAND`
  - `@lexical/react@0.44.0`: `PlainTextPlugin`, `ContentEditable`, `LexicalErrorBoundary`, `HistoryPlugin`, `ClearEditorPlugin`, `OnChangePlugin`, `useLexicalComposerContext`
  - `lexical-beautiful-mentions@0.1.48`: `BeautifulMentionsPlugin`, `BeautifulMentionNode`, `$findBeautifulMentionNodes`, `BeautifulMentionsTheme`, `BeautifulMentionsMenuProps`, `BeautifulMentionsMenuItemProps`

  **External References**:
  - Dyad 实现: https://github.com/dyad-sh/dyad/blob/main/src/components/chat/LexicalChatInput.tsx — BeautifulMentionsPlugin + KEY_ENTER_COMMAND + COMMAND_PRIORITY_HIGH 的生产参考
  - Lexical 官方 chat 示例: https://github.com/facebook/lexical/blob/main/examples/website-chat/ — SubmitOnEnterPlugin + ClearEditorPlugin 模式
  - beautiful-mentions 主题: https://github.com/sodenn/lexical-beautiful-mentions/blob/main/www/lib/editor-theme.ts — BeautifulMentionsTheme + Tailwind 样式参考

  **WHY Each Reference Matters**:
  - `chat-input.tsx` — 需要保留 composing 处理逻辑、disabled 状态、stop 按钮
  - `character-label.tsx` + `AGENT_COLORS` — mention pill 颜色需与现有角色标签一致
  - Dyad — 唯一使用 Lexical + beautiful-mentions 的 AI 聊天输入生产实现，直接参考其 KEY_ENTER_COMMAND 处理和 menuComponent 渲染
  - Lexical website-chat — 官方聊天输入示例，CLEAR_EDITOR_COMMAND + SubmitOnEnterPlugin 模式

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: @触发角色下拉列表
    Tool: Playwright
    Preconditions: 项目包含角色文件（如 林黛玉.md, 贾宝玉.md）
    Steps:
      1. 打开聊天页面
      2. 点击输入框
      3. 输入 "@"
      4. 等待下拉列表出现
      5. 断言下拉列表包含 "林黛玉" 和 "贾宝玉"
    Expected Result: 角色下拉列表出现，显示所有角色
    Failure Indicators: 下拉列表不出现、角色缺失
    Evidence: .sisyphus/evidence/task-3-mention-trigger.png

  Scenario: 选择角色后渲染为 pill
    Tool: Playwright
    Steps:
      1. 输入 "@" 触发下拉
      2. 点击 "林黛玉"
      3. 断言输入框中出现彩色 pill "@林黛玉"
      4. 断言 pill 可整块删除（Backspace 一次删除整个 pill）
    Expected Result: 角色渲染为 pill，可整块删除
    Failure Indicators: pill 未渲染、删除行为异常
    Evidence: .sisyphus/evidence/task-3-mention-pill.png

  Scenario: Enter 发送消息
    Tool: Playwright
    Steps:
      1. 在输入框中输入文本 + @角色
      2. 按 Enter
      3. 断言编辑器清空
      4. 断言消息已发送（消息列表出现新消息）
    Expected Result: Enter 发送消息并清空编辑器
    Failure Indicators: 编辑器未清空、消息未发送
    Evidence: .sisyphus/evidence/task-3-enter-submit.png

  Scenario: Shift+Enter 插入换行
    Tool: Playwright
    Steps:
      1. 输入 "第一行"
      2. 按 Shift+Enter
      3. 输入 "第二行"
      4. 断言编辑器包含两行文本
      5. 断言未发送消息
    Expected Result: Shift+Enter 插入换行而非发送
    Failure Indicators: Shift+Enter 触发发送
    Evidence: .sisyphus/evidence/task-3-shift-enter-newline.png

  Scenario: 编辑器自动高度
    Tool: Playwright
    Steps:
      1. 输入多行文本（超过 3 行）
      2. 断言编辑器高度增长但不超过 350px
      3. 删除文本至单行
      4. 断言编辑器高度回缩
    Expected Result: 高度随内容自适应，上限 350px
    Failure Indicators: 高度不变化、超过上限、不回缩
    Evidence: .sisyphus/evidence/task-3-auto-resize.png
  ```

  **Commit**: YES
  - Message: `feat(chat-input): replace textarea with Lexical editor + @角色 mention`
  - Files: `src/components/chat/chat-input/`

---

- [x] 4. Mention 菜单样式 + pill 主题

  **What to do**:
  - 在 `src/components/chat/chat-input/theme.ts` 中定义完整主题
    - `beautifulMentions` 主题：'@' 角色使用 `AGENT_COLORS.actor` (#EC4899) 颜色系
    - '@Focused' 状态：ring 高亮
  - 新建 `src/components/chat/chat-input/mention-menu.tsx`
    - `MentionMenu` 组件：自定义下拉菜单容器（shadcn/ui Popover 风格：rounded-md, border, bg-popover, shadow-md）
    - `MentionMenuItem` 组件：自定义菜单项（复用 CharacterLabel 渲染角色名 + 显示 L0 描述）
    - **重要**：这两个组件必须定义在组件外部或用 useMemo 包裹，确保引用稳定
  - 在 `editor.tsx` 中集成 menuComponent + menuItemComponent

  **Must NOT do**:
  - 不使用 cmdk 或 Radix Popover（beautiful-mentions 内置定位）
  - 不为 #场景 定义主题（不在本次范围）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/components/chat/character-label.tsx:13-33` — 角色标签样式（颜色、圆角、字号）
  - `src/components/chat/tool-meta.ts:13-18` — AGENT_COLORS.actor = "#EC4899"
  - `src/app/globals.css:51-84` — CSS 变量（bg-popover, text-foreground, bg-accent 等）

  **External References**:
  - beautiful-mentions 主题示例: https://github.com/sodenn/lexical-beautiful-mentions/blob/main/www/lib/editor-theme.ts — Tailwind class 模式
  - Dyad CustomMenu: https://github.com/dyad-sh/dyad/blob/main/src/components/chat/LexicalChatInput.tsx — menuComponent/menuItemComponent 实现

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Mention 下拉菜单样式匹配 shadcn/ui
    Tool: Playwright
    Steps:
      1. 输入 "@" 触发下拉
      2. 截图下拉菜单
      3. 断言菜单有 rounded-md, border, shadow 样式
      4. 断言菜单项显示角色名 + L0 描述
    Expected Result: 下拉菜单视觉风格与 shadcn/ui 一致
    Failure Indicators: 样式不一致、L0 不显示
    Evidence: .sisyphus/evidence/task-4-menu-style.png

  Scenario: Mention pill 颜色与 CharacterLabel 一致
    Tool: Playwright
    Steps:
      1. 选择 @角色 后截图
      2. 断言 pill 使用 AGENT_COLORS.actor (#EC4899) 颜色系
    Expected Result: pill 颜色与现有角色标签一致
    Failure Indicators: 颜色不匹配
    Evidence: .sisyphus/evidence/task-4-pill-color.png
  ```

  **Commit**: NO (groups with Task 3)

---

- [x] 5. page.tsx 集成 + SSR 处理

  **What to do**:
  - 重写 `src/components/chat/chat-input.tsx` 为入口组件
    - 使用 `dynamic(() => import('./chat-input/editor'), { ssr: false })` 加载 Lexical 编辑器
    - 保留外层容器样式（border-t, bg-background, px-4, py-3）
    - 保留发送/停止按钮逻辑
    - 新 props 接口：`{ projectId, onSend, status, onStop }`（移除 input/onInputChange/onSubmit）
  - 修改 `src/app/page.tsx`
    - 移除 `input` / `setInput` 状态
    - 移除 `handleSubmit`
    - 新增 `handleSend(text: string, mentions: MentionData[])` 回调
    - `handleSend` 内调用 `sendMessage({ text })`（mention 数据暂不传 body，保持最小改动）
    - 更新 `<ChatInput>` props：`projectId={projectId} onSend={handleSend} status={status} onStop={handleStop}`
  - 验证 SSR：`bun run build` 通过，页面正常加载

  **Must NOT do**:
  - 不修改 `/api/narrative/route.ts`（后端暂不处理 mentions）
  - 不修改 `MessageItem` 组件（不渲染消息中的 mention pill）
  - 不删除旧 `chat-input.tsx` 的备份（git 保留历史）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Tasks 3, 4)
  - **Blocks**: F1-F3
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `src/app/page.tsx:30-104` — 当前 ProjectChat 组件，重点：input/setInput 状态、handleSubmit、sendMessage 调用、ChatInput props
  - `src/components/chat/chat-input.tsx:7-13` — 当前 ChatInputProps 接口
  - `src/app/api/narrative/route.ts:49-55` — 后端提取用户消息文本的方式（确认不受影响）

  **API/Type References**:
  - `ai@^6.0.168`: `sendMessage({ text }, options?)` — options.body 可传额外数据
  - `DefaultChatTransport` — 已配置 `body: { projectId }`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 消息发送端到端
    Tool: Playwright
    Steps:
      1. 在 Lexical 输入框中输入 "让 @林黛玉 进场"
      2. 选择 @林黛玉 mention
      3. 按 Enter 发送
      4. 等待 AI 响应
      5. 断言消息列表出现用户消息 "让 @林黛玉 进场"
      6. 断言 AI 有响应
    Expected Result: 消息正常发送，GM 收到含 @林黛玉 的文本
    Failure Indicators: 消息未发送、GM 无响应、mention 文本丢失
    Evidence: .sisyphus/evidence/task-5-e2e-send.png

  Scenario: SSR 构建通过
    Tool: Bash
    Steps:
      1. Run `bun run build`
      2. Assert exit code 0
    Expected Result: Production build 成功
    Failure Indicators: Build 失败、SSR 错误
    Evidence: .sisyphus/evidence/task-5-build-success.txt

  Scenario: 停止按钮正常工作
    Tool: Playwright
    Steps:
      1. 发送一条消息
      2. 在 AI 响应流式输出时点击 "停止" 按钮
      3. 断言流式输出停止
    Expected Result: 停止按钮功能正常
    Failure Indicators: 停止按钮不出现或无效
    Evidence: .sisyphus/evidence/task-5-stop-button.png

  Scenario: 输入框 disabled 状态
    Tool: Playwright
    Steps:
      1. 发送一条消息
      2. 在 AI 响应期间断言输入框不可输入
      3. 响应完成后断言输入框可输入
    Expected Result: 流式响应期间输入框 disabled
    Failure Indicators: 流式期间仍可输入
    Evidence: .sisyphus/evidence/task-5-disabled-state.png
  ```

  **Commit**: YES
  - Message: `feat(chat): integrate Lexical editor into chat flow with SSR`
  - Files: `src/components/chat/chat-input.tsx`, `src/app/page.tsx`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `bun run lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

---

## Commit Strategy

- **Task 1**: `feat(deps): add lexical + beautiful-mentions for chat input` — package.json, bun.lock
- **Task 2**: `feat(api): add characters endpoint + useCharacters hook` — characters/route.ts, use-characters.ts
- **Tasks 3+4**: `feat(chat-input): replace textarea with Lexical editor + @角色 mention` — chat-input/ directory
- **Task 5**: `feat(chat): integrate Lexical editor into chat flow with SSR` — chat-input.tsx, page.tsx

---

## Success Criteria

### Verification Commands
```bash
bun run build          # Expected: success
bun run lint           # Expected: no errors
bun test               # Expected: all existing tests pass
curl localhost:4477/api/projects/{id}/characters  # Expected: { success: true, characters: [...] }
```

### Final Checklist
- [ ] 输入 @ 弹出角色下拉列表
- [ ] 选择角色后渲染为彩色 pill
- [ ] Enter 发送消息，Shift+Enter 换行
- [ ] 发送后编辑器清空
- [ ] GM 收到含 @角色名 的纯文本
- [ ] 停止按钮正常工作
- [ ] 流式响应期间输入框 disabled
- [ ] 编辑器自动高度（单行→350px）
- [ ] `bun run build` 通过
- [ ] 现有测试不退化
