# 方案 B：GM 暂停/恢复 — 非阻塞 submit_schedule + Pipeline 通知 GM

## TL;DR

> **核心思路**：`submit_schedule` 保持非阻塞（异步工具调用作为 Agent 特性保留），但通过返回值+prompt 引导 GM 在调度提交后停止输出。Pipeline 照常执行子 Agent（dynamic-tool 进度标签完整保留），完成后用同一会话重新调用 GM 输出文学文本。
> 
> **Deliverables**：
> - `submit_schedule` 返回值改为明确指示 GM 停止
> - GM prompt 微调输出规范
> - `narrative-pipeline.ts` 新增 `gmOutputPhase()`，`scribePhase()` 返回文学文本
> - 测试适配新流程
> 
> **Estimated Effort**: Short
> **Parallel Execution**: NO - sequential（改动互相依赖）
> **Critical Path**: submit-schedule → prompt → pipeline → tests

---

## Context

### Original Request
GM 输出流程存在问题：调用 submit_schedule 后不等待调度结果就自行输出内容，调度执行后结果未输出给用户。

### Interview Summary
**Key Discussions**:
- 当前 `submit_schedule` 是非阻塞工具，立即返回 `{ok: true}`，GM 收到后继续自行生成叙事文本
- Pipeline 的调度执行（Actor→Scribe→Archivist）在 GM 运行结束后才从结果中提取 schedule 执行，与 GM 完全脱节
- Scribe 的文学文本被困在 dynamic-tool 的 output 字段中，用户不可见
- 方案 A（阻塞式 execute + AsyncQueue 合并）被否决：过度设计、破坏 dynamic-tool 交互体验
- 方案 B（非阻塞 + GM 暂停/恢复）被采纳：复用现有架构、保留 dynamic-tool、改动量小

**Research Findings**:
- 前端"执行中"状态已经持续到整个 Pipeline 完成（stream 在 GM 结束后继续开着）——说明当前架构已具备"GM 完成后继续发射事件"的能力
- `buildUiMessageStream()` adapter 中 `response_started` 事件会重置 `responseHasText`，允许新 step 中发射文本
- `scribePhase()` 当前不返回文学文本，需要改造为返回值

### Metis Review
**Identified Gaps** (addressed):
- GM 停止的可靠性：三层机制叠加（返回值 + prompt + maxTurns 安全网）
- GM 第二段调用可能修改文学文本：用 `maxTurns: 1` 限制只输出不操作
- `scribePhase()` 需要返回文学文本给 `createSceneStream()` 以便传给 `gmOutputPhase()`

---

## Work Objectives

### Core Objective
让 GM 在 submit_schedule 后停止输出，Pipeline 执行子 Agent 后通知 GM 结果，GM 恢复输出文学文本。

### Concrete Deliverables
- `src/tools/submit-schedule.ts` — 返回值引导 GM 停止
- `src/prompts/gm.ts` — 输出规范微调
- `src/pipeline/narrative-pipeline.ts` — scribePhase 返回文学文本 + 新增 gmOutputPhase + 调整 createSceneStream 流程
- 测试通过

### Definition of Done
- [ ] `bun run build` 成功
- [ ] `bun test` 全部通过
- [ ] GM 调用 submit_schedule 后不再自行输出叙事文本
- [ ] Scribe 文学文本作为 GM 第二段输出出现在聊天中

### Must Have
- `submit_schedule` 保持非阻塞（异步工具调用模式）
- dynamic-tool 进度标签完整保留（Actor/Scribe/Archivist 标签照常出现）
- GM 第二段调用使用同一 gmSession（对话历史连续）
- `maxTurns: 1` 限制 GM 第二段只输出不操作

### Must NOT Have (Guardrails)
- 不要移除任何 dynamic-tool 映射（Actor/Scribe/Archivist 标签必须保留）
- 不要把 submit_schedule 改成阻塞工具
- 不要新建 AsyncQueue 或流合并基础设施
- 不要大幅重写 GM prompt（只微调输出规范）
- 不要删除 enactPhase/scribePhase/archivistDagPhase 的事件发射逻辑

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: YES (Tests-after)
- **Framework**: bun test

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Sequential Execution（改动互相依赖）

```
Step 1: submit-schedule.ts 返回值修改
Step 2: gm.ts prompt 微调
Step 3: narrative-pipeline.ts 流程改造（依赖 1+2 的语义）
Step 4: 测试适配
Step 5: 验证 build + test
```

### Agent Dispatch Summary
- Steps 1-3: `quick`（单文件改动，逻辑清晰）
- Step 4: `unspecified-high`（测试可能需要调整多个文件）
- Step 5: `quick`（build + test 命令）

---

## TODOs

- [x] 1. 修改 `submit_schedule` 返回值

  **What to do**:
  - 将 `submit-schedule.ts` 的 `execute` 返回值从 `{accepted: true, steps: N, message: "调度计划已提交..."}` 改为明确指示 GM 停止输出的内容
  - 新返回值：`{accepted: true, steps: N, message: "调度已提交，系统正在执行。请勿输出叙事内容，等待执行结果返回。"}`
  - 目的：让 GM 收到工具结果后知道不应继续生成叙事文本

  **Must NOT do**:
  - 不要把 execute 改成阻塞（不要在里面运行子 Agent）
  - 不要改变工具的参数 schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/tools/submit-schedule.ts:22-30` — 当前 execute 函数和 toolResult 调用模式
  - `src/lib/tool-result.ts` — toolResult/toolError 工具函数

  **WHY Each Reference Matters**:
  - submit-schedule.ts:22-30 — 这是需要修改的代码位置，包含当前的返回值结构
  - tool-result.ts — 确认 toolResult() 的调用约定，确保返回值格式正确

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: submit_schedule 返回值引导 GM 停止
    Tool: Bash (bun test)
    Preconditions: 测试文件存在
    Steps:
      1. 运行 bun test tests/unit/tools/ 相关测试
      2. 检查返回值 JSON 中 message 字段包含"请勿输出叙事内容"
    Expected Result: 测试通过，返回值包含停止指示
    Failure Indicators: 测试失败或返回值未包含停止指示
    Evidence: .sisyphus/evidence/task-1-return-value.txt

  Scenario: submit_schedule 仍为非阻塞
    Tool: Bash (grep)
    Preconditions: 代码已修改
    Steps:
      1. 检查 submit-schedule.ts 中 execute 函数不包含 await agentsRun 或 await callAgent
    Expected Result: execute 函数中无子 Agent 调用
    Failure Indicators: execute 中出现阻塞调用
    Evidence: .sisyphus/evidence/task-1-non-blocking.txt
  ```

  **Commit**: YES
  - Message: `fix(tools): submit_schedule return value instructs GM to stop`
  - Files: `src/tools/submit-schedule.ts`

- [x] 2. 微调 GM prompt 输出规范

  **What to do**:
  - 修改 `src/prompts/gm.ts` 中 `## 7. 输出规范` 部分
  - 将"在输出文本时只返回 Scribe 的文学文本"改为：
    "调用 submit_schedule 后，只需简短确认（如'调度已提交'），不要输出叙事内容。系统会自动执行调度并将文学文本返回给你。"
  - 非调度场景（故事启动问询等）GM 自行回复的行为不变
  - 工具调用流程描述（第45行）从"→完成（后续由系统自动执行）"改为"→完成（后续由系统自动执行，结果将返回给你）"

  **Must NOT do**:
  - 不要大幅重写 prompt（只微调输出规范和工具调用流程描述）
  - 不要添加冗余的"如何输出结果"指令（GM 自然会输出收到的内容）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/prompts/gm.ts:143-153` — 当前输出规范（## 7. 输出规范）
  - `src/prompts/gm.ts:45` — 工具调用流程描述

  **WHY Each Reference Matters**:
  - gm.ts:143-153 — 需要修改的输出规范文本
  - gm.ts:45 — 需要更新的工具调用流程描述，让 GM 知道结果会返回

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: prompt 包含停止指示
    Tool: Bash (grep)
    Preconditions: 代码已修改
    Steps:
      1. 在 gm.ts 中搜索"不要输出叙事内容"
      2. 确认输出规范部分包含调度后停止的指示
    Expected Result: 找到匹配
    Failure Indicators: 未找到匹配
    Evidence: .sisyphus/evidence/task-2-prompt-update.txt
  ```

  **Commit**: YES
  - Message: `fix(prompts): GM output spec — stop after submit_schedule, await result`
  - Files: `src/prompts/gm.ts`

- [x] 3. 改造 narrative-pipeline.ts 流程

  **What to do**:
  - **scribePhase 改造**：当前 `scribePhase()` 的返回类型是 `AsyncGenerator<RunStreamEvent>`（无返回值）。改为返回文学文本：
    ```typescript
    async function* scribePhase(
      narrativeSummary: string,
      storyDir: string,
    ): AsyncGenerator<RunStreamEvent, string> {  // 返回类型加 string
      // ... 现有逻辑 ...
      const literaryText = String(scribeResult.finalOutput ?? "");
      // archivistDagPhase 仍在 scribePhase 内部调用（现有结构不变）
      yield* archivistDagPhase(narrativeSummary, literaryText, storyDir);
      return literaryText;  // 新增：返回文学文本
    }
    ```
  - **新增 gmOutputPhase**：
    ```typescript
    async function* gmOutputPhase(
      scribeOutput: string,
      storyDir: string,
      projectId: string,
      projectDir: string,
      gmSession: Session,
    ): AsyncGenerator<RunStreamEvent> {
      const startTime = Date.now();
      console.log(`[Pipeline] GM output phase starting`);
      const gmStream = await _run(
        gmAgent,
        scribeOutput,
        {
          stream: true,
          context: { storyDir, projectId, projectDir },
          maxTurns: 1,
          session: gmSession,
          traceMetadata: { storyDir, projectId },
        } as Parameters<typeof _run>[2],
      ) as StreamedRunResult<any, any>;
      for await (const event of forwardRun(gmStream)) {
        yield event;
      }
      await gmStream.completed;
      const gmResult = gmStream as unknown as AnyRunResult;
      logAgentResult('GM-Output', gmResult, startTime);
    }
    ```
  - **调整 createSceneStream**：
    ```typescript
    export async function* createSceneStream(...): AsyncGenerator<RunStreamEvent> {
      setupTracing();
      // Turn 1: GM 编排
      const gmResult = yield* gmPhase(input.input, storyDir, projectId, projectDir, gmSession);
      const scheduleData = extractScheduleFromResult(gmResult);
      if (!scheduleData) return;
      const { schedule, narrativeSummary } = scheduleData;
      // 子 Agent 执行（dynamic-tool 事件照常发射）
      yield* enactPhase(schedule, storyDir, projectId, projectDir);
      const scribeOutput = yield* scribePhase(narrativeSummary, storyDir);
      clearInteractionLog(storyDir);
      // Turn 2: GM 输出文学文本
      if (scribeOutput) {
        yield* gmOutputPhase(scribeOutput, storyDir, projectId, projectDir, gmSession);
      }
    }
    ```

  **Must NOT do**:
  - 不要删除 enactPhase/scribePhase/archivistDagPhase 的事件发射逻辑
  - 不要修改 callAgent/callAgentsParallel/forwardRun
  - 不要移除 clearInteractionLog 调用
  - gmOutputPhase 中 maxTurns 必须为 1（只输出，不调工具）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Task 1, Task 2

  **References**:

  **Pattern References**:
  - `src/pipeline/narrative-pipeline.ts:179-210` — 当前 scribePhase 实现
  - `src/pipeline/narrative-pipeline.ts:95-126` — gmPhase 实现（作为 gmOutputPhase 的模板）
  - `src/pipeline/narrative-pipeline.ts:290-312` — 当前 createSceneStream 流程
  - `src/pipeline/call-agent.ts:167-171` — forwardRun 实现

  **API/Type References**:
  - `@openai/agents` — `run`, `StreamedRunResult`, `RunStreamEvent`, `Session` 类型
  - `src/pipeline/narrative-pipeline.ts:22` — `AnyRunResult` 类型别名

  **WHY Each Reference Matters**:
  - narrative-pipeline.ts:179-210 — scribePhase 需要改造为返回文学文本，这是核心变更
  - narrative-pipeline.ts:95-126 — gmPhase 是 gmOutputPhase 的直接模板，stream + forwardRun + completed 模式完全复用
  - narrative-pipeline.ts:290-312 — createSceneStream 需要新增 gmOutputPhase 调用
  - call-agent.ts:167-171 — forwardRun 是 gmOutputPhase 中转发事件的工具函数

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: scribePhase 返回文学文本
    Tool: Bash (bun test)
    Preconditions: 代码已修改
    Steps:
      1. 运行 pipeline 相关测试
      2. 验证 scribePhase 的返回值类型包含 string
    Expected Result: 测试通过，scribePhase 返回文学文本
    Failure Indicators: TypeScript 编译错误或测试失败
    Evidence: .sisyphus/evidence/task-3-scribe-return.txt

  Scenario: createSceneStream 包含 gmOutputPhase
    Tool: Bash (grep)
    Preconditions: 代码已修改
    Steps:
      1. 在 narrative-pipeline.ts 中搜索 gmOutputPhase
      2. 确认 createSceneStream 中调用了 gmOutputPhase
    Expected Result: 找到 gmOutputPhase 定义和调用
    Failure Indicators: 未找到
    Evidence: .sisyphus/evidence/task-3-gm-output-phase.txt

  Scenario: gmOutputPhase 使用 maxTurns: 1
    Tool: Bash (grep)
    Preconditions: 代码已修改
    Steps:
      1. 在 gmOutputPhase 函数中确认 maxTurns: 1
    Expected Result: maxTurns 为 1
    Failure Indicators: maxTurns 不是 1 或缺失
    Evidence: .sisyphus/evidence/task-3-max-turns.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): GM pause/resume — scribePhase returns text, add gmOutputPhase`
  - Files: `src/pipeline/narrative-pipeline.ts`

- [x] 4. 适配测试

  **What to do**:
  - 检查 `tests/unit/pipeline/narrative-pipeline.test.ts` 中的测试用例
  - 更新需要适配的测试：
    - scribePhase 现在返回文学文本，测试需要验证返回值
    - createSceneStream 流程新增了 gmOutputPhase，测试需要验证 GM 第二段调用
    - submit_schedule 返回值变更可能影响 mock 验证
  - 如果测试中 mock 了 `_run`，确保 GM 第二段调用的 mock 也能正确处理

  **Must NOT do**:
  - 不要删除测试用例
  - 不要降低测试覆盖率

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `tests/unit/pipeline/narrative-pipeline.test.ts` — 现有 pipeline 测试

  **WHY Each Reference Matters**:
  - 这是需要适配的测试文件，包含所有 pipeline 相关测试用例

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 所有 pipeline 测试通过
    Tool: Bash (bun test)
    Preconditions: 代码和测试已修改
    Steps:
      1. 运行 bun test tests/unit/pipeline/
      2. 检查所有测试通过
    Expected Result: 0 failures
    Failure Indicators: 任何测试失败
    Evidence: .sisyphus/evidence/task-4-tests.txt
  ```

  **Commit**: YES
  - Message: `test(pipeline): adapt tests for GM pause/resume flow`
  - Files: `tests/unit/pipeline/narrative-pipeline.test.ts`

- [x] 5. 验证 build + test

  **What to do**:
  - 运行 `bun run build` 确认生产构建成功
  - 运行 `bun test` 确认全部测试通过
  - 运行 `bun run lint` 确认无 lint 错误

  **Must NOT do**:
  - 不要跳过任何验证步骤

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 生产构建成功
    Tool: Bash (bun run build)
    Preconditions: 所有代码修改完成
    Steps:
      1. 运行 bun run build
      2. 检查退出码为 0
    Expected Result: 构建成功，无 TypeScript 错误
    Failure Indicators: 构建失败或类型错误
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: 全部测试通过
    Tool: Bash (bun test)
    Preconditions: 所有代码修改完成
    Steps:
      1. 运行 bun test
      2. 检查 0 failures
    Expected Result: 全部测试通过
    Failure Indicators: 任何测试失败
    Evidence: .sisyphus/evidence/task-5-tests.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start dev server. Send a message that triggers submit_schedule. Verify: (1) GM stops after submit_schedule, (2) Actor/Scribe/Archivist tags appear, (3) Literary text appears as visible text after all tags.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance.
  Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

- **Task 1**: `fix(tools): submit_schedule return value instructs GM to stop` - src/tools/submit-schedule.ts
- **Task 2**: `fix(prompts): GM output spec — stop after submit_schedule, await result` - src/prompts/gm.ts
- **Task 3**: `feat(pipeline): GM pause/resume — scribePhase returns text, add gmOutputPhase` - src/pipeline/narrative-pipeline.ts
- **Task 4**: `test(pipeline): adapt tests for GM pause/resume flow` - tests/unit/pipeline/narrative-pipeline.test.ts

---

## Success Criteria

### Verification Commands
```bash
bun run build  # Expected: success
bun test       # Expected: all pass
```

### Final Checklist
- [x] submit_schedule 返回值包含"请勿输出叙事内容"
- [x] GM prompt 输出规范包含调度后停止指示
- [x] scribePhase 返回文学文本
- [x] gmOutputPhase 存在且使用 maxTurns: 1
- [x] createSceneStream 在子 Agent 执行后调用 gmOutputPhase
- [x] dynamic-tool 映射（Actor/Scribe/Archivist）未被移除
- [x] 所有测试通过
