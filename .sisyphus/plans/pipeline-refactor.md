# 管线架构重构：GM 回归顶层 + 轮询进度

## TL;DR

> **目标**：将管线从主循环降级为 `submit_schedule` 工具的实现细节，GM 回归顶层 agent。
> **子 agent 调用进度通过轮询 `/api/narrative/status` 的 `toolProgress` 字段展示，不再需要 call-agent.ts 的假事件。
> 
> **交付物**：
> - GM 直接运行（`route.ts` → `run(gmAgent, input, ...)`）
> - `submit_schedule` 工具 handler 内部同步跑管线，实时写进度
> - `toolProgress` 字段支持任意工具（不限于 pipeline）
> - 删除 `call-agent.ts`、`gmOutputPhase`
> - 前端轮询进度展示组件
> 
> **预估工时**：Medium
> **并行执行**：YES — 3 waves
> **关键路径**：工具进度存储 → submit_schedule 重写 → route 重写 → 清理

---

## Context

### 原始请求

1. **Code 驱动 pipeline 编排**：管线按 schedule 自动跑 Actor → Scribe → Archivist
2. **Sub-agent 调用进度展示在 UI**：以轮询 `toolProgress` 代替 fake stream events
3. **多管线支持**：`submit_schedule` → scene pipeline，后续可加 `submit_battle_schedule` → battle pipeline

### 架构决策

- `submit_schedule` 作为 GM 的普通工具（非 asTool），handler 内同步执行管线
- 管线执行期间通过 in-memory store 更新进度，前端轮询 `/api/narrative/status?projectId=xxx`
- `gmOutputPhase` 删除——GM 拿到 tool_result 后自己生成最终输出
- `guard.ts` 保留，锁住整个 GM run（防止同项目并发请求）

### 核心变化 vs 当前架构

| | 当前 | 重构后 |
|---|---|---|
| 顶层 | `createSceneStream` 管线 | **GM** (`run(gmAgent, ...)`) |
| 管线 | 主 generator | **工具 handler 内的同步函数** |
| Sub-agent 进度 | `call-agent.ts` 假事件 | **轮询 `toolProgress`** |
| gmOutputPhase | 存在 | **删除** |
| 多管线 | 不可能 | `submit_battle_schedule` 另写 tool |

---

## Work Objectives

### 核心目标

让 GM 成为请求的唯一入口，管线成为工具的实现细节，进度通过轮询展示。

### 具体交付物

- `src/lib/tool-progress.ts` — in-memory progress store (`Map<projectId, Map<toolName, ToolProgress>>`)
- `src/tools/submit-schedule.ts` — 重写为阻塞管线 runner，内部调用拆分的管线函数
- `src/pipeline/enact-phase.ts` — 从 narrative-pipeline 拆出 enact
- `src/pipeline/scribe-archivist-phase.ts` — 拆出 scribe + archivist DAG
- `src/app/api/narrative/route.ts` — 恢复为 `run(gmAgent, ...)`
- `src/app/api/narrative/status/route.ts` — 扩展 `toolProgress` 字段（按工具名 key）
- `src/agents/registry.ts` — 恢复稳定版结构
- `src/prompts/gm.ts` — 恢复稳定版提示词

### toolProgress API 设计

```json
// GET /api/narrative/status?projectId=p014
{
  "sceneId": "s003",
  "location": "东京街头",
  "toolProgress": {
    "submit_schedule": {
      "status": "running",       // "running" | "completed" | "idle"
      "phase": "actor",          // 当前子阶段
      "step": 2,
      "total": 5,
      "current": "鲁智深"
    }
  }
}
```

工具完成/失败后从 `toolProgress` 中清除对应 key。多工具时各自独立。

### Definition of Done

- [ ] `bun test` 全通过
- [ ] `bun run lint` 改动的文件无新增错误
- [ ] `bun run build` 成功
- [ ] `call-agent.ts` 完全删除

### Must Have

- GM 作为顶层 agent 运行，非场景消息自由处理
- `submit_schedule` 工具内部同步执行管线
- Status API 返回 `toolProgress`，顶层 key 为工具名（不限于 pipeline）
- 多管线工具可自然扩展

### Must NOT Have

- `call-agent.ts` 假流事件
- `gmOutputPhase` 独立阶段
- 管线做主 generator
- toolProgress 的 key 硬编码为 "pipeline"

---

## Verification Strategy

### Test Decision

- **基础设施存在**：YES (Bun test)
- **自动化测试**：Tests-after（先重构，再补测试）
- **框架**：bun test

### QA Policy

每个 task 包含 agent-executed QA scenarios。

---

## Execution Strategy

### 并行执行 Waves

```
Wave 1 (同时开始 — 基础设施 + 核心逻辑):
├── Task 1: 创建 tool-progress.ts [quick]
├── Task 2: 拆分管线阶段函数 [deep]
├── Task 3: 重写 submit-schedule.ts [deep]
├── Task 4: 恢复 registry.ts 结构 [quick]
└── Task 5: 适配 GM 提示词 [quick]

Wave 2 (Wave 1 之后 — 入口 + API + 前端):
├── Task 6: 重写 route.ts 入口 [deep]
├── Task 7: 扩展 status 接口 [quick]
└── Task 11: 前端轮询进度展示组件 [visual-engineering]

Wave 3 (Wave 2 之后 — 清理 + 测试):
├── Task 8: 删除废弃文件 [quick]
├── Task 9: 更新测试 [deep]
└── Task 10: 构建验证 [quick]
```

### Agent Dispatch Summary

- **Wave 1**: 5 tasks
- **Wave 2**: 3 tasks
- **Wave 3**: 3 tasks

---

## TODOs

- [x] 1. 创建 `src/lib/tool-progress.ts` — in-memory 工具进度存储

  **What to do**:
  - 定义 `ToolProgress` 接口：`{ status: "running" | "completed"; phase: string; step: number; total: number; current: string }`
  - 存储：`Map<projectId, Map<toolName, ToolProgress>>`
  - 导出 `setToolProgress(projectId, toolName, progress)` — 更新某工具的进度
  - 导出 `getToolProgress(projectId)` — 获取项目下所有工具的进度（作为 plain object）
  - 导出 `clearToolProgress(projectId, toolName)` — 工具完成后清除
  - 导出 `_resetToolProgress()` — 测试用

  **Must NOT do**:
  - 不做文件持久化（内存即可）
  - 不依赖外部参数校验（调用方保证正确）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-5)
  - **Blocks**: Task 7 (status 接口需要)
  - **Blocked By**: None

  **QA Scenarios**:
  ```
  Scenario: set and get single tool progress
    Tool: Bash (bun test)
    Steps:
      1. Create projectId "p001"
      2. setToolProgress("p001", "submit_schedule", { status: "running", phase: "actor", step: 1, total: 5, current: "林冲" })
      3. Call getToolProgress("p001")
    Expected Result: { submit_schedule: { status: "running", phase: "actor", step: 1, total: 5, current: "林冲" } }
    Evidence: .sisyphus/evidence/task-1-progress-basic.txt

  Scenario: clear completed tool from progress
    Tool: Bash (bun test)
    Steps:
      1. setToolProgress("p001", "submit_schedule", { status: "running", ... })
      2. clearToolProgress("p001", "submit_schedule")
      3. Call getToolProgress("p001")
    Expected Result: {}
    Evidence: .sisyphus/evidence/task-1-progress-clear.txt
  ```

  **Commit**: YES
  - Message: `feat: add in-memory tool progress store`
  - Files: `src/lib/tool-progress.ts`

- [x] 2. 拆分管线阶段函数

  **What to do**:
  - 从 `src/pipeline/narrative-pipeline.ts` 提取业务逻辑到新文件
  - 创建 `src/pipeline/enact-phase.ts`：
    - 导出 `runEnactPhase(schedule, storyDir, projectDir)` — 同步执行所有 Actor 调用
    - 内部使用 `run(actorAgent, ...)` (非流式)
    - 返回 `{ steps: Array<{ character, status, sessionId }>, interactionLog: string }`
  - 创建 `src/pipeline/scribe-archivist-phase.ts`：
    - 导出 `runScribeAndArchivist(narrativeSummary, storyDir)` — 同步执行 Scribe + Archivist DAG
    - 内部使用 `run(scribeAgent, ...)` 和 `run(archivistAgent, ...)` (非流式)
    - 返回 `{ scribeOutput: string, archivistOutput: string }`

  **Must NOT do**:
  - 不生成流事件（不再需要 yield）
  - 不引入 `createSceneStream` 依赖
  - 不引入 `call-agent.ts` 依赖

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-5)
  - **Blocks**: Task 6 (submit_schedule 需要)
  - **Blocked By**: None

  **QA Scenarios**:
  ```
  Scenario: enact phase runs all actors in order
    Tool: Bash (bun test)
    Preconditions: actors agents mock returns predefined outputs
    Steps:
      1. Create schedule with 2 actors
      2. Call runEnactPhase(schedule, storyDir, projectDir)
      3. Check returned steps have both actors with status "success"
    Expected Result: steps.length=2, both characters match schedule
    Evidence: .sisyphus/evidence/task-2-enact.txt

  Scenario: scribe returns literary text
    Tool: Bash (bun test)
    Preconditions: scribe agent mock returns text
    Steps:
      1. Call runScribeAndArchivist(narrativeSummary, storyDir)
      2. Check scribeOutput is non-empty string
    Expected Result: typeof scribeOutput === "string" && scribeOutput.length > 0
    Evidence: .sisyphus/evidence/task-2-scribe.txt
  ```

  **Commit**: YES
  - Message: `refactor: extract pipeline phases from narrative-pipeline`
  - Files: `src/pipeline/enact-phase.ts`, `src/pipeline/scribe-archivist-phase.ts`

- [x] 3. 重写 `submit_schedule` 工具

  **What to do**:
  - 重写 `src/tools/submit-schedule.ts`
  - 在 `execute` handler 内：
    1. 调用 `runEnactPhase(schedule, ...)` → 每次 Actor 前调用 `setToolProgress`
    2. 调用 `runScribeAndArchivist(narrativeSummary, ...)` → 更新进度
    3. 调用 `clearToolProgress(projectId, "submit_schedule")`
    4. 返回 `toolResult(JSON.stringify({ scribeOutput, ... }))`
  - 进度更新频率：每个 Actor 开始前、Scribe 开始前、Archivist 开始前

  **Must NOT do**:
  - 不做流式输出
  - 不做 `call-agent.ts` 假事件
  - 不在 handler 外部暴露管线细节

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6 (route 需要注册)
  - **Blocked By**: Tasks 1, 2

  **QA Scenarios**:
  ```
  Scenario: submit_schedule runs pipeline and returns result
    Tool: Bash (bun test)
    Preconditions: mock GM runContext with projectId, storyDir
    Steps:
      1. Call tool.execute({ schedule: [...], narrativeSummary: "test" }, mockRunContext)
      2. Check toolProgress during execution (polling)
      3. Check returned value has scribeOutput
    Expected Result: toolProgress transitions running→completed, result contains scribeOutput
    Evidence: .sisyphus/evidence/task-3-submit.txt
  ```

  **Commit**: YES
  - Message: `refactor: rewrite submit_schedule as blocking pipeline runner`
  - Files: `src/tools/submit-schedule.ts`

- [x] 4. 恢复 `registry.ts` 稳定版结构

  **What to do**:
  - 恢复为 commit `70f82d1` 的 registry 结构
  - GM 的工具列表：`[submitScheduleTool, readFileTool, writeFileTool, globFilesTool]`
  - **不**注册 `call_actor` / `call_scribe` / `call_archivist` 到 GM（这些由 submit_schedule 内部调用）
  - 保持 `AgentRunContext` 接口不变

  **Must NOT do**:
  - 不引入 `enactSequenceTool`（稳定版的，已废弃）
  - 不注册 Actor/Scribe/Archivist 为 GM 的直接工具

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 3 (需要 submitScheduleTool)

  **QA Scenarios**:
  ```
  Scenario: registry exports gmAgent with correct tools
    Tool: Bash (bun test)
    Steps:
      1. Import gmAgent from registry
      2. Check gmAgent.tools has submitScheduleTool
      3. Check tools does NOT have callActorTool
    Expected Result: tools includes submitScheduleTool, excludes callActor/callScribe
    Evidence: .sisyphus/evidence/task-4-registry.txt
  ```

  **Commit**: YES
  - Message: `refactor: restore registry to GM-top-level structure`
  - Files: `src/agents/registry.ts`

- [x] 5. 适配 GM 提示词

  **What to do**:
  - 基于稳定版 `70f82d1` 的提示词结构，适配新的 `submit_schedule` 工具
  - 修改 "四阶段流程"：
    - 阶段 0（准备）保持不变
    - 阶段 1（场景编写）保持不变
    - 阶段 2（调度）改为：调 `submit_schedule` → 等待工具返回结果
    - 阶段 3（收束）简化为：拿到 submit_schedule 返回的 `scribeOutput`，直接输出给用户
  - 移除 `enact_sequence`、`call_actor`、`call_scribe`、`call_archivist` 从 GM 工具列表
  - 移除 `clear_interaction_log` 工具（由 submit_schedule 内部处理）
  - GM 工具变为：`read_file`、`write_file`、`glob_files`、`submit_schedule`
  - 保持 "约束"、"错误处理"、"输出规范" 章节不变

  **Must NOT do**:
  - 不保留管线内部细节（GM 不需要知道管线怎么跑的）
  - 不描述 `gmOutputPhase` 或 `createSceneStream`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4)
  - **Blocks**: None
  - **Blocked By**: None

  **QA Scenarios**:
  ```
  Scenario: prompt references submit_schedule with correct flow
    Tool: Bash (bun test)
    Steps:
      1. Call getGMPrompt(state)
      2. Check contains "submit_schedule" and flow description
      3. Check does NOT contain "enact_sequence" or "call_actor"
    Expected Result: prompt shows submit_schedule as the scheduling tool
    Evidence: .sisyphus/evidence/task-5-prompt.txt
  ```

  **Commit**: YES
  - Message: `refactor: adapt GM prompt for submit_schedule pipeline flow`
  - Files: `src/prompts/gm.ts`

- [x] 11. 前端：轮询进度展示组件

  **What to do**:
  - 在 `src/components/chat/` 下新增 `pipeline-progress.tsx`
  - 组件行为：
    1. 当收到 `tool_call: submit_schedule` 事件时，开始轮询 `/api/narrative/status?projectId=xxx`（每 1 秒）
    2. 解析 `response.toolProgress.submit_schedule` 显示进度条
    3. 进度信息：当前阶段（actor/scribe/archivist）、步数（2/5）、当前角色名
    4. 当收到 `tool_output: submit_schedule`（或 `toolProgress` 为空）时，停止轮询
  - 展示方式：在 chat 消息流中插入一个进度卡片，不阻塞其他消息展示
  - 进度卡片样式参考现有 tool-tag 组件

  **Must NOT do**:
  - 不修改现有 tool_call 展示逻辑
  - 不影响非 submit_schedule 工具的行为

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `["frontend-ui-ux"]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after backend is stable)
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 4, 6, 7

  **QA Scenarios**:
  ```
  Scenario: progress card polls and displays pipeline status
    Tool: Playwright
    Preconditions: mock /status returns running submit_schedule
    Steps:
      1. Send scene request to trigger pipeline
      2. Verify progress card appears after tool_call: submit_schedule
      3. Check progress card shows "Actor: 林冲 (1/5)"
      4. Verify card disappears after tool_output: submit_schedule
    Expected Result: Progress card visible during pipeline, removed after completion
    Evidence: .sisyphus/evidence/task-11-progress.png
  ```

  **Commit**: YES
  - Message: `feat: add pipeline progress polling UI component`
  - Files: `src/components/chat/pipeline-progress.tsx`

- [x] 6. 重写 API route 入口

  **What to do**:
  - 重写 `src/app/api/narrative/route.ts`
  - POST handler 改为直接运行 GM：
    ```typescript
    const stream = await run(gmAgent, input, {
      stream: true,
      context: { storyDir, projectId, projectDir },
      maxTurns: 25,
      session: storySession.gmSession,
      signal: req.signal,
    });
    return createAiSdkUiMessageStreamResponse(stream);
    ```
  - 保留 `guard.ts` 锁（防止同项目并发请求）
  - 删除 pipeline 相关 import

  **Must NOT do**:
  - 不调用 `createSceneStream` / `runScenePipeline` / `runScenePipelineLocked`
  - 不引入管线依赖

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8 (清理不再引用的文件)
  - **Blocked By**: Tasks 3, 4

  **QA Scenarios**:
  ```
  Scenario: route uses run(gmAgent) not pipeline
    Tool: Bash (grep)
    Steps:
      1. Read src/app/api/narrative/route.ts
      2. Verify no import from narrative-pipeline
      3. Verify run(gmAgent, ...) is called
    Expected Result: No pipeline imports, uses run() directly
    Evidence: .sisyphus/evidence/task-6-route.txt
  ```

  **Commit**: YES
  - Message: `refactor: restore GM as top-level agent in API route`
  - Files: `src/app/api/narrative/route.ts`

- [x] 7. 扩展 status 接口

  **What to do**:
  - 扩展 `src/app/api/narrative/status/route.ts`
  - 在响应中增加 `toolProgress` 字段：
    ```typescript
    toolProgress: getToolProgress(projectId)
    ```
  - 需要修改接口参数：用 `projectId` 替代 `threadId`（或兼容两者）
  - 如果没有活跃工具，`toolProgress` 为空对象 `{}`

  **Must NOT do**:
  - 不硬编码 pipeline 为顶层 key（用 `toolProgress[工具名]` 结构）
  - 不修改现有字段的行为

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1

  **QA Scenarios**:
  ```
  Scenario: status returns toolProgress when pipeline running
    Tool: Bash (curl)
    Preconditions: setToolProgress("p014", "submit_schedule", { status: "running", ... })
    Steps:
      1. curl GET /api/narrative/status?projectId=p014
      2. Parse JSON response
      3. Check response.toolProgress.submit_schedule.status === "running"
    Expected Result: toolProgress contains running submit_schedule
    Evidence: .sisyphus/evidence/task-7-status.txt
  ```

  **Commit**: YES
  - Message: `feat: add toolProgress to status API`
  - Files: `src/app/api/narrative/status/route.ts`

- [x] 8. 删除废弃文件

  **What to do**:
  - 删除 `src/pipeline/call-agent.ts`（假事件机制）
  - 删除 `src/pipeline/narrative-pipeline.ts`（旧管线主循环）
  - 删除 `src/pipeline/guard.ts` 中对 pipeline 引用（如果有）
  - 删除 tests 中对应的测试文件

  **Must NOT do**:
  - 不删除 `src/pipeline/guard.ts`（锁机制保留）
  - 不删除 `src/pipeline/enact-phase.ts` 和 `src/pipeline/scribe-archivist-phase.ts`（新拆出的文件）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9 (测试更新依赖清理结果)
  - **Blocked By**: Task 6

  **Commit**: YES
  - Message: `chore: remove deprecated pipeline files`
  - Files: (deletions) `src/pipeline/call-agent.ts`, `src/pipeline/narrative-pipeline.ts`

- [x] 9. 更新测试

  **What to do**:
  - 删除 `tests/unit/pipeline/call-agent.test.ts`
  - 删除 `tests/unit/pipeline/narrative-pipeline.test.ts`
  - 删除 `tests/unit/pipeline/event-construction.test.ts`
  - 添加 `tests/unit/lib/tool-progress.test.ts`
  - 添加 `tests/unit/tools/submit-schedule.test.ts`
  - 更新 `tests/unit/prompts/gm.test.ts`（prompt 变了）
  - 更新 `tests/integration/e2e.test.ts`（架构变了）

  **Must NOT do**:
  - 不删除现有通过的非管线测试

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 2, 3, 5, 8

  **QA Scenarios**:
  ```
  Scenario: all tests pass after refactor
    Tool: Bash (bun test)
    Steps:
      1. Run bun test
      2. Check exit code
    Expected Result: 0 failures
    Evidence: .sisyphus/evidence/task-9-tests.txt
  ```

  **Commit**: YES
  - Message: `test: update tests for pipeline refactor`
  - Files: deleted test files, new test files, updated test files

- [x] 10. 构建验证

  **What to do**:
  - 运行 `bun run build`
  - 运行 `bun run lint`
  - 运行 `bun test`（全量）
  - 确认无 import 错误、无类型错误

  **Must NOT do**:
  - 不做运行时功能测试（构建验证即可）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 9

  **QA Scenarios**:
  ```
  Scenario: build succeeds
    Tool: Bash
    Steps:
      1. bun run build
      2. Check exit code 0
    Expected Result: Build completes without errors
    Evidence: .sisyphus/evidence/task-10-build.txt
  ```

  **Commit**: NO (verified inline)

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
- [x] F2. **Code Quality Review** — `unspecified-high`
- [x] F3. **Real Manual QA** — `unspecified-high`
- [x] F4. **Scope Fidelity Check** — `deep`

---

## Commit Strategy

- **1-5 (Wave 1)**: `feat/refactor` parallel — 可同时提交
  - `feat: add in-memory tool progress store`
  - `refactor: extract pipeline phases from narrative-pipeline`
  - `refactor: rewrite submit_schedule as blocking pipeline runner`
  - `refactor: restore registry to GM-top-level structure`
  - `refactor: restore GM prompt with submit_schedule`

- **6-7 (Wave 2)**: sequential after Wave 1
  - `refactor: restore GM as top-level agent in API route`
  - `feat: add toolProgress to status API`

- **8-9 (Wave 3)**: sequential after Wave 2
  - `chore: remove deprecated pipeline files`
  - `test: update tests for pipeline refactor`

---

## Success Criteria

### Verification Commands

```bash
bun test          # Expected: all pass, 0 fail
bun run lint      # Expected: no new errors in changed files
bun run build     # Expected: success
```

### Final Checklist

- [ ] call-agent.ts 完全删除
- [ ] narrative-pipeline.ts 完全删除
- [ ] gmOutputPhase 不存在
- [ ] route.ts 直接 run(gmAgent)
- [ ] toolProgress 按工具名 key
- [ ] submit_schedule 同步执行管线
- [ ] GM 提示词适配新工具流
- [ ] 前端轮询进度组件正常工作