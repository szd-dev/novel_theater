# Pipeline Orchestration + Parallel Archivist

## TL;DR

> **Quick Summary**: 将GM驱动的4阶段调度重构为代码驱动的Pipeline（GM仅Orient+Script），并将单体Archivist拆分为6个并行子Agent。使用 withTrace + ProjectTraceExporter 替代 prompt-logger，按 project 拆分日志。
> 
> **Deliverables**:
> - `src/lib/trace-exporter.ts` — ProjectTraceExporter（按 project 拆分的 JSONL 导出器）
> - `src/lib/trace-setup.ts` — setupTracing() 注册函数
> - `src/pipeline/call-agent.ts` — callAgent/callAgentsParallel/forwardRun 辅助函数
> - `src/pipeline/narrative-pipeline.ts` — Pipeline async generator（withTrace 包裹）
> - `src/agents/archivist/` — 6个Archivist子Agent工厂 + 子Prompt
> - `submit_schedule` 工具 + GM Prompt重写
> - API路由重构 + UI tool-meta更新 + prompt-logger移除
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves + final review
> **Critical Path**: Task 1 → Task 3 → Task 8 → Task 9 → Task 12 → F1-F4

---

## Context

### Original Request
将现有的调度变更为整体调度（降低GM调度难度），并行执行场记更新（提高效率）。UI上顺序展示subagent调度过程，不封装为单个工具调用。

### Interview Summary
**Key Discussions**:
- 流组合方式：从ReadableStream+controller.enqueue改为async generator+yield*
- 事件构造层面：从UI消息流事件改为RunStreamEvent（框架自动转换）
- 非场景请求：GM流完整透传，schedule从result提取（零风险）
- 子Agent调用封装：callAgent()/callAgentsParallel() 返回 { events, result }
- 流事件构造方式：手写RunItemStreamEvent（方式A），精确控制UI展示
- Archivist DAG：Characters(门控) → [Scene∥World∥Plot∥Timeline] → Debts(串行最后)
- Actor失败处理：跳过失败继续，不中断整个流程

**Research Findings**:
- `createAiSdkUiMessageStreamResponse` 接受 `AsyncIterable<RunStreamEvent>` — 可用async generator组合
- `RunItemStreamEvent`/`RunToolCallItem`/`RunToolOutputItem` 可构造 — 框架层面事件
- 嵌套run()事件不自动传播到父流 — 必须顶层组合
- `buildUiMessageStream` 将 `tool_called` → `tool-input-start`/`tool-input-available`，`tool_output` → `tool-output-available`
- Archivist是唯一写Agent — 按文件所有权划分无写冲突
- registry.ts 零测试覆盖 — 需先写特征测试
- **withTrace** 提供 OpenTelemetry 风格分布式追踪：`withTrace('name', fn, { metadata })` 创建 Trace + AsyncLocalStorage 上下文
- `run()` 自动调用 `getOrCreateTrace()` — 在 withTrace 内的所有 run() 共享同一 Trace，自动创建 AgentSpan/FunctionSpan/GenerationSpan
- `Trace.metadata` 传递到所有子 Span 的 `traceMetadata` → ProjectTraceExporter 可据此按 project 拆分日志
- `StreamedRunResult` 自动延迟 `trace.end()` 到流结束 — 流式场景无需特殊处理
- 官方 `deterministic.ts` + `parallelization.ts` 示例验证了顺序 run() + Promise.all 并行的模式
- `agent-logs`（prompt-logger）可被 `ProjectTraceExporter` 完全替代 — GenerationSpan 信息更完整
- `executionLog` 暂不替代 — 有 API 端点消费，数据模型与 Span 树不直接对应

### Metis Review
**Identified Gaps** (addressed):
- rawItem构造脆弱性 → 写验证测试覆盖，pin @openai/agents版本
- 并行写冲突 → 按文件所有权划分（scene→scenes/、characters→characters/...）
- 零测试覆盖 → Phase 0先写特征测试
- debts依赖其他结果 → 串行最后执行
- Actor失败 → 跳过继续

---

## Work Objectives

### Core Objective
将GM-LLM驱动的4阶段调度重构为代码驱动的Pipeline，并将单体Archivist拆分为6个并行子Agent，每个subAgent调用在UI上可见。

### Concrete Deliverables
- `src/lib/trace-exporter.ts` — ProjectTraceExporter（按 project 拆分的 JSONL 导出器）
- `src/lib/trace-setup.ts` — setupTracing() 全局注册函数
- `src/pipeline/call-agent.ts` — 3个辅助函数
- `src/pipeline/narrative-pipeline.ts` — Pipeline async generator（withTrace 包裹）
- `src/agents/archivist/factory.ts` — 6个子Agent工厂
- `src/prompts/archivist-sub.ts` — 6个子Prompt生成函数
- `src/tools/submit-schedule.ts` — submit_schedule工具
- 更新后的 `src/prompts/gm.ts` — 仅Orient+Script的GM Prompt
- 更新后的 `src/agents/registry.ts` — GM工具列表变更 + 移除 prompt-logger
- 更新后的 `src/app/api/narrative/route.ts` — 调用Pipeline + 移除 prompt-logger
- 更新后的 `src/components/chat/tool-meta.ts` — 新工具meta
- 更新后的 `src/session/types.ts` — AgentName扩展
- 标记 deprecated 的 `src/lib/prompt-logger.ts` — 由 ProjectTraceExporter 替代

### Definition of Done
- [ ] `bun run build` 成功
- [ ] `bun test` 全部通过
- [ ] 场景请求：UI显示 GM→Actor(s)→Scribe→Archivist 完整调度序列
- [ ] 非场景请求：GM文本正常输出，无子Agent调度
- [ ] Archivist子Agent按DAG执行：Characters门控→5个并行→Debts串行最后
- [ ] withTrace 包裹 Pipeline，agent-logs 按 project 拆分写入 .novel/.working/agent-logs.jsonl
- [ ] prompt-logger 的 callModelInputFilter 已从 registry.ts 和 route.ts 移除

### Must Have
- 每个subAgent调用在UI上显示为独立ToolTag
- 非场景请求零影响
- 交互记录（interaction-log）生命周期正确：Enact追加→Scribe读取→Archivist后清除
- Session复用：同角色在schedule中多次出场复用同一session
- 执行日志（ExecutionLog）持续记录
- Actor失败不中断Pipeline
- withTrace 包裹 Pipeline，metadata 含 projectId + storyDir
- ProjectTraceExporter 按 project 拆分写入 .novel/.working/agent-logs.jsonl

### Must NOT Have (Guardrails)
- 不修改 file-tools.ts / interaction-log.ts / build-story-context.ts
- 不修改 Actor/Scribe 的 Prompt
- 不实现 callAgentStreaming / mergeStreams / callAgentWithRetry（未来扩展）
- 不给Archivist子Agent增加单体Archivist没有的能力
- 不修改UI组件代码（tool-tag.tsx / message-item.tsx等），仅更新tool-meta数据
- 不修改store层（story-files.ts等）

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: YES (TDD)
- **Framework**: bun test
- **If TDD**: 每个任务先写测试再写实现

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 无依赖，全并行):
├── Task 1:  流事件构造验证测试           [quick]
├── Task 2:  ProjectTraceExporter + trace setup [quick]
├── Task 3:  callAgent/callAgentsParallel辅助函数 [unspecified-high]
├── Task 4:  submit_schedule工具           [quick]
├── Task 5:  Archivist子Agent工厂+子Prompt   [unspecified-high]
├── Task 6:  Session类型+tool-meta更新       [quick]

Wave 2 (Core — 依赖Wave 1):
├── Task 7:  GM Prompt重写               [unspecified-high]  (depends: 4, 6)
├── Task 8:  Pipeline async generator      [deep]              (depends: 1, 2, 3, 4, 5, 6)

Wave 3 (Integration — 依赖Wave 2):
├── Task 9:  API路由重构                  [unspecified-high]  (depends: 8)
├── Task 10: Registry清理（移除旧工具+prompt-logger） [quick]  (depends: 7, 9)

Wave 4 (Verification — 依赖Wave 3):
├── Task 11: 非场景请求集成测试             [unspecified-high]  (depends: 9)
├── Task 12: 场景请求端到端测试             [deep]              (depends: 9, 10)
├── Task 13: Archivist并行+DAG测试          [unspecified-high]  (depends: 9, 10)

Wave FINAL (Review — 依赖全部):
├── F1: Plan compliance audit              [oracle]
├── F2: Code quality review               [unspecified-high]
├── F3: Real QA execution                 [unspecified-high]
└── F4: Scope fidelity check              [deep]

Critical Path: Task 1 → Task 3 → Task 8 → Task 9 → Task 12 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | - | 3, 8 |
| 2 | - | 8 |
| 3 | 1 | 8 |
| 4 | - | 7, 8 |
| 5 | - | 8 |
| 6 | - | 7, 8 |
| 7 | 4, 6 | 10 |
| 8 | 1, 2, 3, 4, 5, 6 | 9 |
| 9 | 8 | 10, 11, 12, 13 |
| 10 | 7, 9 | 12, 13 |
| 11 | 9 | F1-F4 |
| 12 | 9, 10 | F1-F4 |
| 13 | 9, 10 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: **6** — T1→quick, T2→quick, T3→unspecified-high, T4→quick, T5→unspecified-high, T6→quick
- **Wave 2**: **2** — T7→unspecified-high, T8→deep
- **Wave 3**: **2** — T9→unspecified-high, T10→quick
- **Wave 4**: **3** — T11→unspecified-high, T12→deep, T13→unspecified-high
- **FINAL**: **4** — F1→oracle, F2→unspecified-high, F3→unspecified-high, F4→deep

---

## TODOs

- [x] 1. 流事件构造验证测试

  **What to do**:
  - 创建 `tests/unit/pipeline/event-construction.test.ts`
  - 验证 `new RunItemStreamEvent('tool_called', new RunToolCallItem(rawItem, agent))` 能正确构造事件
  - 验证 `new RunItemStreamEvent('tool_output', new RunToolOutputItem(rawItem, agent, output))` 能正确构造事件
  - 将构造的事件通过 `buildUiMessageStream`（从 `@openai/agents-extensions/ai-sdk-ui` 导入）转换，验证产生正确的 UIMessageChunk 类型（`tool-input-start`、`tool-input-available`、`tool-output-available`）
  - 验证 `toolName`、`toolCallId`、`input`（从 arguments 解析）、`output` 字段正确传递到 UIMessageChunk
  - 确定最小有效 rawItem schema（哪些字段是必须的，哪些可省略）

  **Must NOT do**:
  - 不修改任何源码文件
  - 不依赖 @openai/agents 内部未导出的类型

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 2, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `node_modules/@openai/agents-core/dist/events.d.ts` — RunItemStreamEvent, RunRawModelStreamEvent, RunAgentUpdatedStreamEvent 的类型定义
  - `node_modules/@openai/agents-core/dist/items.d.ts` — RunToolCallItem, RunToolOutputItem 构造函数签名
  - `node_modules/@openai/agents-extensions/dist/ai-sdk-ui/uiMessageStream.mjs` — buildUiMessageStream 函数，理解它如何从 RunStreamEvent 提取 toolName/callId/input/output

  **API/Type References**:
  - `node_modules/@openai/agents-core/dist/types/protocol.d.ts` — FunctionCallItem / FunctionCallResultItem 的字段定义（rawItem schema）

  **Test References**:
  - `tests/unit/store/story-files.test.ts` — 测试风格参考：真实文件系统、mkdtempSync、beforeAll/afterAll

  **WHY Each Reference Matters**:
  - events.d.ts: 确认事件类的公共构造函数签名
  - items.d.ts: 确认 RunToolCallItem(rawItem, agent) 的 rawItem 必须字段
  - uiMessageStream.mjs: 理解 extractToolInput 和 extractToolOutput 如何从 rawItem 提取 UI 所需字段
  - protocol.d.ts: 确定 FunctionCallItem 的最小有效字段集

  **Acceptance Criteria**:

  - [ ] `tests/unit/pipeline/event-construction.test.ts` 存在
  - [ ] `bun test tests/unit/pipeline/event-construction.test.ts` → PASS
  - [ ] 测试覆盖：tool_called 事件 → UIMessageChunk 包含 tool-input-start + tool-input-available
  - [ ] 测试覆盖：tool_output 事件 → UIMessageChunk 包含 tool-output-available
  - [ ] 测试覆盖：toolName、toolCallId、input、output 字段正确传递
  - [ ] 文档化最小有效 rawItem schema（在测试文件注释中记录）

  **QA Scenarios**:

  ```
  Scenario: tool_called 事件正确转换为 UI chunk
    Tool: Bash
    Steps:
      1. bun test tests/unit/pipeline/event-construction.test.ts
      2. 检查输出中 "tool-input-start" 相关断言通过
    Expected Result: 所有 tool_called → tool-input-start/tool-input-available 断言通过
    Evidence: .sisyphus/evidence/task-1-tool-called-chunk.txt

  Scenario: tool_output 事件正确转换为 UI chunk
    Tool: Bash
    Steps:
      1. bun test tests/unit/pipeline/event-construction.test.ts
      2. 检查输出中 "tool-output-available" 相关断言通过
    Expected Result: 所有 tool_output → tool-output-available 断言通过
    Evidence: .sisyphus/evidence/task-1-tool-output-chunk.txt

  Scenario: rawItem 缺少必要字段时测试失败
    Tool: Bash
    Steps:
      1. bun test tests/unit/pipeline/event-construction.test.ts
      2. 确认有测试验证最小字段集（缺少 callId 或 name 时应失败）
    Expected Result: 验证测试存在且通过，确认已知最小字段集
    Evidence: .sisyphus/evidence/task-1-minimal-schema.txt
  ```

  **Commit**: YES
  - Message: `test(pipeline): add stream event construction validation tests`
  - Files: `tests/unit/pipeline/event-construction.test.ts`
  - Pre-commit: `bun test tests/unit/pipeline/event-construction.test.ts`

- [x] 2. ProjectTraceExporter + trace setup

  **What to do**:
  - 创建 `src/lib/trace-exporter.ts` — 实现 `ProjectTraceExporter`（implements `TracingExporter`）
    - 从 `Trace.metadata` 中读取 `projectId` 和 `storyDir`
    - 将 Span 数据写入 `{storyDir}/.working/agent-logs.jsonl`，按 project 拆分
    - JSONL 格式：`{ timestamp, traceId, spanId, parentId, type: spanData.type, agent: spanData.name, model: spanData.model, usage: spanData.usage, input: spanData.input, output: spanData.output, duration: endedAt - startedAt }`
    - 对于 `AgentSpan`：记录 agent name, tools, handoffs
    - 对于 `GenerationSpan`：记录 model, usage (inputTokens, outputTokens), input/output 摘要
    - 对于 `FunctionSpan`：记录 tool name, input, output
    - Best-effort 写入，不阻塞 Agent 运行
  - 创建 `src/lib/trace-setup.ts` — 导出 `setupTracing()` 函数
    - **首先调用 `setTracingDisabled(false)` 覆盖 `src/lib/models.ts` 中的 `setTracingDisabled(true)`**
    - 注册 `BatchTraceProcessor` + `ProjectTraceExporter` 到全局
    - 在 Pipeline 入口处（`runScenePipeline`）调用，确保 trace 在 Pipeline 执行前启用
    - `addTraceProcessor(new BatchTraceProcessor(new ProjectTraceExporter()))`
  - 创建 `tests/unit/lib/trace-exporter.test.ts`
    - 测试 `ProjectTraceExporter.export()` 写入正确路径的 JSONL
    - 测试 `Trace.metadata` 中的 `storyDir` 被正确使用
    - 测试不同 project 的 trace 写入不同文件
    - 测试 JSONL 条目包含正确的 span 类型字段
  - 创建 `tests/unit/lib/trace-setup.test.ts`
    - 测试 `setupTracing()` 注册了 processor

  **Must NOT do**:
  - 不删除 `src/lib/prompt-logger.ts`（Task 10 统一处理）
  - 不修改现有 `callModelInputFilter` 调用
  - 不引入外部依赖（仅用 Node.js fs/path）
  - 不修改 `src/lib/models.ts` 中的 `setTracingDisabled(true)` 行（由 `setupTracing()` 在运行时覆盖）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/prompt-logger.ts` — 现有 agent-logs 的写入模式：appendFileSync + best-effort + JSONL 格式
  - `src/lib/models.ts:10` — **`setTracingDisabled(true)` 在模块加载时禁用 trace**，`setupTracing()` 必须调用 `setTracingDisabled(false)` 覆盖
  - `node_modules/@openai/agents-core/dist/tracing/processor.d.ts` — TracingExporter 接口 + BatchTraceProcessor

  **API/Type References**:
  - `node_modules/@openai/agents-core/dist/tracing/spans.d.ts` — SpanData 联合类型（AgentSpanData, GenerationSpanData, FunctionSpanData 等）
  - `node_modules/@openai/agents-core/dist/tracing/traces.d.ts` — Trace 类（metadata 字段）
  - `node_modules/@openai/agents-core/dist/tracing/index.d.ts` — `addTraceProcessor`, `setTraceProcessors` 导出

  **WHY Each Reference Matters**:
  - prompt-logger.ts: 新 Exporter 应遵循相同的 best-effort + JSONL 模式
  - TracingExporter 接口: 必须实现 `export(items: (Trace | Span)[])` 方法
  - SpanData 类型: 决定每种 Span 提取哪些字段写入 JSONL
  - Trace.metadata: 通过 `withTrace('name', fn, { metadata: { projectId, storyDir } })` 传入，Exporter 据此路由到正确的 project 目录

  **Acceptance Criteria**:

  - [ ] `src/lib/trace-exporter.ts` 存在并导出 `ProjectTraceExporter`
  - [ ] `src/lib/trace-setup.ts` 存在并导出 `setupTracing`
  - [ ] `setupTracing()` 调用 `setTracingDisabled(false)` 覆盖 models.ts 中的禁用
  - [ ] `tests/unit/lib/trace-exporter.test.ts` 存在
  - [ ] `bun test tests/unit/lib/trace-exporter.test.ts` → PASS
  - [ ] 不同 project 的 trace 写入不同的 JSONL 文件
  - [ ] AgentSpan / GenerationSpan / FunctionSpan 各自提取正确字段
  - [ ] 写入是 best-effort（不抛错）

  **QA Scenarios**:

  ```
  Scenario: 按 project 拆分日志文件
    Tool: Bash
    Steps:
      1. bun test tests/unit/lib/trace-exporter.test.ts
    Expected Result: project A 的 trace 写入 A/.novel/.working/agent-logs.jsonl，project B 写入 B 的
    Evidence: .sisyphus/evidence/task-2-project-split.txt

  Scenario: Span 数据格式正确
    Tool: Bash
    Steps:
      1. bun test tests/unit/lib/trace-exporter.test.ts
    Expected Result: GenerationSpan 包含 model + usage，FunctionSpan 包含 name + input + output
    Evidence: .sisyphus/evidence/task-2-span-format.txt
  ```

  **Commit**: YES
  - Message: `feat(tracing): add ProjectTraceExporter with per-project JSONL logging`
  - Files: `src/lib/trace-exporter.ts`, `src/lib/trace-setup.ts`, `tests/unit/lib/trace-exporter.test.ts`, `tests/unit/lib/trace-setup.test.ts`
  - Pre-commit: `bun test tests/unit/lib/trace-exporter.test.ts tests/unit/lib/trace-setup.test.ts`

- [x] 3. callAgent/callAgentsParallel/forwardRun 辅助函数

  **What to do**:
  - 创建 `src/pipeline/call-agent.ts`
  - 实现 `callAgent(config: AgentCallConfig): AgentCall` — 运行子Agent，返回 `{ events: AsyncGenerator<RunStreamEvent>, result: Promise<RunResult> }`
    - events generator: 先 yield RunItemStreamEvent('tool_called')，再 run(agent, input, runOptions) 非流式，最后 yield RunItemStreamEvent('tool_output')
    - 使用 Task 1 验证过的最小 rawItem schema 构造事件
    - toolCallId 使用 `crypto.randomUUID()` 生成
  - 实现 `callAgentsParallel(configs: AgentCallConfig[]): { events: AsyncGenerator<RunStreamEvent>, results: Promise<RunResult[]> }`
    - 先 yield 所有 tool_called 事件（UI同时显示所有并行调用的ToolTag）
    - 然后 Promise.all 并行执行
    - 按完成顺序 yield tool_output 事件
  - 实现 `forwardRun(stream: StreamedRunResult): AsyncGenerator<RunStreamEvent>` — 转发GM流的所有事件
  - 创建 `tests/unit/pipeline/call-agent.test.ts`
    - 测试 callAgent 产生正确的事件序列（tool_called → tool_output）
    - 测试 callAgentsParallel 产生正确的事件序列（N个tool_called → N个tool_output）
    - 测试 forwardRun 转发所有事件
    - 测试 result Promise 正确 resolve
  - 导出 `AgentCallConfig` 接口

  **Must NOT do**:
  - 不实现流式子Agent执行（callAgentStreaming）
  - 不实现 mergeStreams
  - 不依赖 @openai/agents 内部未导出 API

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1 (需要验证过的 rawItem schema)

  **References**:

  **Pattern References**:
  - `src/agents/registry.ts:62-123` — enact_sequence 的当前实现模式：session创建、run()调用、interactionLog追加、executionLog记录。callAgent 应封装类似的 run() + session 模式

  **API/Type References**:
  - `node_modules/@openai/agents-core/dist/events.d.ts` — RunItemStreamEvent 构造函数
  - `node_modules/@openai/agents-core/dist/items.d.ts` — RunToolCallItem, RunToolOutputItem 构造函数
  - `src/session/manager.ts` — createSubSession, getSubSession 接口
  - `src/session/types.ts` — AgentName 类型

  **Test References**:
  - `tests/unit/store/story-files.test.ts` — 测试风格参考

  **External References**:
  - `node_modules/@openai/agents-core/dist/result.d.ts` — StreamedRunResult 类型（forwardRun 的输入）

  **WHY Each Reference Matters**:
  - registry.ts: 理解当前 run() + session + log 模式，callAgent 应封装相同逻辑
  - events.d.ts + items.d.ts: 构造正确的 RunStreamEvent
  - manager.ts: callAgent 需要调用 createSubSession 管理子Agent会话

  **Acceptance Criteria**:

  - [ ] `src/pipeline/call-agent.ts` 存在并导出 callAgent, callAgentsParallel, forwardRun, AgentCallConfig
  - [ ] `tests/unit/pipeline/call-agent.test.ts` 存在
  - [ ] `bun test tests/unit/pipeline/call-agent.test.ts` → PASS
  - [ ] callAgent 产生 [tool_called, tool_output] 事件序列
  - [ ] callAgentsParallel 产生 [N个tool_called, N个tool_output] 事件序列
  - [ ] forwardRun 正确转发 StreamedRunResult 的所有事件
  - [ ] result/results Promise 正确 resolve 为 RunResult

  **QA Scenarios**:

  ```
  Scenario: callAgent 事件序列正确
    Tool: Bash
    Steps:
      1. bun test tests/unit/pipeline/call-agent.test.ts
      2. 验证 "callAgent yields tool_called then tool_output" 测试通过
    Expected Result: 事件序列为 [run_item_stream_event(tool_called), run_item_stream_event(tool_output)]
    Failure Indicators: 事件缺失、顺序错误、类型错误
    Evidence: .sisyphus/evidence/task-2-call-agent-events.txt

  Scenario: callAgentsParallel 并行执行且事件交织正确
    Tool: Bash
    Steps:
      1. bun test tests/unit/pipeline/call-agent.test.ts
      2. 验证 "callAgentsParallel yields all tool_called then all tool_output" 测试通过
    Expected Result: 先2个tool_called，然后2个tool_output
    Evidence: .sisyphus/evidence/task-2-parallel-events.txt

  Scenario: forwardRun 转发 GM 流事件
    Tool: Bash
    Steps:
      1. bun test tests/unit/pipeline/call-agent.test.ts
      2. 验证 "forwardRun forwards all events" 测试通过
    Expected Result: 转发的事件数量和内容与源流一致
    Evidence: .sisyphus/evidence/task-2-forward-run.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add callAgent, callAgentsParallel, forwardRun helpers`
  - Files: `src/pipeline/call-agent.ts`, `tests/unit/pipeline/call-agent.test.ts`
  - Pre-commit: `bun test tests/unit/pipeline/ && bun run build`

- [x] 4. submit_schedule 工具

  **What to do**:
  - 创建 `src/tools/submit-schedule.ts`
  - 实现 `submitScheduleTool`：替换 enact_sequence/call_scribe/call_archivist/clear_interaction_log
  - 参数 schema：
    ```typescript
    z.object({
      schedule: z.array(z.object({
        character: z.string().describe('角色名称'),
        direction: z.string().describe('场景指示'),
      })).min(1).max(10).describe('角色出场序列'),
      narrativeSummary: z.string().describe('场景叙事摘要（用户输入+场景剧本）'),
    })
    ```
  - execute 函数：仅返回确认信息，不执行调度（调度由Pipeline处理）
    ```typescript
    return toolResult(JSON.stringify({
      accepted: true,
      steps: input.schedule.length,
      message: `调度计划已提交（${input.schedule.length}步），系统将自动执行后续流程`,
    }));
    ```
  - 创建 `tests/unit/tools/submit-schedule.test.ts`
    - 测试参数验证（空schedule拒绝、超长schedule拒绝）
    - 测试正常输入返回 accepted: true

  **Must NOT do**:
  - 不在 execute 函数中执行任何调度逻辑
  - 不修改 registry.ts（Task 9 统一处理）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/agents/registry.ts:62-69` — enact_sequence 的参数 schema 定义模式（z.object + .describe()）
  - `src/agents/registry.ts:270-281` — clearInteractionLogTool 的简洁工具定义模式
  - `src/tools/file-tools.ts` — 工具定义和导出模式

  **API/Type References**:
  - `src/lib/tool-result.ts` — toolResult() / toolError() 辅助函数

  **Test References**:
  - `tests/unit/prompts/gm.test.ts` — 测试风格参考

  **WHY Each Reference Matters**:
  - registry.ts enact_sequence schema: submit_schedule 的 schedule 参数复用相同结构
  - tool-result.ts: 使用项目统一的工具返回值格式

  **Acceptance Criteria**:

  - [ ] `src/tools/submit-schedule.ts` 存在并导出 submitScheduleTool
  - [ ] `tests/unit/tools/submit-schedule.test.ts` 存在
  - [ ] `bun test tests/unit/tools/submit-schedule.test.ts` → PASS
  - [ ] 空schedule (length 0) 被拒绝
  - [ ] schedule > 10 被拒绝
  - [ ] 正常输入返回 `{ accepted: true, steps: N }`

  **QA Scenarios**:

  ```
  Scenario: 正常提交调度计划
    Tool: Bash
    Steps:
      1. bun test tests/unit/tools/submit-schedule.test.ts
    Expected Result: accepted=true, steps=3
    Evidence: .sisyphus/evidence/task-3-submit-ok.txt

  Scenario: 空schedule被拒绝
    Tool: Bash
    Steps:
      1. bun test tests/unit/tools/submit-schedule.test.ts
    Expected Result: 参数验证失败
    Evidence: .sisyphus/evidence/task-3-submit-empty.txt
  ```

  **Commit**: YES
  - Message: `feat(tools): add submit_schedule tool`
  - Files: `src/tools/submit-schedule.ts`, `tests/unit/tools/submit-schedule.test.ts`
  - Pre-commit: `bun test tests/unit/tools/submit-schedule.test.ts`

- [x] 5. Archivist 子Agent工厂 + 子Prompt

  **What to do**:
  - 创建 `src/agents/archivist/` 目录
  - 创建 `src/agents/archivist/factory.ts` — 6个子Agent工厂函数
    - `createCharactersAgent(storyDir)` — 工具: [readFileTool, writeFileTool, editFileTool, globFilesTool, resolveCharacterTool, listCharactersTool]
    - `createSceneAgent(storyDir)` — 工具: [readFileTool, editFileTool, globFilesTool]
    - `createWorldAgent(storyDir)` — 工具: [readFileTool, editFileTool, globFilesTool]
    - `createPlotAgent(storyDir)` — 工具: [readFileTool, editFileTool, globFilesTool]
    - `createTimelineAgent(storyDir)` — 工具: [readFileTool, editFileTool, globFilesTool]
    - `createDebtsAgent(storyDir)` — 工具: [readFileTool, editFileTool, globFilesTool]
  - 创建 `src/agents/archivist/types.ts` — ArchivistResponsibility 接口 + RESPONSIBILITIES 常量数组
  - 创建 `src/prompts/archivist-sub.ts` — `getArchivistSubPrompt(resp, state)` 生成函数
    - 公共部分：角色定义、输入格式、约束（只追加不删除、不创造新信息）、事实归属规则
    - 专职部分：每个子Agent的特定工作流步骤 + 目标文件格式规范
    - 从现有 `src/prompts/archivist.ts` 拆分，保持内容一致
  - 创建 `tests/unit/agents/archivist-factory.test.ts`
    - 测试每个工厂函数返回的 Agent 有正确的 name、tools、model
    - 测试 prompt 包含正确的职责描述和目标文件
  - 创建 `tests/unit/prompts/archivist-sub.test.ts`
    - 测试每个子Prompt包含正确的步骤指令
    - 测试公共约束部分存在

  **Must NOT do**:
  - 不删除现有 `src/agents/archivist.ts` 和 `src/prompts/archivist.ts`（Task 9 清理）
  - 不给子Agent增加单体Archivist没有的能力
  - 不修改 file-tools.ts 或 validation.ts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/agents/archivist.ts` — 当前单体 Archivist 定义（19行），子Agent 应遵循相同模式
  - `src/agents/actor.ts` — Agent 定义模式：model, instructions(async), tools
  - `src/prompts/archivist.ts` — 当前 Archivist prompt（150行），这是拆分源——步骤 a-j 和文件格式规范

  **API/Type References**:
  - `src/lib/models.ts` — getModel('archivist') 函数
  - `src/tools/file-tools.ts` — readFileTool, writeFileTool, editFileTool, globFilesTool 导出
  - `src/tools/character-tools.ts` — resolveCharacterTool, listCharactersTool 导出
  - `src/prompts/types.ts` — ArchivistPromptState 类型

  **Test References**:
  - `tests/unit/prompts/archivist.test.ts` — 如果存在，参考测试风格

  **WHY Each Reference Matters**:
  - archivist.ts: 子Agent定义应遵循相同的 model/instructions/tools 模式
  - archivist.ts prompt: 这是要拆分的内容——每个子Prompt从这150行中提取对应步骤
  - models.ts: 使用统一的 getModel() 获取模型配置

  **Acceptance Criteria**:

  - [ ] `src/agents/archivist/factory.ts` 存在并导出6个工厂函数
  - [ ] `src/agents/archivist/types.ts` 存在并导出 ArchivistResponsibility + RESPONSIBILITIES
  - [ ] `src/prompts/archivist-sub.ts` 存在并导出 getArchivistSubPrompt
  - [ ] `tests/unit/agents/archivist-factory.test.ts` 存在
  - [ ] `bun test tests/unit/agents/archivist-factory.test.ts` → PASS
  - [ ] 每个子Agent的 tools 数组正确（characters=6个工具，scene/world/plot/timeline/debts=3个工具）
  - [ ] 子Prompt包含公共约束 + 专职步骤

  **QA Scenarios**:

  ```
  Scenario: characters子Agent拥有正确工具集
    Tool: Bash
    Steps:
      1. bun test tests/unit/agents/archivist-factory.test.ts
      2. 验证 characters agent 有 6 个工具
    Expected Result: [readFileTool, writeFileTool, editFileTool, globFilesTool, resolveCharacterTool, listCharactersTool]
    Evidence: .sisyphus/evidence/task-4-characters-tools.txt

  Scenario: scene子Agent只有3个工具
    Tool: Bash
    Steps:
      1. bun test tests/unit/agents/archivist-factory.test.ts
    Expected Result: [readFileTool, editFileTool, globFilesTool]
    Evidence: .sisyphus/evidence/task-4-scene-tools.txt

  Scenario: 子Prompt包含公共约束
    Tool: Bash
    Steps:
      1. bun test tests/unit/prompts/archivist-sub.test.ts
    Expected Result: 每个子Prompt都包含"只追加不删除"和"不创造新信息"约束
    Evidence: .sisyphus/evidence/task-4-sub-prompts.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): add archivist sub-agent factory and prompts`
  - Files: `src/agents/archivist/factory.ts`, `src/agents/archivist/types.ts`, `src/prompts/archivist-sub.ts`, `tests/unit/agents/archivist-factory.test.ts`, `tests/unit/prompts/archivist-sub.test.ts`
  - Pre-commit: `bun test tests/unit/agents/archivist-factory.test.ts tests/unit/prompts/archivist-sub.test.ts`

- [x] 6. Session类型 + tool-meta 更新

  **What to do**:
  - 更新 `src/session/types.ts`：扩展 `AgentName` 类型为 `'Actor' | 'Scribe' | 'Archivist-Characters' | 'Archivist-Scene' | 'Archivist-World' | 'Archivist-Plot' | 'Archivist-Timeline' | 'Archivist-Debts'`
  - 更新 `src/components/chat/tool-meta.ts`：
    - 添加 submit_schedule 到 TOOL_STEP_MAP（step=0）
    - 添加 call_actor 到 TOOL_STEP_MAP（step=1）— 已存在，确认
    - 添加 call_scribe 到 TOOL_STEP_MAP（step=2）— 已存在，确认
    - 添加 call_archivist_characters/scene/world/plot/timeline/debts 到 TOOL_STEP_MAP（step=3）
    - 更新 AGENT_TOOLS 集合包含所有新工具名
    - 添加各 archivist 子工具的 ToolMeta 条目（agentKey='archivist', 各自的 icon/label/headlineParam）
    - 添加 submit_schedule 的 ToolMeta 条目
  - 创建/更新测试验证新类型和meta正确

  **Must NOT do**:
  - 不修改 UI 组件代码（tool-tag.tsx, message-item.tsx 等）
  - 不改变现有 ToolMeta 的 color/icon

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/components/chat/tool-meta.ts:1-41` — 现有 TOOL_STEP_MAP / AGENT_TOOLS / AGENT_COLORS / AGENT_NAMES 结构
  - `src/components/chat/tool-meta.ts:43-149` — 现有 TOOL_META_MAP 条目格式

  **API/Type References**:
  - `src/session/types.ts:4` — 当前 AgentName = 'Actor' | 'Scribe' | 'Archivist'

  **WHY Each Reference Matters**:
  - tool-meta.ts: 必须遵循完全相同的结构添加新条目
  - types.ts: AgentName 扩展影响 SubSessionEntry 和 createSubSession

  **Acceptance Criteria**:

  - [ ] AgentName 类型包含所有8个值
  - [ ] TOOL_STEP_MAP 包含 submit_schedule(0), call_actor(1), call_scribe(2), call_archivist_*(3)
  - [ ] AGENT_TOOLS 包含所有新工具名
  - [ ] TOOL_META_MAP 包含 submit_schedule 和6个 archivist 子工具的 meta
  - [ ] `bun run build` 成功（类型检查通过）

  **QA Scenarios**:

  ```
  Scenario: AgentName类型扩展正确
    Tool: Bash
    Steps:
      1. bun run build
    Expected Result: 构建成功，无类型错误
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: TOOL_STEP_MAP包含所有新工具
    Tool: Bash
    Steps:
      1. bun test tests/unit/chat/tool-meta.test.ts (如存在) 或 bun run build
    Expected Result: 所有新工具名在 TOOL_STEP_MAP 中有映射
    Evidence: .sisyphus/evidence/task-5-step-map.txt
  ```

  **Commit**: YES
  - Message: `refactor(types): extend AgentName and tool-meta for pipeline architecture`
  - Files: `src/session/types.ts`, `src/components/chat/tool-meta.ts`
  - Pre-commit: `bun run build`

- [x] 7. GM Prompt 重写

  **What to do**:
  - 重写 `src/prompts/gm.ts`：
    - 保留 Phase 0（Orient）和 Phase 1（Script）
    - 移除 Phase 2（Enact）和 Phase 3（Resolve）的描述
    - 新增 `submit_schedule` 工具说明
    - 移除 enact_sequence/call_actor/call_scribe/call_archivist/clear_interaction_log 的工具说明
    - Phase 2 改为：编写初始剧本 → 调用 `submit_schedule` 提交调度计划 + 叙事摘要
    - 明确说明：GM只负责Orient+Script，后续流程自动执行
    - 保留约束、错误处理、输出规范等通用部分
  - 更新 `tests/unit/prompts/gm.test.ts`（如存在）或创建新测试
    - 验证 prompt 不包含已移除工具的名称
    - 验证 prompt 包含 submit_schedule 的说明
    - 验证 prompt 说明GM只做Orient+Script

  **Must NOT do**:
  - 不修改 Actor/Scribe 的 Prompt
  - 不优化 Prompt 文学质量（仅功能重写）
  - 不修改 registry.ts（Task 9 统一处理）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Task 7)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 4 (submit_schedule schema), 6 (tool-meta)

  **References**:

  **Pattern References**:
  - `src/prompts/gm.ts` — 当前完整GM Prompt（197行），这是要重写的文件
  - `src/prompts/gm.ts:99-154` — Phase 2(Enact) 和 Phase 3(Resolve) 部分，这些要移除

  **API/Type References**:
  - `src/tools/submit-schedule.ts` — submit_schedule 的参数schema（schedule + narrativeSummary）

  **WHY Each Reference Matters**:
  - gm.ts: 这是重写目标，保留Orient+Script，替换Enact+Resolve为submit_schedule
  - submit-schedule.ts: Prompt需要准确描述submit_schedule的参数和用法

  **Acceptance Criteria**:

  - [ ] `src/prompts/gm.ts` 不包含 "enact_sequence"、"call_scribe"、"call_archivist"、"call_actor"、"clear_interaction_log" 字样
  - [ ] `src/prompts/gm.ts` 包含 "submit_schedule" 的说明
  - [ ] Prompt 明确说明 GM 只负责 Orient + Script
  - [ ] `bun run build` 成功

  **QA Scenarios**:

  ```
  Scenario: Prompt不包含已移除工具
    Tool: Bash
    Steps:
      1. grep -c "enact_sequence\|call_scribe\|call_archivist\|call_actor\|clear_interaction_log" src/prompts/gm.ts
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-6-no-old-tools.txt

  Scenario: Prompt包含submit_schedule
    Tool: Bash
    Steps:
      1. grep -c "submit_schedule" src/prompts/gm.ts
    Expected Result: >= 1 match
    Evidence: .sisyphus/evidence/task-6-submit-schedule.txt
  ```

  **Commit**: YES
  - Message: `refactor(prompts): rewrite GM prompt for pipeline architecture`
  - Files: `src/prompts/gm.ts`, `tests/unit/prompts/gm.test.ts` (如创建)
  - Pre-commit: `bun run build`

- [x] 8. Pipeline async generator

  **What to do**:
  - 创建 `src/pipeline/narrative-pipeline.ts`
  - 实现 `runScenePipeline(input, context, gmSession): Response`
    - 内部 async function* stream() generator:
      1. **`withTrace('Scene Pipeline', async (trace) => { ... }, { metadata: { projectId, storyDir } })`** 包裹整个 Pipeline
         - metadata 传递 projectId + storyDir → ProjectTraceExporter 据此按 project 拆分日志
         - 内部所有 `run()` 调用自动继承 trace 上下文，创建子 Span（AgentSpan/FunctionSpan/GenerationSpan）
      2. Phase 1: `yield* forwardRun(gmStream)` — 完整转发GM流
      3. 等待 `gmStream.completed`，从结果中提取 schedule 和 narrativeSummary
      4. 如果无 schedule → return（非场景请求）
      5. Phase 2: 清除 interactionLog → 依次 callAgent(actorAgent) → appendInteractionLog
         - 同角色复用 session（sessionCache Map）
         - Actor 失败：跳过该步，记录错误，继续剩余
      6. Phase 3: callAgent(scribeAgent) → 获取 literaryText
      7. Phase 4a: callAgent(charactersAgent) → 等待完成（门控）
      8. Phase 4b: callAgentsParallel([scene, world, plot, timeline]) → 等待完成
      9. Phase 4c: callAgent(debtsAgent) → 等待完成（串行最后）
      10. 清除 interactionLog
    - 返回 `createAiSdkUiMessageStreamResponse(stream())`
  - 实现 `extractScheduleFromResult(gmResult)` — 从 newItems 中找 submit_schedule tool call，解析参数
  - 实现 `extractScheduleMeta(gmResult)` — 提取 narrativeSummary
  - 创建 `tests/unit/pipeline/narrative-pipeline.test.ts`
    - 测试 schedule 提取逻辑
    - 测试非场景请求（无schedule → generator直接结束）
    - 测试事件顺序（GM事件 → Actor事件 → Scribe事件 → Archivist事件）
    - 测试 Actor 失败不中断（模拟失败 → 后续Actor继续）
    - 测试 Archivist DAG（characters在前 → 并行 → debts在后）
    - 测试 withTrace 包裹后 trace 上下文正确传播

  **Must NOT do**:
  - 不在 pipeline 中修改任何 store 层逻辑
  - 不实现流式子Agent执行

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (with Task 6 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2, 3, 4, 5, 6

  **References**:

  **Pattern References**:
  - `src/agents/registry.ts:62-123` — enact_sequence 的完整逻辑：clearLog → for循环run → appendLog → sessionCache
  - `src/agents/registry.ts:177-220` — call_scribe 逻辑
  - `src/agents/registry.ts:222-268` — call_archivist 逻辑
  - `src/app/api/narrative/route.ts:65-75` — 当前 run(gmAgent) + createAiSdkUiMessageStreamResponse 模式

  **API/Type References**:
  - `src/pipeline/call-agent.ts` — callAgent, callAgentsParallel, forwardRun (Task 3)
  - `src/agents/archivist/factory.ts` — createXxxAgent 工厂函数 (Task 5)
  - `src/tools/submit-schedule.ts` — submit_schedule schema (Task 4)
  - `src/store/interaction-log.ts` — appendInteractionLog, clearInteractionLog
  - `src/session/manager.ts` — createSubSession, addExecutionLog
  - `src/lib/trace-setup.ts` — setupTracing() (Task 2)
  - `@openai/agents` — withTrace, getCurrentTrace (用于包裹 Pipeline + trace 上下文传播)

  **WHY Each Reference Matters**:
  - registry.ts enact_sequence: Pipeline的Enact阶段复用完全相同的逻辑
  - route.ts: Pipeline替换的就是这个run()→streamResponse的流程
  - call-agent.ts: Pipeline的核心调度通过 callAgent/callAgentsParallel 完成

  **Acceptance Criteria**:

  - [ ] `src/pipeline/narrative-pipeline.ts` 存在并导出 runScenePipeline
  - [ ] `tests/unit/pipeline/narrative-pipeline.test.ts` 存在
  - [ ] `bun test tests/unit/pipeline/narrative-pipeline.test.ts` → PASS
  - [ ] 非场景请求：无schedule时generator结束，不产生子Agent事件
  - [ ] 场景请求：事件顺序为 GM → Actor(s) → Scribe → Archivist-Characters → [Scene∥World∥Plot∥Timeline] → Debts
  - [ ] Actor失败：跳过失败步骤，后续继续
  - [ ] Session复用：同角色多次出场使用同一session
  - [ ] withTrace 包裹整个 Pipeline，metadata 包含 projectId + storyDir
  - [ ] `bun run build` 成功

  **QA Scenarios**:

  ```
  Scenario: 完整场景请求事件流
    Tool: Bash
    Steps:
      1. bun test tests/unit/pipeline/narrative-pipeline.test.ts
      2. 验证事件顺序测试通过
    Expected Result: 事件序列中 GM事件在前，然后Actor，然后Scribe，然后Archivist
    Evidence: .sisyphus/evidence/task-7-full-pipeline.txt

  Scenario: 非场景请求透传
    Tool: Bash
    Steps:
      1. bun test tests/unit/pipeline/narrative-pipeline.test.ts
      2. 验证 "no schedule" 测试通过
    Expected Result: generator只yield GM事件，然后结束
    Evidence: .sisyphus/evidence/task-7-no-schedule.txt

  Scenario: Actor失败不中断
    Tool: Bash
    Steps:
      1. bun test tests/unit/pipeline/narrative-pipeline.test.ts
      2. 验证 "actor failure" 测试通过
    Expected Result: 失败Actor被跳过，后续Actor继续，Scribe仍然运行
    Evidence: .sisyphus/evidence/task-7-actor-failure.txt
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add narrative pipeline async generator`
  - Files: `src/pipeline/narrative-pipeline.ts`, `tests/unit/pipeline/narrative-pipeline.test.ts`
  - Pre-commit: `bun test tests/unit/pipeline/ && bun run build`

- [x] 9. API 路由重构

  **What to do**:
  - 修改 `src/app/api/narrative/route.ts`：
    - 导入 `runScenePipeline` 替代 `run` + `createAiSdkUiMessageStreamResponse`
    - POST handler 中：将 `run(gmAgent, input, {stream:true, ...})` + `createAiSdkUiMessageStreamResponse(stream)` 替换为 `return runScenePipeline(input, {storyDir, projectId, projectDir}, storySession.gmSession)`
    - 保留所有现有的项目验证、session管理、错误处理、信号处理逻辑
    - 保留 GET 和 PUT handler 不变
  - 确保错误处理覆盖：Pipeline内部错误 → 返回500 + 结构化错误消息

  **Must NOT do**:
  - 不修改 GET/PUT handler
  - 不修改 session 管理逻辑
  - 不修改 chat-history 逻辑

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Task 9)
  - **Blocks**: Tasks 10, 11, 12, 13
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `src/app/api/narrative/route.ts` — 当前完整API路由（129行），这是要修改的文件
  - `src/app/api/narrative/route.ts:65-75` — 当前 run() + streamResponse 模式，替换目标

  **API/Type References**:
  - `src/pipeline/narrative-pipeline.ts` — runScenePipeline 函数签名 (Task 8)

  **WHY Each Reference Matters**:
  - route.ts: 这是Pipeline的入口点，必须保留现有的验证/错误处理/信号逻辑

  **Acceptance Criteria**:

  - [ ] `src/app/api/narrative/route.ts` 使用 runScenePipeline 替代 run() + createAiSdkUiMessageStreamResponse
  - [ ] GET/PUT handler 不变
  - [ ] 项目验证逻辑不变
  - [ ] 错误处理（Missing OPENAI_API_KEY、Missing projectId、Project not found）不变
  - [ ] Abort signal 正确传递到 Pipeline
  - [ ] `bun run build` 成功

  **QA Scenarios**:

  ```
  Scenario: API路由构建成功
    Tool: Bash
    Steps:
      1. bun run build
    Expected Result: 构建成功，无类型错误
    Evidence: .sisyphus/evidence/task-8-build.txt

  Scenario: 路由仍导出 POST/GET/PUT
    Tool: Bash
    Steps:
      1. grep "export async function POST\|export async function GET\|export async function PUT" src/app/api/narrative/route.ts
    Expected Result: 3个handler都存在
    Evidence: .sisyphus/evidence/task-8-handlers.txt
  ```

  **Commit**: YES
  - Message: `refactor(api): use pipeline in narrative route`
  - Files: `src/app/api/narrative/route.ts`
  - Pre-commit: `bun run build`

- [x] 10. Registry 清理（移除旧工具 + prompt-logger）

  **What to do**:
  - 修改 `src/agents/registry.ts`：
    - 移除 enactSequenceTool 定义（行62-123）
    - 移除 callActorTool 定义（行125-175）
    - 移除 callScribeTool 定义（行177-220）
    - 移除 callArchivistTool 定义（行222-268）
    - 移除 clearInteractionLogTool 定义（行270-281）
    - **移除 `createPromptLogFilter` 导入和所有 `callModelInputFilter` 属性**（由 Task 2 的 ProjectTraceExporter 替代）
    - 导入 submitScheduleTool（从 src/tools/submit-schedule.ts）
    - 更新 GM 工具列表：`gmAgent.tools = [submitScheduleTool, readFileTool, writeFileTool, globFilesTool]`
    - 移除不再需要的导入（appendInteractionLog, clearInteractionLog 等——如果pipeline不通过registry使用的话）
    - 保留 AgentRunContext 接口和辅助函数（getRunContext, extractToolCalls, buildExecutionLog）— Pipeline 使用
  - 修改 `src/app/api/narrative/route.ts`：
    - **移除 `createPromptLogFilter` 导入和 `callModelInputFilter` 属性**（由 Task 2 的 ProjectTraceExporter 替代）
  - 标记 `src/lib/prompt-logger.ts` 为 `@deprecated`（添加注释：由 ProjectTraceExporter 替代，将在下个版本删除）
  - 保留 `src/agents/archivist.ts` 和 `src/prompts/archivist.ts`（可能用于非Pipeline路径或降级），添加 `@deprecated` 注释
  - 运行 `bun run build` 确认无类型错误
  - 运行 `bun test` 确认所有现有测试仍通过

  **Must NOT do**:
  - 不删除 `src/agents/archivist.ts`（标记deprecated即可）
  - 不删除 `src/lib/prompt-logger.ts`（标记deprecated即可，下个版本再删除）
  - 不删除辅助函数（getRunContext, buildExecutionLog 等）
  - 不修改 src/agents/gm.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 8)
  - **Blocks**: Tasks 12, 13
  - **Blocked By**: Tasks 7 (GM prompt), 9 (API route)

  **References**:

  **Pattern References**:
  - `src/agents/registry.ts` — 当前完整文件（287行），这是要清理的文件

  **API/Type References**:
  - `src/tools/submit-schedule.ts` — submitScheduleTool 导入源 (Task 3)

  **WHY Each Reference Matters**:
  - registry.ts: 移除5个旧工具定义，替换为submit_schedule，更新GM工具列表

  **Acceptance Criteria**:

  - [ ] registry.ts 不包含 enactSequenceTool, callActorTool, callScribeTool, callArchivistTool, clearInteractionLogTool
  - [ ] registry.ts 不包含 `createPromptLogFilter` 导入和 `callModelInputFilter` 属性
  - [ ] route.ts 不包含 `createPromptLogFilter` 导入和 `callModelInputFilter` 属性
  - [ ] GM 工具列表为 [submitScheduleTool, readFileTool, writeFileTool, globFilesTool]
  - [ ] AgentRunContext, getRunContext, buildExecutionLog 保留（Pipeline使用）
  - [ ] `src/lib/prompt-logger.ts` 标记为 `@deprecated`
  - [ ] `bun run build` 成功
  - [ ] `bun test` 通过

  **QA Scenarios**:

  ```
  Scenario: 旧工具已移除
    Tool: Bash
    Steps:
      1. grep -c "enactSequenceTool\|callActorTool\|callScribeTool\|callArchivistTool\|clearInteractionLogTool" src/agents/registry.ts
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-10-old-tools-removed.txt

  Scenario: prompt-logger 已从 registry 和 route 移除
    Tool: Bash
    Steps:
      1. grep -c "createPromptLogFilter\|callModelInputFilter" src/agents/registry.ts src/app/api/narrative/route.ts
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-10-prompt-logger-removed.txt

  Scenario: 构建和测试通过
    Tool: Bash
    Steps:
      1. bun run build && bun test
    Expected Result: 成功
    Evidence: .sisyphus/evidence/task-10-build-test.txt
  ```

  **Commit**: YES
  - Message: `refactor(agents): remove old GM orchestration tools, use submit_schedule`
  - Files: `src/agents/registry.ts`
  - Pre-commit: `bun run build && bun test`

- [ ] 11. 非场景请求集成测试

  **What to do**:
  - 创建 `tests/integration/pipeline-nonscene.test.ts`
  - 测试场景：
    - GM 回答 OOC 问题（不调用 submit_schedule）→ Pipeline 仅转发 GM 输出
    - GM 读取文件回答用户问题 → Pipeline 仅转发 GM 输出
    - GM 回忆/问询指令 → Pipeline 仅转发 GM 输出
  - 验证：
    - 事件流中只有 GM 的事件，无子Agent事件
    - `createAiSdkUiMessageStreamResponse` 正常工作
    - UI chunk 中只有 GM 的文本，无 tool-called/tool-output
  - 验证 withTrace 在非场景请求下仍正常记录 GM 的 AgentSpan/GenerationSpan

  **Must NOT do**:
  - 不修改任何源码
  - 不使用 mock（遵循项目测试约定）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 13)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `tests/integration/e2e.test.ts` — 现有集成测试模式

  **WHY Each Reference Matters**:
  - e2e.test.ts: 遵循项目集成测试风格

  **Acceptance Criteria**:

  - [ ] `tests/integration/pipeline-nonscene.test.ts` 存在
  - [ ] `bun test tests/integration/pipeline-nonscene.test.ts` → PASS
  - [ ] 无 submit_schedule 调用时，Pipeline 不产生子Agent事件
  - [ ] 事件流中仅有 GM 的 text 输出和 model 事件，无 tool-called/tool-output
  - [ ] withTrace 在非场景请求下仍记录 GM 的 Span 数据到 .novel/.working/agent-logs.jsonl

  **QA Scenarios**:

  ```
  Scenario: 非场景请求不触发Pipeline子Agent
    Tool: Bash
    Steps:
      1. bun test tests/integration/pipeline-nonscene.test.ts
    Expected Result: 通过，确认仅GM事件，无子Agent事件
    Evidence: .sisyphus/evidence/task-11-nonscene.txt

  Scenario: 非场景请求仍写入trace日志
    Tool: Bash
    Steps:
      1. bun test tests/integration/pipeline-nonscene.test.ts
    Expected Result: withTrace 记录了 GM 的 AgentSpan + GenerationSpan
    Evidence: .sisyphus/evidence/task-11-nonscene-trace.txt
  ```

  **Commit**: YES
  - Message: `test(pipeline): add non-scene request integration tests`
  - Files: `tests/integration/pipeline-nonscene.test.ts`
  - Pre-commit: `bun test tests/integration/pipeline-nonscene.test.ts`

- [ ] 12. 场景请求端到端测试

  **What to do**:
  - 创建 `tests/integration/pipeline-scene.test.ts`
  - 测试场景：
    - 完整场景请求：GM → submit_schedule → Enact(2角色3步) → Scribe → Archivist
    - 验证事件流顺序
    - 验证 interactionLog 正确追加和清除
    - 验证 session 创建和复用
    - 验证 executionLog 记录
    - 验证文学文本在 Scribe 步骤后产出
  - 测试 Actor 失败场景：
    - schedule中第2个Actor失败 → 跳过 → 第3个继续 → Scribe用部分交互记录
  - 验证 withTrace 在场景请求下记录完整 Span 树（GM AgentSpan → Actor AgentSpan → FunctionSpan 等）

  **Must NOT do**:
  - 不修改任何源码
  - 不使用 mock

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 13)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 9, 10

  **References**:

  **Pattern References**:
  - `tests/integration/e2e.test.ts` — 现有集成测试模式
  - `src/agents/registry.ts` — 理解 enact_sequence 的原始行为用于对比验证

  **WHY Each Reference Matters**:
  - e2e.test.ts: 遵循项目集成测试风格

  **Acceptance Criteria**:

  - [ ] `tests/integration/pipeline-scene.test.ts` 存在
  - [ ] `bun test tests/integration/pipeline-scene.test.ts` → PASS
  - [ ] 事件流顺序正确：GM → Actor(s) → Scribe → Archivist(s)
  - [ ] interactionLog 在 Enact 追加，在 Archivist 后清除
  - [ ] Actor 失败场景通过
  - [ ] withTrace 记录完整的 Span 树到 .novel/.working/agent-logs.jsonl

  **QA Scenarios**:

  ```
  Scenario: 完整场景Pipeline
    Tool: Bash
    Steps:
      1. bun test tests/integration/pipeline-scene.test.ts
    Expected Result: 通过，完整事件流验证通过
    Evidence: .sisyphus/evidence/task-12-scene-e2e.txt

  Scenario: Actor失败恢复
    Tool: Bash
    Steps:
      1. bun test tests/integration/pipeline-scene.test.ts
    Expected Result: Actor失败测试通过，后续步骤继续
    Evidence: .sisyphus/evidence/task-12-actor-failure.txt
  ```

  **Commit**: YES
  - Message: `test(pipeline): add scene request end-to-end integration tests`
  - Files: `tests/integration/pipeline-scene.test.ts`
  - Pre-commit: `bun test tests/integration/pipeline-scene.test.ts`

- [ ] 13. Archivist 并行 + DAG 测试

  **What to do**:
  - 创建 `tests/integration/pipeline-archivist.test.ts`
  - 测试场景：
    - Archivist DAG 执行顺序：Characters → [Scene∥World∥Plot∥Timeline] → Debts
    - 验证 Characters 先完成，Debts 最后完成
    - 验证 Scene/World/Plot/Timeline 确实并行执行（通过事件时序或执行时间判断）
    - 验证文件所有权：每个子Agent只操作自己的目标文件
    - 验证无写冲突：所有文件最终状态正确
  - 测试边界场景：
    - Characters 子Agent未发现新角色 → 并行子Agent仍然运行
    - 单个子Agent失败 → 其他子Agent不受影响

  **Must NOT do**:
  - 不修改任何源码
  - 不使用 mock

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 12)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 9, 10

  **References**:

  **Pattern References**:
  - `tests/integration/e2e.test.ts` — 现有集成测试模式

  **WHY Each Reference Matters**:
  - e2e.test.ts: 遵循项目集成测试风格

  **Acceptance Criteria**:

  - [ ] `tests/integration/pipeline-archivist.test.ts` 存在
  - [ ] `bun test tests/integration/pipeline-archivist.test.ts` → PASS
  - [ ] DAG 执行顺序验证通过
  - [ ] 文件所有权验证通过
  - [ ] 子Agent失败隔离验证通过

  **QA Scenarios**:

  ```
  Scenario: Archivist DAG执行顺序正确
    Tool: Bash
    Steps:
      1. bun test tests/integration/pipeline-archivist.test.ts
    Expected Result: Characters先于并行组，Debts最后
    Evidence: .sisyphus/evidence/task-12-dag-order.txt

  Scenario: 子Agent失败隔离
    Tool: Bash
    Steps:
      1. bun test tests/integration/pipeline-archivist.test.ts
    Expected Result: 一个子Agent失败不影响其他
    Evidence: .sisyphus/evidence/task-12-isolation.txt
  ```

  **Commit**: YES
  - Message: `test(pipeline): add archivist parallel and DAG integration tests`
  - Files: `tests/integration/pipeline-archivist.test.ts`
  - Pre-commit: `bun test tests/integration/pipeline-archivist.test.ts`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `bun run lint` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real QA Execution** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `test(pipeline): add stream event construction validation tests` — tests/
- **Wave 1**: `feat(tracing): add ProjectTraceExporter with per-project JSONL logging` — src/lib/trace-*.ts, tests/
- **Wave 1**: `feat(pipeline): add callAgent, callAgentsParallel, forwardRun helpers` — src/pipeline/call-agent.ts, tests/
- **Wave 1**: `feat(tools): add submit_schedule tool` — src/tools/submit-schedule.ts, tests/
- **Wave 1**: `feat(agents): add archivist sub-agent factory and prompts` — src/agents/archivist/, src/prompts/archivist-sub.ts, tests/
- **Wave 2**: `refactor(prompts): rewrite GM prompt for pipeline architecture` — src/prompts/gm.ts
- **Wave 2**: `feat(pipeline): add narrative pipeline async generator with withTrace` — src/pipeline/narrative-pipeline.ts, tests/
- **Wave 3**: `refactor(api): use pipeline in narrative route` — src/app/api/narrative/route.ts
- **Wave 3**: `refactor(agents): remove old GM tools and prompt-logger` — src/agents/registry.ts, src/lib/prompt-logger.ts
- **Wave 4**: test commits

---

## Success Criteria

### Verification Commands
```bash
bun run build          # Expected: success
bun test               # Expected: all pass
bun run lint           # Expected: no errors
```

### Final Checklist
- [ ] 场景请求：UI显示完整调度序列（GM→Actor(s)→Scribe→Archivist(s)）
- [ ] 非场景请求：GM文本正常输出，无子Agent调度
- [ ] Archivist按DAG执行：Characters→[Scene∥World∥Plot∥Timeline]→Debts
- [ ] Actor失败不中断Pipeline
- [ ] 交互记录生命周期正确
- [ ] Session复用正确
- [ ] 执行日志持续记录
- [ ] 无file-tools/interaction-log/build-story-context修改
- [ ] withTrace 包裹 Pipeline，所有 run() 共享同一 Trace
- [ ] agent-logs 按 project 拆分写入 .novel/.working/agent-logs.jsonl
- [ ] prompt-logger callModelInputFilter 已从 registry.ts 和 route.ts 移除
