# Multi-Agent Orchestration Fix + Multi-Project System

## TL;DR

> **Quick Summary**: 重构多 Agent 调度系统：引入多 Project 架构（每个对话=一个 Project），替换 asTool 为自定义 tool() 实现 sub-session 随机 ID + 显式复用，恢复交互日志工具，重写前端工具调用渲染。
> 
> **Deliverables**:
> - 多 Project 系统（CRUD + UI 选择器）
> - 重写的 Agent 调度（tool() 替代 asTool()，sessionId 显式复用）
> - 交互日志工具（append_interaction + clear_interaction_log）
> - 前端 ToolCallCard 组件
> - 重构的 Session 目录和索引
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: T1 → T6 → T9 → T10 → T13 → T14 → F1-F4

---

## Context

### Original Request
修复多 Agent 调度的 7 个问题 + 引入多 Project 架构

### Interview Summary
**Key Discussions**:
- 多 Project 架构：每个对话=一个 Project，每个 Project 只有一个主 session
- sub-session ID = 随机变量，GM 显式传 sessionId 复用，不传则新建
- 交互日志写入/清除由 GM 显式决策
- 移除 initStory/archiveStory（由 Project CRUD 替代）
- Session 目录不需要 threadId 子目录（每个 Project 只有一个主 session）
- Project ID 简短可读（如 p001 递增）
- .data_store/ 路径通过 .env.local 配置

**Research Findings**:
- 旧项目 `/data/novel/plugins/novel-theater/index.ts` 有 append_interaction + end_interaction + hook 注入
- asTool() 内部创建新 Runner，不传 onStream 则子 Agent 不流式冒泡
- DynamicCharacterSession('actor') 固定 key，所有角色共享 session
- characterName 从未传入 Actor context（现有 bug）
- interactionLog 字段在 prompt types 中声明但从未填充
- renderSegmentParts 对非 output 状态返回 null（流式时空白）

### Metis Review
**Identified Gaps** (addressed):
- characterName 未传入 Actor context → Fix #6 明确处理
- interactionLog 类型字段声明但未填充 → Fix #2 必须接线
- 前端流式时 dynamic-tool 渲染空白 → Fix #3 必须处理所有状态
- Session auto-creation 副作用 → 新 session manager 区分 get vs getOrCreate
- clearStorySession 只删 Map 不删磁盘 → Fix #5 处理

---

## Work Objectives

### Core Objective
引入多 Project 架构并修复多 Agent 调度的全部已知问题，使系统支持多对话管理、sub-session 显式复用、交互日志闭环、工具调用可视化。

### Concrete Deliverables
- `src/project/` — Project 数据模型 + CRUD + ID 生成
- `src/store/interaction-log.ts` — 交互日志读写
- `src/session/manager.ts` 重写 — project-scoped，区分 get/getOrCreate
- `src/agents/registry.ts` 重写 — tool() 替代 asTool()，5 个工具
- `src/components/chat/tool-call-card.tsx` — 工具调用折叠卡片
- `src/components/chat/project-selector.tsx` — Project 选择器
- `src/app/api/projects/` — Project CRUD API
- `.env.local` — DATA_STORE_DIR 配置

### Definition of Done
- [ ] `bun run build` 通过
- [ ] `bun test` 通过
- [ ] 可创建/切换/删除 Project
- [ ] GM 可调用 5 个工具（call_actor/call_scribe/call_archivist/append_interaction/clear_interaction_log）
- [ ] 前端工具调用显示为折叠卡片
- [ ] 交互日志写入 .novel/.working/ 并注入 buildStoryContext

### Must Have
- 多 Project CRUD + UI 选择器
- sub-session 随机 ID + 显式复用
- 交互日志闭环（写入+注入+清除）
- 工具调用折叠卡片
- characterName 传入 Actor context

### Must NOT Have (Guardrails)
- 不拼接语义到 sub-session ID（不按角色名/场景ID）
- 不自动追加交互日志（GM 显式决策）
- 不用 threadId 做子目录（每个 Project 只有一个主 session）
- 不 auto-create session on read（区分 get vs getOrCreate）
- 不保留 initStory/archiveStory 工具（由 Project CRUD 替代）
- 不冒泡子 Agent 内部事件到外层 stream

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: Tests-after
- **Framework**: bun test

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - all parallel):
├── T1: Project data model + ID generation + directory management
├── T2: .env.local DATA_STORE_DIR config
├── T3: Interaction log store (read/write/clear)
├── T4: Type definitions (Project, SessionIndex, etc.)
└── T5: Session directory restructure (remove threadId layer, add index.json)

Wave 2 (Core logic - some dependencies):
├── T6: Project API routes (CRUD) (depends: T1, T2)
├── T7: Narrative API route update (depends: T1, T5)
├── T8: Session manager rewrite (depends: T4, T5)
├── T9: Agent registry rewrite (depends: T3, T8)
└── T10: buildStoryContext interaction log injection (depends: T3)

Wave 3 (Frontend - some dependencies):
├── T11: Project selector UI component (depends: T6)
├── T12: Chat page rewrite - project-aware (depends: T6, T7)
├── T13: ToolCallCard component (depends: nothing)
└── T14: Remove initStory/archiveStory, update GM prompt (depends: T9)

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T6 → T7 → T12 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

- **T1**: - → T6, T7
-> **T2**: - → T6
- **T3**: - → T9, T10
- **T4**: - → T8
- **T5**: - → T7, T8
- **T6**: T1, T2 → T11, T12
- **T7**: T1, T5 → T12
- **T8**: T4, T5 → T9
- **T9**: T3, T8 → T14
- **T10**: T3 → -
- **T11**: T6 → -
- **T12**: T6, T7 → -
- **T13**: - → -
- **T14**: T9 → -

### Agent Dispatch Summary

- **Wave 1**: T1→`deep`, T2→`quick`, T3→`quick`, T4→`quick`, T5→`quick`
- **Wave 2**: T6→`unspecified-high`, T7→`unspecified-high`, T8→`deep`, T9→`deep`, T10→`quick`
- **Wave 3**: T11→`visual-engineering`, T12→`visual-engineering`, T13→`visual-engineering`, T14→`quick`
- **FINAL**: F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [x] 1. Project 数据模型 + ID 生成 + 目录管理

  **What to do**:
  - 创建 `src/project/` 目录
  - 创建 `src/project/types.ts`：定义 `Project` 接口（id: string, name: string, createdAt: string, dataDir: string）
  - 创建 `src/project/id-generator.ts`：生成简短可读 ID（如 `p001` 递增，扫描 `.data_store/projects/` 下已有目录确定下一个编号）
  - 创建 `src/project/manager.ts`：
    - `createProject(name: string)`: 生成 ID → 创建 `{dataStoreDir}/projects/{id}/` 目录 → 创建 `.novel/` 子目录（用现有 `src/store/templates.ts` 模板）→ 创建 `.sessions/` 子目录 → 写入 `project.json` → 返回 Project
    - `getProject(id: string)`: 读取 `{dataStoreDir}/projects/{id}/project.json`，不存在返回 undefined
    - `listProjects()`: 扫描 `{dataStoreDir}/projects/` 下所有 `project.json`，返回 Project[]
    - `deleteProject(id: string)`: 递归删除 `{dataStoreDir}/projects/{id}/` 目录
    - `getProjectDataDir(id: string)`: 返回 `{dataStoreDir}/projects/{id}/`
  - 创建 `src/project/data-store.ts`：读取 `.env.local` 中的 `DATA_STORE_DIR`，默认 `./.data_store`

  **Must NOT do**:
  - 不在 project.json 中存储 session 数据（session 索引在 .sessions/index.json）
  - 不使用 UUID 作为 project ID

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 数据模型设计 + 目录管理逻辑，需要理解现有 store 结构
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4, T5)
  - **Blocks**: T6, T7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/store/templates.ts` — .novel/ 模板文件定义，createProject 需要复用
  - `src/store/story-files.ts` — readNovelFile/globNovelFiles 的路径构建模式
  - `src/lib/project-path.ts` — 当前的项目路径解析逻辑（将被替换）

  **API/Type References**:
  - `src/session/types.ts` — StorySession 类型，需要适配 project-scoped
  - 旧项目 `/data/novel/plugins/novel-theater/index.ts:492-501` — TEMPLATES 和 SUBDIRS 定义

  **External References**:
  - Bun.file API: `Bun.file()`, `await file.exists()`, `await file.text()`, `await Bun.write()`

  **Acceptance Criteria**:
  - [ ] `src/project/types.ts` 存在，导出 Project 接口
  - [ ] `src/project/id-generator.ts` 生成 p001, p002... 格式 ID
  - [ ] `src/project/manager.ts` 实现 create/get/list/delete 四个操作
  - [ ] `src/project/data-store.ts` 读取 DATA_STORE_DIR 环境变量
  - [ ] createProject 创建完整目录结构：projects/{id}/.novel/ + .sessions/ + project.json

  **QA Scenarios**:

  ```
  Scenario: Create project creates correct directory structure
    Tool: Bash (bun test)
    Preconditions: DATA_STORE_DIR set to temp directory
    Steps:
      1. Call createProject("测试故事")
      2. Check {dataStoreDir}/projects/{id}/ exists
      3. Check {dataStoreDir}/projects/{id}/project.json exists and contains {"name": "测试故事"}
      4. Check {dataStoreDir}/projects/{id}/.novel/ exists with template files
      5. Check {dataStoreDir}/projects/{id}/.sessions/ exists
    Expected Result: All directories and files created
    Failure Indicators: Missing directories, empty project.json, no template files
    Evidence: .sisyphus/evidence/task-1-create-project.txt

  Scenario: ID generator produces sequential IDs
    Tool: Bash (bun test)
    Preconditions: Empty projects directory
    Steps:
      1. Generate ID → expect "p001"
      2. Create project dir p001
      3. Generate ID → expect "p002"
    Expected Result: Sequential IDs
    Evidence: .sisyphus/evidence/task-1-id-sequence.txt
  ```

  **Commit**: YES (groups with T2-T5)
  - Message: `feat(project): multi-project foundation + interaction log + session restructure`
  - Files: `src/project/`

- [x] 2. .env.local DATA_STORE_DIR 配置

  **What to do**:
  - 在 `.env.local` 中添加 `DATA_STORE_DIR=./.data_store`（如不存在则创建）
  - 在 `.env.example` 中添加 `DATA_STORE_DIR=./.data_store` 示例
  - 更新 `src/lib/project-path.ts`（或新建 `src/project/data-store.ts`）读取 `process.env.DATA_STORE_DIR`
  - 更新 `.gitignore` 添加 `.data_store/`

  **Must NOT do**:
  - 不硬编码路径
  - 不将 .data_store/ 提交到 git

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单配置修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T6
  - **Blocked By**: None

  **References**:
  - `src/lib/project-path.ts` — 当前项目路径解析
  - `.env.example` — 现有环境变量示例

  **Acceptance Criteria**:
  - [ ] `.env.local` 包含 `DATA_STORE_DIR=./.data_store`
  - [ ] `.env.example` 包含 `DATA_STORE_DIR=./.data_store`
  - [ ] `.gitignore` 包含 `.data_store/`
  - [ ] 代码可读取 `process.env.DATA_STORE_DIR`

  **QA Scenarios**:

  ```
  Scenario: DATA_STORE_DIR is read correctly
    Tool: Bash
    Steps:
      1. Set DATA_STORE_DIR=/tmp/test-store
      2. Import getDataStoreDir()
      3. Assert returns "/tmp/test-store"
    Expected Result: Correct path returned
    Evidence: .sisyphus/evidence/task-2-env-config.txt
  ```

  **Commit**: YES (groups with Wave 1)

- [x] 3. 交互日志 Store（read/write/clear）

  **What to do**:
  - 创建 `src/store/interaction-log.ts`
  - `appendInteractionLog(storyDir: string, characterName: string, output: string)`: 
    - 追加一条交互记录到 `{storyDir}/.working/latest-interaction.md`
    - 首次调用创建文件并写入头部 `# 本幕交互记录`
    - 后续调用追加 `## [N] {characterName}\n{output}`
  - `clearInteractionLog(storyDir: string)`: 删除 `{storyDir}/.working/latest-interaction.md`
  - `readInteractionLog(storyDir: string): string | null`: 读取文件内容，不存在返回 null
  - 参考旧项目 `/data/novel/plugins/novel-theater/index.ts:675-717` 的实现

  **Must NOT do**:
  - 不自动追加（由 GM 通过工具显式调用）
  - 不将交互日志计入 buildStoryContext 的 token 预算

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单文件读写，参考旧实现
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T9, T10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - 旧项目 `/data/novel/plugins/novel-theater/index.ts:675-717` — append_interaction + end_interaction 完整实现
  - `src/store/story-files.ts` — readNovelFile 模式

  **Acceptance Criteria**:
  - [ ] `src/store/interaction-log.ts` 导出三个函数
  - [ ] appendInteractionLog 创建 .working/ 目录和文件
  - [ ] 连续调用追加带编号的记录
  - [ ] clearInteractionLog 删除文件
  - [ ] readInteractionLog 返回内容或 null

  **QA Scenarios**:

  ```
  Scenario: Append and read interaction log
    Tool: Bash (bun test)
    Preconditions: Temp directory
    Steps:
      1. appendInteractionLog(tmpDir, "塞莉娅", "我要离开这里")
      2. appendInteractionLog(tmpDir, "希尔薇", "你不能走")
      3. const content = readInteractionLog(tmpDir)
      4. Assert content contains "## [1] 塞莉娅" and "## [2] 希尔薇"
    Expected Result: Two entries in log
    Evidence: .sisyphus/evidence/task-3-interaction-log.txt

  Scenario: Clear interaction log
    Tool: Bash (bun test)
    Steps:
      1. appendInteractionLog(tmpDir, "角色", "输出")
      2. clearInteractionLog(tmpDir)
      3. const content = readInteractionLog(tmpDir)
      4. Assert content is null
    Expected Result: File deleted
    Evidence: .sisyphus/evidence/task-3-clear-log.txt
  ```

  **Commit**: YES (groups with Wave 1)

- [x] 4. 类型定义（Project, SessionIndex 等）

  **What to do**:
  - 更新 `src/session/types.ts`：
    - 添加 `SessionIndex` 接口（subSessions: Map<string, {sessionId: string, createdAt: string}>）
    - 更新 `StorySession`：移除 threadId 字段，添加 projectId 字段
  - 确保 Project 类型在 `src/project/types.ts` 中定义（T1 负责）
  - 添加 `DynamicToolPart` 类型辅助（供前端使用）

  **Must NOT do**:
  - 不在 StorySession 中保留 threadId（改为 projectId）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 类型定义
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8
  - **Blocked By**: None

  **References**:
  - `src/session/types.ts` — 当前 StorySession 定义
  - `src/session/execution-log.ts` — ExecutionLog 类型

  **Acceptance Criteria**:
  - [ ] SessionIndex 接口定义
  - [ ] StorySession 使用 projectId 替代 threadId
  - [ ] 类型编译无错误

  **QA Scenarios**:

  ```
  Scenario: Type definitions compile
    Tool: Bash
    Steps:
      1. Run `bun run build`
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-4-types.txt
  ```

  **Commit**: YES (groups with Wave 1)

- [x] 5. Session 目录重构（移除 threadId 层，添加 index.json）

  **What to do**:
  - 重写 `src/session/file-session.ts`：适配新目录结构
  - 新目录结构：`{projectDir}/.sessions/{sessionId}/history.json`（无 threadId 子目录）
  - 新增 `src/session/index.ts`：读写 `{projectDir}/.sessions/index.json`
    - index.json 内容：`{ "gmSessionId": "gm-main", "subSessions": { "随机ID1": { "createdAt": "..." }, "随机ID2": { "createdAt": "..." } } }`
  - GM session ID 固定为 `gm-main`（每个 project 只有一个）
  - sub-session ID 随机生成
  - 移除 `DynamicCharacterSession` 类（不再需要延迟解析）

  **Must NOT do**:
  - 不用 threadId 做子目录
  - 不 auto-create session on read（实现 get vs getOrCreate 分离）
  - 不保留 DynamicCharacterSession

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 目录结构调整，参考现有 FileSession
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T7, T8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/session/file-session.ts` — 现有 FileSession 实现
  - `src/session/manager.ts` — 现有 session 管理逻辑

  **API/Type References**:
  - `src/session/types.ts` — SessionIndex 类型（T4 定义）

  **Acceptance Criteria**:
  - [ ] FileSession 适配新路径 `{projectDir}/.sessions/{sessionId}/history.json`
  - [ ] index.json 读写函数
  - [ ] GM session ID 固定 `gm-main`
  - [ ] getStorySession 在 project 不存在时返回 undefined（不 auto-create）
  - [ ] getOrCreateStorySession 显式创建

  **QA Scenarios**:

  ```
  Scenario: Session index created and read
    Tool: Bash (bun test)
    Steps:
      1. Create project directory
      2. getOrCreateStorySession(projectId)
      3. Check .sessions/index.json exists with gmSessionId: "gm-main"
      4. getStorySession(projectId) returns session without creating new one
    Expected Result: Index file correct, get returns existing
    Evidence: .sisyphus/evidence/task-5-session-index.txt
  ```

  **Commit**: YES (groups with Wave 1)

- [x] 6. Project API 路由（CRUD）

  **What to do**:
  - 创建 `src/app/api/projects/route.ts`：
    - `GET` → `listProjects()` 返回项目列表
    - `POST` → `createProject(name)` 创建新项目，返回 Project
  - 创建 `src/app/api/projects/[id]/route.ts`：
    - `GET` → `getProject(id)` 返回项目详情
    - `DELETE` → `deleteProject(id)` 删除项目
  - 创建 `src/app/api/projects/[id]/init/route.ts`：
    - `POST` → 重置 .novel/ 内容（替代原 resetStory）

  **Must NOT do**:
  - 不在 DELETE 中删除正在使用的项目（前端应检查）
  - 不复用原 story API 路径

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API 设计 + 错误处理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T7, T8, T9, T10)
  - **Blocks**: T11, T12
  - **Blocked By**: T1, T2

  **References**:
  - `src/app/api/story/route.ts` — 现有 story API（参考错误处理模式）
  - `src/project/manager.ts` (T1) — CRUD 函数
  - `src/app/api/sessions/route.ts` — 现有 sessions API 模式

  **Acceptance Criteria**:
  - [ ] GET /api/projects 返回项目列表
  - [ ] POST /api/projects {name: "xxx"} 创建项目
  - [ ] GET /api/projects/{id} 返回项目详情
  - [ ] DELETE /api/projects/{id} 删除项目
  - [ ] POST /api/projects/{id}/init 重置 .novel/

  **QA Scenarios**:

  ```
  Scenario: Create and list projects
    Tool: Bash (curl)
    Steps:
      1. curl -X POST /api/projects -d '{"name":"测试故事"}'
      2. Assert 200 + {id: "p001", name: "测试故事"}
      3. curl /api/projects
      4. Assert response contains p001
    Expected Result: Project created and listed
    Evidence: .sisyphus/evidence/task-6-api-crud.txt

  Scenario: Delete project removes directory
    Tool: Bash (curl)
    Steps:
      1. Create project via API
      2. curl -X DELETE /api/projects/{id}
      3. Assert 200
      4. Check directory no longer exists
    Expected Result: Directory removed
    Evidence: .sisyphus/evidence/task-6-api-delete.txt
  ```

  **Commit**: YES (groups with Wave 2)

- [x] 7. Narrative API 路由更新

  **What to do**:
  - 重写 `src/app/api/narrative/route.ts`：
    - 请求体改为 `{ messages, projectId }` (不再用 threadId)
    - 通过 projectId 获取 project 数据目录
    - `getOrCreateStorySession(projectId)` 获取 session
    - `setCurrentProjectId(projectId)` 替代 `setCurrentThreadId`
    - context 传入 `{ storyDir: project.dataDir + '/.novel' }`
    - 移除对 `resolveProjectPath()` 的依赖
  - 更新 `src/lib/project-path.ts` 或移除（由 project manager 替代）

  **Must NOT do**:
  - 不再使用 threadId 参数
  - 不调用 resolveProjectPath()

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API 路由核心逻辑修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T12
  - **Blocked By**: T1, T5

  **References**:
  - `src/app/api/narrative/route.ts` — 现有路由（完整重写）
  - `src/agents/registry.ts` — setCurrentThreadId（改为 setCurrentProjectId）

  **Acceptance Criteria**:
  - [ ] POST /api/narrative 接受 projectId 参数
  - [ ] 通过 projectId 定位 .novel/ 目录
  - [ ] Session 通过 projectId 获取
  - [ ] 无 threadId 引用

  **QA Scenarios**:

  ```
  Scenario: Narrative API uses projectId
    Tool: Bash (curl)
    Steps:
      1. Create project via API
      2. curl -X POST /api/narrative -d '{"messages":[...],"projectId":"p001"}'
      3. Assert stream response
    Expected Result: Agent run succeeds with projectId
    Evidence: .sisyphus/evidence/task-7-narrative-api.txt
  ```

  **Commit**: YES (groups with Wave 2)

- [x] 8. Session Manager 重写

  **What to do**:
  - 重写 `src/session/manager.ts`：
    - 所有函数改为 project-scoped：`getStorySession(projectId)` 而非 `getStorySession(threadId)`
    - `getStorySession(projectId)`: 返回 `StorySession | undefined`（不 auto-create）
    - `getOrCreateStorySession(projectId)`: 显式创建，读取 index.json 获取 gmSessionId，创建 FileSession + loadFromDisk
    - `createSubSession(projectId)`: 生成随机 sessionId → 注册到 index.json → 创建 FileSession → 返回 {sessionId, session}
    - `getSubSession(projectId, sessionId)`: 读取已有 sub-session（不存在返回 undefined）
    - `addExecutionLog(projectId, log)` / `getExecutionLogs(projectId)`
    - `clearStorySession(projectId)`: 从 Map 删除 + 从磁盘删除 index.json 和 session 文件
  - 移除 `DynamicCharacterSession` 类
  - 移除 `currentThreadId` 全局变量，改为 `currentProjectId`

  **Must NOT do**:
  - 不 auto-create on read（get 返回 undefined）
  - 不用 threadId
  - 不保留 DynamicCharacterSession

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Session 管理核心逻辑重写，需理解 FileSession + Runner 集成
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T9
  - **Blocked By**: T4, T5

  **References**:
  - `src/session/manager.ts` — 现有实现（完整重写）
  - `src/session/file-session.ts` (T5 更新后) — 新目录结构
  - `src/session/types.ts` (T4 更新后) — 新类型

  **Acceptance Criteria**:
  - [ ] getStorySession 不 auto-create
  - [ ] getOrCreateStorySession 显式创建
  - [ ] createSubSession 生成随机 ID 并注册到 index.json
  - [ ] getSubSession 按 sessionId 查找
  - [ ] 所有函数使用 projectId
  - [ ] 移除 DynamicCharacterSession 和 currentThreadId

  **QA Scenarios**:

  ```
  Scenario: Session manager project-scoped operations
    Tool: Bash (bun test)
    Steps:
      1. getOrCreateStorySession("p001") → creates session
      2. getStorySession("p001") → returns existing (not new)
      3. getStorySession("p999") → returns undefined
      4. createSubSession("p001") → returns {sessionId, session}
      5. getSubSession("p001", sessionId) → returns session
      6. getSubSession("p001", "nonexistent") → returns undefined
    Expected Result: Correct get/getOrCreate behavior, sub-session CRUD works
    Evidence: .sisyphus/evidence/task-8-session-manager.txt
  ```

  **Commit**: YES (groups with Wave 2)

- [x] 9. Agent Registry 重写（tool() 替代 asTool()）

  **What to do**:
  - 重写 `src/agents/registry.ts`：
    - 移除所有 `asTool()` 调用
    - 移除 `DynamicCharacterSession` 类
    - 用 `tool()` 定义 5 个工具：
      1. `call_actor`: parameters={character, direction, sessionId?}，execute 中 `Runner.run(actorAgent, ..., {context: {storyDir, characterName}, session})`，sessionId 有值则 getSubSession，无值则 createSubSession
      2. `call_scribe`: parameters={interactionLog, sceneContext, sessionId?}，同理
      3. `call_archivist`: parameters={narrativeSummary, literaryText, sessionId?}，同理
      4. `append_interaction`: parameters={characterName, output}，调用 `appendInteractionLog(storyDir, ...)`
      5. `clear_interaction_log`: parameters={}，调用 `clearInteractionLog(storyDir)`
    - `gmAgent.tools` = [call_actor, call_scribe, call_archivist, append_interaction, clear_interaction_log]
    - 移除 `initStoryTool`
    - 保留 `setCurrentProjectId(projectId)` 替代 `setCurrentThreadId`
    - 返回的 tool output 中包含 sessionId（如果新建了 sub-session），方便 GM 后续复用

  **Must NOT do**:
  - 不用 asTool()（全部替换为 tool()）
  - 不拼接语义到 sub-session ID
  - 不自动追加交互日志
  - 不冒泡子 Agent 事件

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 核心调度逻辑重写，需理解 Runner.run() + tool() API
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (must complete after T8)
  - **Blocks**: T14
  - **Blocked By**: T3, T8

  **References**:

  **Pattern References**:
  - `src/agents/registry.ts` — 现有 asTool() 注册（完整重写）
  - `@openai/agents-core/dist/agent.mjs:144-316` — asTool() 内部实现（理解 Runner.run 调用方式）
  - `src/agents/actor.ts` — Actor Agent 定义（context 需要 characterName）
  - `src/agents/scribe.ts` — Scribe Agent 定义
  - `src/agents/archivist.ts` — Archivist Agent 定义

  **API/Type References**:
  - `src/store/interaction-log.ts` (T3) — appendInteractionLog/clearInteractionLog
  - `src/session/manager.ts` (T8 更新后) — createSubSession/getSubSession

  **External References**:
  - `@openai/agents` tool() API: `import { tool } from '@openai/agents'`
  - `@openai/agents` Runner API: `import { Runner } from '@openai/agents'`

  **WHY Each Reference Matters**:
  - `agent.mjs:144-316` — 需要理解 asTool() 如何传 context 和 session 给子 Agent，手动 tool() 需要复制这些逻辑
  - `actor.ts:20` — characterName 从 context 读取，tool() execute 必须传入

  **Acceptance Criteria**:
  - [ ] 5 个 tool() 定义替代 3 个 asTool()
  - [ ] call_actor 传入 characterName 到 context
  - [ ] sessionId 参数可选，有值复用，无值新建
  - [ ] tool output 包含 sessionId
  - [ ] append_interaction 写入交互日志
  - [ ] clear_interaction_log 清除交互日志
  - [ ] 无 asTool() 调用
  - [ ] 无 DynamicCharacterSession

  **QA Scenarios**:

  ```
  Scenario: call_actor creates new session without sessionId
    Tool: Bash (bun test)
    Steps:
      1. Call call_actor execute with {character: "塞莉娅", direction: "逃离"}
      2. Assert session was created with random ID
      3. Assert output contains sessionId
    Expected Result: New sub-session created
    Evidence: .sisyphus/evidence/task-9-actor-new-session.txt

  Scenario: call_actor reuses session with sessionId
    Tool: Bash (bun test)
    Steps:
      1. Call call_actor with {character: "塞莉娅", direction: "逃离", sessionId: "existing-id"}
      2. Assert getSubSession called with "existing-id"
      3. Assert same session object used
    Expected Result: Existing session reused
    Evidence: .sisyphus/evidence/task-9-actor-reuse-session.txt

  Scenario: append_interaction writes to .working/
    Tool: Bash (bun test)
    Steps:
      1. Call append_interaction execute with {characterName: "塞莉娅", output: "我要离开"}
      2. Assert .novel/.working/latest-interaction.md exists
      3. Assert content contains "## [1] 塞莉娅"
    Expected Result: Interaction log file written
    Evidence: .sisyphus/evidence/task-9-append-interaction.txt
  ```

  **Commit**: YES (groups with Wave 2)

- [x] 10. buildStoryContext 交互日志注入

  **What to do**:
  - 更新 `src/context/build-story-context.ts`：
    - 在函数末尾追加交互日志注入
    - 调用 `readInteractionLog(dir)` 读取 `latest-interaction.md`
    - 如果存在，追加到输出末尾（**不计入 token 预算**，与旧项目一致）
    - 代码：`if (interactionLog) { outputParts.push(`## 本幕交互记录\n${interactionLog}`); }`

  **Must NOT do**:
  - 不将交互日志计入 2000 token 预算
  - 不自动追加日志（只读取已写入的）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 小改动，追加几行代码
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: T3

  **References**:
  - `src/context/build-story-context.ts` — 现有实现（追加注入逻辑）
  - `src/store/interaction-log.ts` (T3) — readInteractionLog 函数
  - 旧项目 `/data/novel/plugins/novel-theater/index.ts:720-737` — hook 注入交互日志的方式

  **Acceptance Criteria**:
  - [ ] buildStoryContext 返回内容包含交互日志
  - [ ] 交互日志不计入 token 预算（追加在截断逻辑之后）
  - [ ] 无交互日志时输出不变

  **QA Scenarios**:

  ```
  Scenario: Interaction log injected after token budget
    Tool: Bash (bun test)
    Steps:
      1. Write interaction log to test dir
      2. Call buildStoryContext(testDir)
      3. Assert output contains "## 本幕交互记录"
      4. Assert interaction log content appears AFTER budget-limited content
    Expected Result: Interaction log present, not truncated
    Evidence: .sisyphus/evidence/task-10-context-inject.txt
  ```

  **Commit**: YES (groups with Wave 2)

- [x] 11. Project Selector UI 组件

  **What to do**:
  - 创建 `src/components/chat/project-selector.tsx`：
    - 左侧/顶部 Project 列表，显示项目名称 + ID
    - "新建项目" 按钮 → 输入名称 → 调用 POST /api/projects
    - 点击项目 → 切换当前 project → 加载对应对话
    - 删除按钮 → 确认 → 调用 DELETE /api/projects/{id}
    - 当前项目高亮
  - 使用 shadcn/ui 组件（Button, Dialog, Input, ScrollArea）
  - 状态管理：当前 projectId 存在顶层，传递给 useChat transport

  **Must NOT do**:
  - 不在组件内管理 session（由 page.tsx 管理）
  - 不使用 localStorage 存储 projectId（使用组件状态）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 组件开发
  - **Skills**: [`/frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T6

  **References**:
  - `src/components/chat/chat-layout.tsx` — 布局组件
  - `src/components/ui/` — shadcn/ui 组件库
  - `src/app/api/projects/` (T6) — Project API

  **Acceptance Criteria**:
  - [ ] ProjectSelector 组件渲染项目列表
  - [ ] 可新建项目（输入名称 + 创建）
  - [ ] 可切换项目
  - [ ] 可删除项目
  - [ ] 当前项目高亮

  **QA Scenarios**:

  ```
  Scenario: Create and switch projects
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:4477
      2. Click "新建项目" button
      3. Type "测试故事" in input
      4. Click confirm
      5. Assert "测试故事" appears in project list
      6. Click on "测试故事"
      7. Assert project is highlighted as active
    Expected Result: Project created and switchable
    Evidence: .sisyphus/evidence/task-11-project-selector.png
  ```

  **Commit**: YES (groups with Wave 3)

- [x] 12. Chat 页面重写（project-aware）

  **What to do**:
  - 重写 `src/app/page.tsx`：
    - 顶层状态：`projectId` (string | null)
    - 传递 `projectId` 给 ProjectSelector（切换回调）
    - 传递 `projectId` 给 useChat transport 的 body
    - projectId 为 null 时显示 ProjectSelector 全屏（无对话界面）
    - projectId 有值时显示 ChatLayout + ProjectSelector 侧边栏
    - 切换 project 时重新创建 useChat（清除旧消息）
  - 更新 `DefaultChatTransport`：`body: { projectId }` 替代 `body: { threadId }`
  - 移除 localStorage 的 threadId 逻辑

  **Must NOT do**:
  - 不用 localStorage 存储 threadId
  - 不在 projectId 为空时发送 narrative 请求

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 页面布局 + 状态管理重写
  - **Skills**: [`/frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after T11)
  - **Blocks**: None
  - **Blocked By**: T6, T7

  **References**:
  - `src/app/page.tsx` — 现有页面（完整重写）
  - `src/components/chat/chat-layout.tsx` — 布局组件
  - `src/components/chat/project-selector.tsx` (T11) — Project 选择器

  **Acceptance Criteria**:
  - [ ] 页面状态由 projectId 驱动
  - [ ] 无 projectId 时显示项目选择
  - [ ] 有 projectId 时显示对话界面
  - [ ] 切换项目清除旧消息
  - [ ] useChat transport 传递 projectId

  **QA Scenarios**:

  ```
  Scenario: Select project and chat
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:4477
      2. Create new project "测试"
      3. Click on project to select it
      4. Type message in chat input
      5. Click send
      6. Assert response appears
    Expected Result: Chat works with selected project
    Evidence: .sisyphus/evidence/task-12-chat-page.png
  ```

  **Commit**: YES (groups with Wave 3)

- [x] 13. ToolCallCard 组件

  **What to do**:
  - 创建 `src/components/chat/tool-call-card.tsx`：
    - 接收 `DynamicToolUIPart` 作为 props
    - 处理所有状态：input-streaming（加载脉冲）、input-available（参数就绪）、output-available（折叠输出）、output-error（错误展示）
    - 折叠/展开切换
    - 显示 AgentLabel + 状态指示
    - output 默认折叠，点击展开
  - 更新 `src/components/chat/message-item.tsx`：
    - `renderSegmentParts` 中 `dynamic-tool` part 改用 `<ToolCallCard part={part} />`
    - 移除 inline output 渲染
    - 移除 `splitBySteps` 的 segment 分割逻辑（不需要按 step 拆分了）
  - 更新 `src/components/chat/message-list.tsx`：
    - 移除 ProgressIndicator 中的 TOOL_STEP_MAP（替换为从 message parts 推导的 AgentPipeline）
    - 保留 AgentLabel 等组件

  **Must NOT do**:
  - 不把 dynamic-tool output 渲染为独立对话气泡
  - 不忽略 input-streaming 状态（流式时显示加载指示器）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 组件开发
  - **Skills**: [`/frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None (可独立开发)

  **References**:
  - `src/components/chat/message-item.tsx` — 现有消息渲染（需重写 dynamic-tool 部分）
  - `src/components/chat/agent-label.tsx` — Agent 标签组件
  - `src/components/chat/progress-indicator.tsx` — 进度指示器（简化）
  - `node_modules/ai/dist/index.d.ts` — DynamicToolUIPart 类型（6 种状态）

  **Acceptance Criteria**:
  - [ ] ToolCallCard 组件处理 4 种状态（input-streaming, input-available, output-available, output-error）
  - [ ] output 默认折叠
  - [ ] 流式时显示加载指示器
  - [ ] message-item.tsx 使用 ToolCallCard
  - [ ] 无 inline dynamic-tool output 渲染

  **QA Scenarios**:

  ```
  Scenario: Tool call card shows loading then output
    Tool: Playwright
    Steps:
      1. Send message that triggers call_actor
      2. During streaming: assert loading indicator visible
      3. After completion: assert ToolCallCard shows "已完成" badge
      4. Click to expand: assert output text visible
    Expected Result: Loading → completed → expandable output
    Evidence: .sisyphus/evidence/task-13-tool-call-card.png
  ```

  **Commit**: YES (groups with Wave 3)

- [x] 14. 移除 initStory/archiveStory + 更新 GM Prompt

  **What to do**:
  - 从 `src/tools/story-tools.ts` 移除 `initStoryTool` 和 `archiveStoryTool`
  - 保留 `resetStoryTool`（重命名或调整：重置当前 project 的 .novel/ 内容）
  - 更新 `src/prompts/gm.ts`：
    - 移除对 `init_story` 工具的引用
    - 移除对 `archive_story` 工具的引用
    - 新增 `append_interaction` 和 `clear_interaction_log` 工具说明
    - 更新 call_actor 参数说明：新增 `sessionId` 可选参数
    - 更新 call_scribe/call_archivist 同理
  - 更新 `src/prompts/types.ts`：
    - 确认 `ActorPromptState.interactionLog` 和 `ScribePromptState.interactionLog` 接线
    - GMPromptState 新增 activeProjectId（如果需要）

  **Must NOT do**:
  - 不保留 init_story/archive_story 工具
  - 不修改 prompt 中的核心编排逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 移除代码 + prompt 文本更新
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T9

  **References**:
  - `src/tools/story-tools.ts` — 移除 init/archive
  - `src/prompts/gm.ts` — 更新工具说明
  - `src/prompts/types.ts` — 确认 interactionLog 字段

  **Acceptance Criteria**:
  - [ ] 无 initStoryTool/archiveStoryTool
  - [ ] GM prompt 包含 5 个工具说明
  - [ ] GM prompt 包含 append_interaction/clear_interaction_log 用法
  - [ ] call_actor/call_scribe/call_archivist 包含 sessionId 参数说明

  **QA Scenarios**:

  ```
  Scenario: GM prompt references correct tools
    Tool: Bash
    Steps:
      1. Grep gm.ts for "init_story" → expect 0 matches
      2. Grep gm.ts for "archive_story" → expect 0 matches
      3. Grep gm.ts for "append_interaction" → expect ≥1 match
      4. Grep gm.ts for "clear_interaction_log" → expect ≥1 match
      5. Grep gm.ts for "sessionId" → expect ≥1 match
    Expected Result: Old tools removed, new tools documented
    Evidence: .sisyphus/evidence/task-14-prompt-update.txt
  ```

  **Commit**: YES (groups with Wave 3)

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `bun run lint` + `bun test`. Review all changed files for: `as any`, empty catches, console.log in prod, unused imports, AI slop.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start dev server. Create project, send message, verify tool call cards render, verify interaction log written, switch project, verify session isolation.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance.
  Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(project): multi-project foundation + interaction log + session restructure` - src/project/, src/store/interaction-log.ts, src/session/
- **Wave 2**: `feat(project): API routes + agent registry rewrite` - src/app/api/, src/agents/registry.ts
- **Wave 3**: `feat(project): frontend project selector + tool call cards + cleanup` - src/components/chat/, src/app/page.tsx

---

## Success Criteria

### Verification Commands
```bash
bun run build  # Expected: success
bun test       # Expected: all pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Can create/switch/delete projects via UI
- [ ] Tool calls render as folded cards
- [ ] Interaction log written to .novel/.working/ and injected
