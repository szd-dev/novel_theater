# 调度器进度系统重构

## TL;DR

> **Quick Summary**: 将 submit-schedule 工具的进度上报从 3 个阶段边界下沉到每个子步骤，合并两套独立的前端进度系统（PipelineProgress 轮询 + ProgressIndicator 流推导）为单一 ToolTag 内嵌进度条，使用 Agent SDK 原生 callId 替代硬编码工具名作为进度键。

> **Deliverables**:
> - 细粒度进度上报：per-character actor 步骤 + per-sub-agent archivist 步骤
> - 统一进度键：callId 替代 toolName
> - 合并进度 UI：ToolTag 内嵌进度条，移除 PipelineProgress 和 ProgressIndicator
> - 单次自适应轮询：ProjectChat 层级统一管理

> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → Task 11 → F1-F4

---

## Context

### Original Request
用户发现 submit-schedule 调度器中 actor 和 archivist 的进度没有正确更新，前端工具展示存在错误且不能持久化。此前已确认 5 条解决思路。

### Interview Summary

**Key Discussions**:
- **callID 来源**: 从 `execute` 函数第 3 个参数 `details.toolCall.callId` 提取（SDK 已确认暴露 `FunctionCallItem.callId`）
- **ProgressIndicator**: 合并到 ToolTag，移除独立组件
- **Dynamic-tool 持久化**: 新方案通过轮询数据驱动自然覆盖
- **轮询机制**: 提升到 `ProjectChat` 层级，自适应频率（活跃 1s / 空闲 5s）
- **total 公式**: `schedule.length + 5`（+scribe +archivist×3子阶段 +completion）

**Research Findings**:
- 当前 `setToolProgress` 仅在 3 个阶段边界调用，中间无粒度进度 → 前端只能看到跳变
- `ProgressIndicator` 依赖 `TOOL_STEP_MAP` 推导步骤，但 Actor/Scribe/Archivist 使用 `run()` 直接调用，不产生 `dynamic-tool` stream parts → step 推导不可靠
- `FunctionCallItem` 在 `@openai/agents-core/dist/types/protocol.d.ts:375-389` 确认有 `callId: z.ZodString`
- 项目本地 `DynamicToolPart` 类型是 AI SDK `DynamicToolUIPart` 的子集，需对齐

### Metis Review

**Identified Gaps** (addressed):
- **Type divergence**: `types.ts` 的 `DynamicToolPart` 与 AI SDK 原生类型的字段差异 → 计划中包含类型对齐任务
- **callId optionality**: `details?.toolCall?.callId` 是可选字段 → 增加本地 fallback `pipeline-{projectId}-{timestamp}`
- **Race condition**: 进度清除和前端轮询的时序问题 → 保持现有 `status === 'running'` 检查，已验证安全
- **Archivist parallel batch**: 4 个并行 agent 如何上报 → 合并为一个步骤 "场景/世界/剧情/时间线"
- **Map 清理**: toolProgress 在完成时清理，无泄漏风险
- **自适应轮询定义**: `isActive = status === 'streaming' && hasSubmitScheduleActive`

**Alternative Considered** (from Metis): 完全消除轮询，通过 stream parts 驱动进度。未采用原因：需要修改 `@openai/agents-extensions` 的 stream bridge（不可控），且当前轮询方案更务实。

---

## Work Objectives

### Core Objective
重构 submit-schedule 的进度追踪系统，使前端能实时展示 per-character 和 per-sub-agent 的细粒度进度，统一为单一 ToolTag 内嵌进度条，使用 callId 关联进度数据。

### Concrete Deliverables
- 细粒度进度上报：enact-phase 逐步 + scribe-archivist-phase 分 3 子阶段
- callId 作为进度 store key
- ToolTag 内嵌进度条（替代 PipelineProgress + ProgressIndicator）
- 单次自适应轮询 hook

### Definition of Done
- [ ] `bun dev` 启动无报错
- [ ] GM 调用 submit_schedule 后，ToolTag 显示逐步进度条（每角色完成更新一次）
- [ ] Archivist 阶段显示 3 个子步骤进度
- [ ] 进度条颜色/图标与当前 phase 匹配
- [ ] 场景结束后进度条消失
- [ ] `bun test` 全部通过
- [ ] `bun run build` 成功

### Must Have
- submit_schedule 工具的 execute 函数接收 details 第 3 参数提取 callId
- enact-phase 接受 onProgress 回调，每个角色完成后调用
- scribe-archivist-phase 接受 onProgress 回调，分 scribe 和 archivist 3 子步骤调用
- tool-progress store key 改为 `(projectId, callId)`
- ToolTag 在 toolName=submit_schedule 且进度存在时显示进度条
- ProjectChat 单一轮询，自适应频率

### Must NOT Have (Guardrails)
- 不改动 agent 定义（actor.ts, scribe.ts, archivist/factory.ts, gm.ts）
- 不改动 archivist DAG 的执行逻辑（仅增加进度回调）
- 不改动 session 管理逻辑
- 不新增 UI 组件文件（复用 ToolTag）
- 不修改 `@openai/agents-extensions` 包
- 不引入新的 npm 依赖

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (bun:test)
- **Automated tests**: Tests-after (先实现，后更新测试)
- **Framework**: bun test

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend**: Use Bash (bun/node REPL) - Import, call functions, compare output
- **Frontend/UI**: Use Playwright - Navigate, interact, assert DOM, screenshot
- **API**: Use Bash (curl) - Send requests, assert status + response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, MAX PARALLEL):
├── Task 1: tool-progress.ts — callId key refactor [quick]
├── Task 2: DynamicToolPart type alignment [quick]
└── Task 3: tool-meta.ts — TOOL_STEP_MAP update [quick]

Wave 2 (After Wave 1 — backend logic, MAX PARALLEL):
├── Task 4: submit-schedule.ts — callId + onProgress + total adjustment [unspecified-high]
├── Task 5: enact-phase.ts — onProgress callback [quick]
├── Task 6: scribe-archivist-phase.ts — onProgress + split archivist [unspecified-high]
└── Task 7: status API — optional callId filter [quick]

Wave 3 (After Wave 1 — frontend components, MAX PARALLEL):
├── Task 8: ProjectChat polling hook [quick]
├── Task 9: ToolTag progress bar extension [visual-engineering]
└── Task 10: SceneIndicator props-based refactor [quick]

Wave 4 (After Waves 2+3 — integration):
├── Task 11: MessageList — wire everything, remove old components [unspecified-high]
└── Task 12: Update tests [unspecified-high]

Critical Path: Task 1 → Task 4 → Task 5 → Task 11 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 1, 2, 3)
```

### Agent Dispatch Summary

- **1**: **3** - T1, T2, T3 → `quick`
- **2**: **4** - T4 → `unspecified-high`, T5 → `quick`, T6 → `unspecified-high`, T7 → `quick`
- **3**: **3** - T8 → `quick`, T9 → `visual-engineering`, T10 → `quick`
- **4**: **2** - T11 → `unspecified-high`, T12 → `unspecified-high`
- **FINAL**: **4** - F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. tool-progress.ts — callId key refactor

  **What to do**:
  - 修改 `setToolProgress` 签名：`(projectId: string, callId: string, progress: ToolProgress)`
  - 修改 `getToolProgress` 签名：`(projectId: string, callId?: string)` — 如果不传 callId 返回该 project 下所有活跃进度
  - 修改 `clearToolProgress` 签名：`(projectId: string, callId: string)`
  - 更新内部存储结构注释，说明 key 语义变更
  - 更新 `ToolProgress` 接口（现状无需改，未来可扩展 `callId` 字段）

  **Must NOT do**:
  - 不要改变 `ToolProgress` 的字段结构（phase/step/total/current/status 保持不变）
  - 不要引入持久化（保持 in-memory Map）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 纯函数签名修改，不涉及复杂逻辑
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: None

  **References**:
  - `src/lib/tool-progress.ts:1-46` — 当前实现，需要修改的源文件
  - `tests/unit/lib/tool-progress.test.ts` — 现有测试，更新测试在 Task 12

  **Acceptance Criteria**:
  - [ ] `setToolProgress(projectId, callId, progress)` 类型检查通过，无 TS 错误
  - [ ] `getToolProgress(projectId)` 返回 `Record<string, ToolProgress>`，key 为 callId
  - [ ] `getToolProgress(projectId, callId)` 返回单个 ToolProgress 或 undefined
  - [ ] `clearToolProgress(projectId, callId)` 正确删除指定条目

  **QA Scenarios**:

  ```
  Scenario: set and get progress by callId
    Tool: Bash (bun repl)
    Preconditions: Import setToolProgress, getToolProgress from @/lib/tool-progress
    Steps:
      1. Call setToolProgress('test-project', 'call_abc123', { status: 'running', phase: 'actor', step: 1, total: 5, current: '张三' })
      2. Call getToolProgress('test-project')
    Expected Result: Returns { 'call_abc123': { status: 'running', phase: 'actor', step: 1, total: 5, current: '张三' } }
    Evidence: .sisyphus/evidence/task-1-set-get.txt

  Scenario: getProgress with callId filter
    Tool: Bash (bun repl)
    Preconditions: Progress set for callId 'call_abc123'
    Steps:
      1. Call getToolProgress('test-project', 'call_abc123')
    Expected Result: Returns { status: 'running', phase: 'actor', ... }
    Evidence: .sisyphus/evidence/task-1-filter.txt

  Scenario: clear progress and verify removal
    Tool: Bash (bun repl)
    Preconditions: Progress set for callId 'call_abc123'
    Steps:
      1. Call clearToolProgress('test-project', 'call_abc123')
      2. Call getToolProgress('test-project')
    Expected Result: Returns {} (empty object)
    Evidence: .sisyphus/evidence/task-1-clear.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `refactor(progress): change toolProgress key from toolName to callId`
  - Files: `src/lib/tool-progress.ts`

- [x] 2. DynamicToolPart type alignment

  **What to do**:
  - 在 `src/components/chat/types.ts` 中对齐 `DynamicToolPart` 类型与 AI SDK 的 `DynamicToolUIPart`
  - 增加缺失字段：`errorText?: string`, `providerExecuted?: boolean`, `title?: string`, `preliminary?: boolean`
  - 保持 `isDynamicToolPart` 类型守卫不变（它只检查 `part.type === "dynamic-tool"`）
  - 更新 JSDoc 注释说明与 AI SDK 的对应关系

  **Must NOT do**:
  - 不要修改 `DynamicToolState` 联合类型（4 个状态足够）
  - 不要改变 `ToolClickPayload` 接口

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 类型定义对齐，无运行时逻辑变更
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `src/components/chat/types.ts:1-32` — 当前类型定义
  - `node_modules/ai/dist/index.d.ts` — AI SDK DynamicToolUIPart 类型（搜索 "DynamicToolUIPart"）

  **Acceptance Criteria**:
  - [ ] `DynamicToolPart` 包含 `errorText`, `providerExecuted`, `title`, `preliminary` 字段（均为可选）
  - [ ] `isDynamicToolPart` 类型守卫正确窄化到扩展后的类型
  - [ ] TypeScript 编译无错误

  **QA Scenarios**:

  ```
  Scenario: DynamicToolPart with new fields works with isDynamicToolPart
    Tool: Bash (bun repl)
    Preconditions: Import isDynamicToolPart from @/components/chat/types
    Steps:
      1. Create a part object: { type: 'dynamic-tool', toolName: 'submit_schedule', state: 'input-available', toolCallId: 'call_123', errorText: 'test', providerExecuted: true }
      2. Call isDynamicToolPart(part)
    Expected Result: Returns true, TypeScript narrows to DynamicToolPart with all fields accessible
    Evidence: .sisyphus/evidence/task-2-type-guard.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `refactor(progress): change toolProgress key from toolName to callId`
  - Files: `src/components/chat/types.ts`

- [x] 3. tool-meta.ts — TOOL_STEP_MAP update

  **What to do**:
  - 移除 `TOOL_STEP_MAP` 中不再需要的条目（Actor, Scribe, archivist-* 等不会出现在 stream parts 中的工具）
  - 保留 `submit_schedule: 0`
  - 添加注释说明此 map 仅用于从 stream parts 推断步骤（已不准确），保留是为了向后兼容 ProgressIndicator 移除前的过渡期

  **Must NOT do**:
  - 不要删除 `TOOL_META_MAP` 中的任何条目（UI 渲染仍需要 label/color/icon）
  - 不要修改 `AGENT_COLORS` 或 `AGENT_NAMES`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 数据结构清理，无复杂逻辑
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `src/components/chat/tool-meta.ts:27-37` — TOOL_STEP_MAP 当前定义
  - `src/components/chat/tool-meta.ts:39-149` — TOOL_META_MAP（保留不动）

  **Acceptance Criteria**:
  - [ ] `TOOL_STEP_MAP` 仅包含 `{ submit_schedule: 0 }`
  - [ ] `TOOL_META_MAP` 完整保留，无删除
  - [ ] `getToolMeta('submit_schedule')` 仍返回正确的 label/color/icon

  **QA Scenarios**:

  ```
  Scenario: TOOL_STEP_MAP only contains submit_schedule
    Tool: Bash (bun repl)
    Preconditions: Import TOOL_STEP_MAP from @/components/chat/tool-meta
    Steps:
      1. Log Object.keys(TOOL_STEP_MAP)
    Expected Result: ['submit_schedule']
    Evidence: .sisyphus/evidence/task-3-step-map.txt

  Scenario: TOOL_META_MAP still complete
    Tool: Bash (bun repl)
    Preconditions: Import TOOL_META_MAP, AGENT_TOOLS from @/components/chat/tool-meta
    Steps:
      1. Check that AGENT_TOOLS still contains all agent tool names
    Expected Result: Set contains 'Actor', 'Scribe', 'archivist-characters', etc.
    Evidence: .sisyphus/evidence/task-3-meta-map.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `refactor(progress): change toolProgress key from toolName to callId`
  - Files: `src/components/chat/tool-meta.ts`

- [x] 4. submit-schedule.ts — callId + onProgress + total adjustment

  **What to do**:
  - 修改 `execute` 函数签名，增加第 3 个参数 `details?: ToolCallDetails`
  - 从 `details?.toolCall?.callId` 提取 callId；若不存在，fallback 为 `` `pipeline-${projectId}-${Date.now()}` ``
  - 调整 `total` 计算：`schedule.length + 5`（actor N步 + scribe 1步 + archivist 3子步 + completion 1步）
  - 创建 `onProgress` 工厂函数，内部调用 `setToolProgress(projectId, callId, progress)`
  - 将 `onProgress` 传入 `runEnactPhase` 和 `runScribeAndArchivist`
  - 移除旧的 3 次直接 `setToolProgress` 调用（改为在 onProgress 中统一管理）
  - 返回结果中增加 `callId` 字段
  - TypeScript：需要 `import type { ToolCallDetails } from '@openai/agents-core'` 或从 `@openai/agents` 导出

  **Must NOT do**:
  - 不要改变 pipeline 的执行顺序或错误处理逻辑
  - 不要移除 `clearToolProgress` 调用（完成时清理）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及 SDK 类型导入、回调工厂设计、total 公式调整，需要仔细处理
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Task 11
  - **Blocked By**: Task 1

  **References**:
  - `src/tools/submit-schedule.ts:60-122` — execute 函数当前实现
  - `src/tools/submit-schedule.ts:13-41` — 依赖注入 helpers（_setRunEnactPhase 等）
  - `node_modules/@openai/agents-core/dist/tool.d.ts:25-33` — ToolCallDetails 类型定义
  - `node_modules/@openai/agents-core/dist/types/protocol.d.ts:375-389` — FunctionCallItem 类型（含 callId）
  - `src/lib/tool-progress.ts` — 更新后的 setToolProgress 签名（见 Task 1）

  **Acceptance Criteria**:
  - [ ] execute 函数成功从 `details.toolCall.callId` 提取 callId
  - [ ] callId 不存在时使用 fallback，控制台无报错
  - [ ] total = schedule.length + 5
  - [ ] onProgress 正确传入 runEnactPhase 和 runScribeAndArchivist
  - [ ] 旧的直接 setToolProgress 调用已移除
  - [ ] 返回的 JSON 包含 callId 字段
  - [ ] `bun run build` 类型检查通过

  **QA Scenarios**:

  ```
  Scenario: Tool returns callId in output
    Tool: Bash (bun test)
    Preconditions: Mock details with toolCall.callId = 'call_test_123'
    Steps:
      1. Run submit_schedule tool with mocked enact/sandarch phases
      2. Parse the returned JSON
    Expected Result: result.callId === 'call_test_123'
    Evidence: .sisyphus/evidence/task-4-callid.txt

  Scenario: Fallback callId when details is undefined
    Tool: Bash (bun test)
    Preconditions: No details parameter passed
    Steps:
      1. Run submit_schedule tool without details
      2. Parse the returned JSON
    Expected Result: result.callId matches /^pipeline-.*-\d+$/
    Evidence: .sisyphus/evidence/task-4-fallback.txt

  Scenario: Total calculation correct for N=3 schedule
    Tool: Bash (bun test)
    Preconditions: Schedule with 3 characters
    Steps:
      1. Verify total set in setToolProgress call
    Expected Result: total === 8 (3 + 5)
    Evidence: .sisyphus/evidence/task-4-total.txt
  ```

  **Commit**: YES (groups with Tasks 5, 6, 7)
  - Message: `feat(progress): add per-step progress reporting to pipeline phases`
  - Files: `src/tools/submit-schedule.ts`
  - Pre-commit: `bun test tests/unit/tools/submit-schedule.test.ts`

- [x] 5. enact-phase.ts — onProgress callback

  **What to do**:
  - 在 `runEnactPhase` 函数签名中增加 `onProgress?: (progress: ToolProgress) => void` 参数
  - 在 for 循环中，每个角色开始前调用 `onProgress({ status: 'running', phase: 'actor', step: i + 1, total, current: step.character })`
  - `total` 由调用方传入（submit-schedule 的 `schedule.length + 5`），作为新参数 `totalSteps: number`
  - 保持现有的 session 缓存、run、interaction log 逻辑不变

  **Must NOT do**:
  - 不要在循环结束后额外调用 onProgress（submit-schedule 会处理下一阶段的进度）
  - 不要修改错误处理流程

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单回调注入，逻辑清晰
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Task 11
  - **Blocked By**: Task 1

  **References**:
  - `src/pipeline/enact-phase.ts:45-102` — runEnactPhase 当前实现
  - `src/pipeline/enact-phase.ts:9-23` — EnactResult, EnactStep 接口
  - `src/lib/tool-progress.ts:1-7` — ToolProgress 接口

  **Acceptance Criteria**:
  - [ ] `runEnactPhase` 接受 `onProgress` 和 `totalSteps` 可选参数
  - [ ] 每个角色调度前调用 `onProgress`（step 从 1 递增到 schedule.length）
  - [ ] `current` 字段为角色名称
  - [ ] `onProgress` 为 undefined 时不报错（向后兼容）

  **QA Scenarios**:

  ```
  Scenario: onProgress called for each character
    Tool: Bash (bun test)
    Preconditions: Mock actorAgent, schedule with ['张三', '李四'], totalSteps=8
    Steps:
      1. Create progressCalls: ToolProgress[] = []
      2. Call runEnactPhase(schedule, storyDir, projectId, projectDir, { onProgress: (p) => progressCalls.push(p), totalSteps: 8 })
      3. Check progressCalls
    Expected Result: length === 2, [0].phase === 'actor', [0].current === '张三', [0].step === 1, [1].current === '李四', [1].step === 2
    Evidence: .sisyphus/evidence/task-5-callback.txt

  Scenario: onProgress undefined — no errors
    Tool: Bash (bun test)
    Preconditions: Mock actorAgent
    Steps:
      1. Call runEnactPhase without onProgress
    Expected Result: No error thrown, function completes normally
    Evidence: .sisyphus/evidence/task-5-no-callback.txt
  ```

  **Commit**: YES (groups with Tasks 4, 6, 7)
  - Message: `feat(progress): add per-step progress reporting to pipeline phases`
  - Files: `src/pipeline/enact-phase.ts`

- [x] 6. scribe-archivist-phase.ts — onProgress + split archivist

  **What to do**:
  - 在 `runScribeAndArchivist` 函数签名中增加 `onProgress?: (progress: ToolProgress) => void` 和 `totalSteps: number` 参数
  - Scribe 完成后调用 `onProgress({ status: 'running', phase: 'scribe', step: totalSteps - 4, total: totalSteps, current: 'Scribe' })`
  - 修改 `runArchivistDag`，也接受 `onProgress` 参数
  - Archivist-Characters 完成后调用：`{ phase: 'archivist', step: totalSteps - 3, current: '角色更新' }`
  - Archivist 并行组（Scene/World/Plot/Timeline）完成后调用：`{ phase: 'archivist', step: totalSteps - 2, current: '场景/世界/剧情/时间线' }`
  - Archivist-Debts 完成后调用：`{ phase: 'archivist', step: totalSteps - 1, current: '伏笔更新' }`
  - step 编号使用 `totalSteps - X` 语义，避免硬编码 actor 数量依赖

  **Must NOT do**:
  - 不要改变 archivist DAG 的执行顺序或并行逻辑
  - 不要在并行组中为每个 sub-agent 单独上报（合并为一步）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要拆解 archivist DAG 的进度上报点，涉及并行组完成时机判断
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: Task 11
  - **Blocked By**: Task 1

  **References**:
  - `src/pipeline/scribe-archivist-phase.ts:40-103` — runArchivistDag 当前实现
  - `src/pipeline/scribe-archivist-phase.ts:105-133` — runScribeAndArchivist 当前实现
  - `src/lib/tool-progress.ts:1-7` — ToolProgress 接口

  **Acceptance Criteria**:
  - [ ] `runScribeAndArchivist` 接受 `onProgress` 和 `totalSteps` 参数
  - [ ] Scribe 阶段上报 step = totalSteps - 4
  - [ ] Archivist Characters 上报 step = totalSteps - 3
  - [ ] Archivist 并行组上报 step = totalSteps - 2
  - [ ] Archivist Debts 上报 step = totalSteps - 1
  - [ ] onProgress 为 undefined 时不报错

  **QA Scenarios**:

  ```
  Scenario: All 4 progress callbacks fired in order
    Tool: Bash (bun test)
    Preconditions: Mock scribeAgent and archivist sub-agents, totalSteps=8
    Steps:
      1. Create progressCalls: ToolProgress[] = []
      2. Call runScribeAndArchivist(narrativeSummary, storyDir, { onProgress: (p) => progressCalls.push(p), totalSteps: 8 })
      3. Check progressCalls
    Expected Result: length === 4, steps are [4, 5, 6, 7] (totalSteps - 4 to totalSteps - 1), phases: ['scribe', 'archivist', 'archivist', 'archivist']
    Evidence: .sisyphus/evidence/task-6-callbacks.txt

  Scenario: Archivist parallel batch completes before debts
    Tool: Bash (bun test)
    Preconditions: Mock agents
    Steps:
      1. Capture order of onProgress calls
      2. Verify '场景/世界/剧情/时间线' before '伏笔更新'
    Expected Result: '场景/世界/剧情/时间线' appears before '伏笔更新' in progressCalls
    Evidence: .sisyphus/evidence/task-6-order.txt
  ```

  **Commit**: YES (groups with Tasks 4, 5, 7)
  - Message: `feat(progress): add per-step progress reporting to pipeline phases`
  - Files: `src/pipeline/scribe-archivist-phase.ts`

- [x] 7. status API — optional callId filter

  **What to do**:
  - 在 `GET /api/narrative/status` 中增加可选的 `callId` 查询参数
  - 若提供 callId，返回 `toolProgress: getToolProgress(projectId, callId)`（单个或 undefined）
  - 若不提供 callId，返回 `toolProgress: getToolProgress(projectId)`（所有活跃进度，key 为 callId）
  - 其他返回字段（sceneId, location, characters）不变

  **Must NOT do**:
  - 不要改变接口的 response shape（仍返回 `{ success, sceneId, location, characters, toolProgress }`）
  - 不要移除 `threadId` 兼容参数

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单参数透传，无复杂逻辑
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: None directly
  - **Blocked By**: Task 1

  **References**:
  - `src/app/api/narrative/status/route.ts:1-56` — 当前实现
  - `src/lib/tool-progress.ts` — 更新后的 getToolProgress（支持 callId 过滤）

  **Acceptance Criteria**:
  - [ ] `?projectId=X&callId=Y` 返回单个进度或 undefined
  - [ ] `?projectId=X`（不带 callId）返回所有活跃进度
  - [ ] `?threadId=X` 仍兼容（映射到 projectId）
  - [ ] 不影响 sceneId, location, characters 字段

  **QA Scenarios**:

  ```
  Scenario: Status API with callId filter
    Tool: Bash (curl)
    Preconditions: Dev server running, progress set for callId 'test-call'
    Steps:
      1. curl "http://localhost:4477/api/narrative/status?projectId=p001&callId=test-call"
    Expected Result: JSON with toolProgress containing { phase: 'actor', step: 1, ... }
    Evidence: .sisyphus/evidence/task-7-filter.json

  Scenario: Status API without callId returns all
    Tool: Bash (curl)
    Preconditions: Dev server running, multiple progress entries set
    Steps:
      1. curl "http://localhost:4477/api/narrative/status?projectId=p001"
    Expected Result: JSON with toolProgress as Record with multiple callId keys
    Evidence: .sisyphus/evidence/task-7-all.json
  ```

  **Commit**: YES (groups with Tasks 4, 5, 6)
  - Message: `feat(progress): add per-step progress reporting to pipeline phases`
  - Files: `src/app/api/narrative/status/route.ts`

- [x] 8. ProjectChat polling hook

  **What to do**:
  - 在 `src/app/page.tsx` 的 `ProjectChat` 组件中创建 `usePipelineStatus` 自定义 hook（或内联逻辑）
  - 单一 `useEffect` + `setInterval` 轮询 `GET /api/narrative/status?projectId=X`
  - 自适应频率：当 `isActive`（status === 'streaming' 且存在 submit_schedule 活跃 part）时 1s，否则 5s
  - 从 `messages` 中调用 `deriveSubmitScheduleActive(messages)` 判断是否活跃
  - 将轮询结果 (`sceneId, location, toolProgress`) 通过 props 向下传递：
    - SceneIndicator 接收 `sceneId, location` 
    - MessageList 接收 `toolProgress`（通过回调或 props）

  **Must NOT do**:
  - 不要在 hook 中操作 DOM
  - 不要创建新的 Context/Provider（先用 props drilling，简单直接）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 React hook 封装，逻辑清晰
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `src/app/page.tsx:32-68` — ProjectChat 组件当前实现
  - `src/components/chat/message-list.tsx:29-43` — deriveSubmitScheduleActive 函数（需要移出或复用）
  - `src/components/chat/pipeline-progress.tsx:39-71` — 当前轮询逻辑（参考 polling 模式）

  **Acceptance Criteria**:
  - [ ] 单一 `setInterval` 管理轮询，根据 isActive 切换 1s/5s
  - [ ] isActive=false 时降频到 5s
  - [ ] isActive=true 时 1s 轮询
  - [ ] 组件卸载时清除 interval
  - [ ] SceneIndicator 从 props 接收数据而非独立轮询

  **QA Scenarios**:

  ```
  Scenario: Polling starts when submit_schedule becomes active
    Tool: Playwright
    Preconditions: Dev server running, project selected
    Steps:
      1. Navigate to app, start a scene that triggers submit_schedule
      2. Open browser DevTools Network tab
      3. Observe GET /api/narrative/status requests
    Expected Result: Status API called every ~1s while submit_schedule is running
    Evidence: .sisyphus/evidence/task-8-active-polling.png

  Scenario: Polling slows down after pipeline completes
    Tool: Playwright
    Preconditions: submit_schedule just completed
    Steps:
      1. Wait 10 seconds after completion
      2. Check Network tab request timing
    Expected Result: Status API called every ~5s after pipeline completes
    Evidence: .sisyphus/evidence/task-8-idle-polling.png
  ```

  **Commit**: YES (groups with Tasks 9, 10)
  - Message: `feat(ui): consolidate progress display into ToolTag with adaptive polling`
  - Files: `src/app/page.tsx`

- [x] 9. ToolTag progress bar extension

  **What to do**:
  - 在 `ToolTag` 组件中增加 `progress?: ToolProgress` prop
  - 当 `toolName === 'submit_schedule'` 且 `progress` 存在且 `status === 'running'` 时，在 tag pill 下方渲染内嵌进度条
  - 进度条包含：phase 图标 + phase 中文名 + current 步骤名 + step/total 计数器 + 百分比进度条
  - 复用 `AGENT_COLORS` 和 `PHASE_LABELS`/`PHASE_ICONS`（需要从 pipeline-progress.tsx 迁移这些常量）
  - 进度条样式：紧凑内联，不超过 ToolTag 的视觉重量

  **Must NOT do**:
  - 不要改变 ToolTag 现有的点击交互
  - 不要改变非 submit_schedule 工具的渲染

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 组件扩展，需要精细的样式处理和内嵌进度条设计
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `src/components/chat/tool-tag.tsx:1-102` — ToolTag 当前实现
  - `src/components/chat/pipeline-progress.tsx:23-33` — PHASE_LABELS, PHASE_ICONS 常量
  - `src/components/chat/pipeline-progress.tsx:77-127` — 进度条渲染逻辑（参考迁移）
  - `src/components/chat/tool-meta.ts:13-18` — AGENT_COLORS
  - `src/lib/tool-progress.ts:1-7` — ToolProgress 接口

  **Acceptance Criteria**:
  - [ ] ToolTag 接受可选的 `progress` prop
  - [ ] submit_schedule + running 状态时，tag 下方显示进度条
  - [ ] 进度条显示 phase 图标、中文名、当前步骤名、step/total、百分比
  - [ ] 进度条颜色与当前 phase 匹配（actor=粉, scribe=黄, archivist=绿）
  - [ ] 其他工具不受影响

  **QA Scenarios**:

  ```
  Scenario: ToolTag shows progress bar during actor phase
    Tool: Playwright
    Preconditions: Dev server running, trigger a scene with submit_schedule
    Steps:
      1. Wait for submit_schedule ToolTag to appear
      2. Observe progress bar below the tag
    Expected Result: Progress bar visible with "🎭 角色演绎 · 张三 1/8 12%" during actor phase
    Evidence: .sisyphus/evidence/task-9-actor-progress.png

  Scenario: ToolTag progress updates during archivist phase
    Tool: Playwright
    Preconditions: Pipeline running, past actor phase
    Steps:
      1. Observe ToolTag during archivist phase
    Expected Result: Progress shows "📦 归档更新 · 场景/世界/剧情/时间线 7/8 87%"
    Evidence: .sisyphus/evidence/task-9-archivist-progress.png

  Scenario: Non-submit_schedule tools unaffected
    Tool: Playwright
    Preconditions: GM calls read_file tool
    Steps:
      1. Observe read_file ToolTag
    Expected Result: No progress bar shown, normal ToolTag rendering
    Evidence: .sisyphus/evidence/task-9-normal-tool.png
  ```

  **Commit**: YES (groups with Tasks 8, 10)
  - Message: `feat(ui): consolidate progress display into ToolTag with adaptive polling`
  - Files: `src/components/chat/tool-tag.tsx`

- [x] 10. SceneIndicator props-based refactor

  **What to do**:
  - 修改 `SceneIndicator` 组件，移除内部的 `useEffect` + `fetchStatus` 轮询
  - 改为通过 props 接收 `sceneId`, `location` 等数据
  - 更新 `SceneIndicatorProps` 接口

  **Must NOT do**:
  - 不要改变 SceneIndicator 的渲染样式
  - 不要增加不必要的重渲染

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 props refactor，移除 useEffect
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: Task 11
  - **Blocked By**: Task 8

  **References**:
  - `src/components/chat/scene-indicator.tsx:1-72` — 当前实现（含轮询）

  **Acceptance Criteria**:
  - [ ] `SceneIndicator` 无内部 useEffect/轮询
  - [ ] 通过 props 接收 sceneId, location
  - [ ] 渲染逻辑不变

  **QA Scenarios**:

  ```
  Scenario: SceneIndicator renders from props
    Tool: Playwright
    Preconditions: Dev server running, project selected
    Steps:
      1. Pass sceneId='s001', location='洛阳城' as props
      2. Observe rendered output
    Expected Result: Displays "📍 洛阳城" and "📋 s001" badges
    Evidence: .sisyphus/evidence/task-10-props.png
  ```

  **Commit**: YES (groups with Tasks 8, 9)
  - Message: `feat(ui): consolidate progress display into ToolTag with adaptive polling`
  - Files: `src/components/chat/scene-indicator.tsx`

- [x] 11. MessageList — wire everything, remove old components

  **What to do**:
  - 移除 `MessageList` 中的 `PipelineProgress` 渲染（line 80）
  - 移除 `MessageList` 中的 `ProgressIndicator` 渲染（lines 81-85）
  - 移除 `deriveProgress` 函数（lines 14-27）
  - 移除 `deriveSubmitScheduleActive` 函数（lines 29-43）— 逻辑移到 ProjectChat 的 polling hook
  - 移除相关 import（PipelineProgress, ProgressIndicator, TOOL_STEP_MAP）
  - 将 `toolProgress` 数据通过现有的渲染链传递到 `ToolTag`：
    - `MessageList` 接收 `toolProgress?: Record<string, ToolProgress>` prop
    - `MessageItem` 接收匹配的 progress 数据（或通过 context）
    - `ToolTag` 接收对应 callId 的 progress
  - 核心逻辑：在 `separateParts` 或 `ToolTag` 渲染时，通过 `part.toolCallId` 匹配 `toolProgress[part.toolCallId]`

  **Must NOT do**:
  - 不要改变消息的文本渲染逻辑
  - 不要改变 ToolDetailSheet 的行为

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及多个组件的协调修改，需要理解数据流和 props 传递链
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, depends on all previous waves)
  - **Blocks**: Task 12, F1-F4
  - **Blocked By**: Tasks 4, 5, 6, 8, 9, 10

  **References**:
  - `src/components/chat/message-list.tsx:1-105` — 当前实现
  - `src/components/chat/message-item.tsx:41-82` — separateParts 函数
  - `src/components/chat/message-item.tsx:57-77` — ToolTag 渲染逻辑
  - `src/components/chat/tool-tag.tsx` — 更新后的 ToolTag（接受 progress prop）
  - `src/app/page.tsx` — ProjectChat 中的轮询数据

  **Acceptance Criteria**:
  - [ ] PipelineProgress 组件不再被 MessageList 渲染
  - [ ] ProgressIndicator 组件不再被 MessageList 渲染
  - [ ] `deriveProgress`, `deriveSubmitScheduleActive` 从 message-list.tsx 移除
  - [ ] TOOL_STEP_MAP 不再被 message-list.tsx import
  - [ ] ToolTag 通过 `part.toolCallId` 成功匹配到对应 progress 数据
  - [ ] 无 TypeScript 编译错误

  **QA Scenarios**:

  ```
  Scenario: Submit_schedule ToolTag shows progress during pipeline
    Tool: Playwright
    Preconditions: Dev server running, trigger a scene
    Steps:
      1. Wait for submit_schedule ToolTag to appear in message
      2. Observe progress bar updates during actor phase
      3. Observe phase transitions (actor → scribe → archivist)
    Expected Result: Progress bar visible and updating, showing per-character names during actor phase
    Evidence: .sisyphus/evidence/task-11-pipeline-progress.png

  Scenario: PipelineProgress component NOT rendered
    Tool: Playwright
    Preconditions: Pipeline running
    Steps:
      1. Inspect DOM for PipelineProgress component (.pipeline-progress class or similar)
    Expected Result: No PipelineProgress element found in DOM
    Evidence: .sisyphus/evidence/task-11-no-old-progress.png

  Scenario: ProgressIndicator NOT rendered
    Tool: Playwright
    Preconditions: AI streaming in progress
    Steps:
      1. Inspect DOM for ProgressIndicator dots (GM→Actor→Scribe→Archivist)
    Expected Result: No ProgressIndicator element found in DOM
    Evidence: .sisyphus/evidence/task-11-no-old-indicator.png

  Scenario: Normal message rendering unaffected
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Send a simple message, observe assistant response
    Expected Result: Text messages render normally with proper bubble styling
    Evidence: .sisyphus/evidence/task-11-normal-msg.png
  ```

  **Commit**: YES (groups with Task 12)
  - Message: `feat(ui): wire progress data and remove deprecated components`
  - Files: `src/components/chat/message-list.tsx`, `src/components/chat/message-item.tsx`
  - Pre-commit: `bun run build`

- [x] 12. Update tests

  **What to do**:
  - 更新 `tests/unit/lib/tool-progress.test.ts`：适配新的 callId-based API
  - 更新 `tests/unit/tools/submit-schedule.test.ts`：适配 execute 第 3 参数、total 公式、onProgress 回调
  - 确认已有的 enact-phase 和 scribe-archivist-phase 测试是否需要更新（如果它们 mock 了 pipeline 函数）
  - 运行 `bun test` 确认全部通过

  **Must NOT do**:
  - 不要删除现有测试用例（更新参数即可）
  - 不要添加超出本次重构范围的测试

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解现有测试结构并对齐新的 API 签名
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, after Task 11)
  - **Blocks**: Final Verification
  - **Blocked By**: Tasks 4, 5, 6, 11

  **References**:
  - `tests/unit/lib/tool-progress.test.ts` — tool-progress 测试
  - `tests/unit/tools/submit-schedule.test.ts` — submit-schedule 测试
  - `src/lib/tool-progress.ts` — 更新后的 API
  - `src/tools/submit-schedule.ts` — 更新后的 execute

  **Acceptance Criteria**:
  - [ ] `bun test tests/unit/lib/tool-progress.test.ts` → 全部通过
  - [ ] `bun test tests/unit/tools/submit-schedule.test.ts` → 全部通过
  - [ ] `bun test` → 全部测试通过，无回归

  **QA Scenarios**:

  ```
  Scenario: All unit tests pass
    Tool: Bash
    Preconditions: All code changes applied
    Steps:
      1. Run bun test
    Expected Result: All tests pass, exit code 0
    Evidence: .sisyphus/evidence/task-12-all-tests.txt
  ```

  **Commit**: YES (groups with Task 11)
  - Message: `feat(ui): wire progress data and remove deprecated components`
  - Files: `tests/unit/lib/tool-progress.test.ts`, `tests/unit/tools/submit-schedule.test.ts`
  - Pre-commit: `bun test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Verify:
  - submit_schedule execute 接收 details 第 3 参数
  - enact-phase 接受 onProgress 参数
  - scribe-archivist-phase 接受 onProgress 参数并分 3 个子阶段上报
  - tool-progress key 为 callId
  - ToolTag 显示进度条
  - ProjectChat 单一轮询
  - PipelineProgress 和 ProgressIndicator 已删除
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `bun run lint` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify:
  - No `as any` in pipeline or tool files
  - No empty catch blocks without comments
  - All imports used
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration:
  - Start a real scene that triggers submit_schedule
  - Observe ToolTag shows per-character progress during actor phase
  - Observe phase transitions (actor → scribe → archivist) on the same ToolTag
  - Observe archivist sub-steps visible
  - Verify PipelineProgress and ProgressIndicator NOT rendered
  - Test error handling: what happens if pipeline fails mid-way?
  - Test edge cases: empty schedule? Rapid scene submissions?
  Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Verify:
  - Agent definitions untouched (actor.ts, scribe.ts, gm.ts, archivist/factory.ts)
  - archivist DAG execution logic unchanged (only progress callback added)
  - Session management untouched
  - No new npm dependencies
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `refactor(progress): change toolProgress key from toolName to callId` — tool-progress.ts, types.ts, tool-meta.ts
- **Wave 2**: `feat(progress): add per-step progress reporting to pipeline phases` — submit-schedule.ts, enact-phase.ts, scribe-archivist-phase.ts, status/route.ts
- **Wave 3**: `feat(ui): consolidate progress display into ToolTag with adaptive polling` — page.tsx, tool-tag.tsx, scene-indicator.tsx
- **Wave 4**: `feat(ui): wire progress data and remove deprecated components` — message-list.tsx, message-item.tsx, tests/*
  - Pre-commit: `bun test`

---

## Success Criteria

### Verification Commands
```bash
bun dev                    # Expected: dev server starts on port 4477, no console errors
bun test                   # Expected: all tests pass
bun run build              # Expected: production build succeeds
```

### Final Checklist
- [ ] ToolTag shows progress bar during submit_schedule execution
- [ ] Per-character actor progress visible (step N/total with character name)
- [ ] Archivist 3 sub-steps visible (角色更新 → 场景/世界/剧情/时间线 → 伏笔更新)
- [ ] PipelineProgress and ProgressIndicator components removed
- [ ] Single polling in ProjectChat with adaptive frequency
- [ ] No regression in existing functionality
