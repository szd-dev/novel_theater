# 架构对比：Pipeline vs LangGraph vs Plan+Executor

> 日期：2026-04-30
> 背景：整体调度重构方案设计过程中的发散思考

## 一、当前架构 vs LangGraph

### 1.1 趋同点

当前 Pipeline 设计与 LangGraph 在解决同一类问题（多 Agent 编排 + 流式输出），核心抽象都是"节点 + 有向边 + 状态传递"。具体对应：

| 当前设计 | LangGraph 等价物 |
|---------|----------------|
| `narrative-pipeline.ts` 中的 async generator | `StateGraph` 编译后的执行流 |
| `callAgent()` / `callAgentsParallel()` | 节点 + 多出边（并行扇出） |
| `forwardRun(gmStream)` | `add_edge(START, "gm")` |
| Archivist DAG: characters 门控 → 并行 → debts | `add_conditional_edges` + `Send` API |
| `RunStreamEvent` 构造 + `createAiSdkUiMessageStreamResponse` | `stream_mode=["updates","messages"]` |
| interaction-log 文件 | 共享 State + reducer (`operator.add`) |
| sessionCache Map | Per-thread subgraph + checkpointing |

### 1.2 核心差异

| 维度 | LangGraph | 当前设计 |
|------|-----------|---------|
| **拓扑声明** | 编译时静态——`compile()` 后图结构不可变 | 运行时动态——async generator 里写 if/else |
| **状态模型** | 共享 TypedState + reducer，自动合并并发写 | 纯函数式：state→string（prompt），文件系统是 state store |
| **持久化** | 内建 checkpointing（每 superstep 自动存档）+ 时间旅行调试 | 文件系统（`.novel/` markdown），人工可读但无自动 checkpoint |
| **HITL** | `interrupt()` 一等公民，可在任意位置暂停/恢复 | 无内建支持 |
| **流式输出** | 7 种模式，结构化 StreamPart | 单一组合流（async generator） |
| **错误处理** | 节点级重试，graph halt on error | callAgent 级别 try/catch，跳过失败继续 |
| **部署** | LangGraph Platform（托管长运行 agent） | Next.js API route（请求级） |
| **依赖** | LangChain 生态（LangSmith, LangGraph Cloud） | 仅 `@openai/agents` + `ai` SDK |

### 1.3 各自优劣

**LangGraph 强于**：

- **可观测性**：图可视化 + LangSmith tracing + 时间旅行调试
- **持久化**：自动 checkpointing，崩溃恢复，状态回滚
- **人机协作**：`interrupt()` 是生产级方案，暂停/恢复/修改状态一条龙
- **动态扇出**：`Send` API 支持运行时决定并行数量（比如"为每个角色创建一个 Actor 节点"）

**当前设计强于**：

- **简单性**：无 Pregel/channel/reducer 概念，async generator 是 JS 原语
- **灵活性**：运行时可以随意 if/else，不需要在编译时声明所有路径
- **与现有架构契合**：`@openai/agents` 的 `run()` + `Session` + `tool()` 原生模式
- **文件系统即状态**：`.novel/` markdown 天然人类可读、git 友好、可手动编辑
- **无生态绑定**：不依赖 LangChain，不受其 API 稳定性声誉影响

### 1.4 LangGraph 的已知痛点

1. **静态图拓扑**——`compile()` 后不能动态加/删节点，`Send` 只能扇出到预声明节点
2. **Unknown unknowns**——未预见的条件没有对应的条件边，agent 被"框住"
3. **并发写冲突**——无 reducer 的 key，两个节点同 superstep 写入会抛 `InvalidUpdateError`
4. **interrupt 陷阱**——resume 时节点从头重执行，interrupt 前的副作用必须幂等
5. **Per-thread 子图不能并行调用**——checkpoint namespace 冲突
6. **无限循环烧 token**——agent 可能循环到 recursion limit 才停，无内建消费控制
7. **节点跳转延迟**——每个节点转换有开销，5+ agent 链可能 10+ 秒响应时间
8. **LangChain 耦合**——生态强绑 LangSmith，LangGraph Plus 定价按节点计费

### 1.5 结论

**趋同是必然的**——多 Agent 编排的本质问题就是"节点 + 边 + 状态"。差异在于抽象层级：LangGraph 从图论出发（Pregel superstep、typed channel），我们从 JS 原语出发（async generator、yield*）。

**当前不需要迁移到 LangGraph**，原因：

1. 流程固定（场景请求 = GM→Actor→Scribe→Archivist），LangGraph 的动态图编排优势无法发挥
2. 引入 LangGraph 意味着引入整个 LangChain 生态的复杂度
3. `@openai/agents` 的 `asTool()` + `Session` 已满足需求
4. 文件系统 state 比LangGraph 的 checkpointing 更适合叙事场景（人可读、可手动修复）

**但 LangGraph 的设计值得借鉴**：

- **Checkpointing 思路**：未来可考虑为 pipeline 添加进度追踪（已完成哪个 phase），支持断点续跑
- **`Send` API 的动态扇出**：当前 `callAgentsParallel` 已实现类似功能，但不如 `Send` 通用
- **`interrupt()` 模式**：未来若需要人机协作（用户审批 GM 的调度计划），这是好的参考

---

## 二、Plan + Todolist + Executor vs 当前硬编码 Pipeline

### 2.1 模式概览

```
Plan+Todolist+Executor:
  Planner LLM → 生成任务列表(含依赖) → Executor 按 DAG 调度 → Notify 通知进度

当前硬编码 Pipeline:
  固定流程代码 → callAgent/callAgentsParallel → async generator 组合流
```

### 2.2 Plan+Executor 的实现谱系

| 实现 | Planner | DAG/依赖 | Replan | 并行 | 生产可用 |
|------|---------|----------|--------|------|---------|
| BabyAGI | Task creation agent | 无（deque） | 隐式（始终） | 无 | 仅原型 |
| LangGraph PlanExecute | LLM + structured output | 可选（LLMCompiler） | 显式节点 | LLMCompiler | 是 |
| CrewAI | AgentPlanner（可选） | 无 | 无 | 仅 Sequential | 是 |
| OpenAI Agents JS | 无内建 | 无 | 无 | 代码驱动（Promise.all） | 是 |
| VMAO (ICLR 2026) | QueryPlanner → DAG | 原生 | Verify → Replan | DAG-aware (k=3) | 论文 |
| Anthropic Research | LeadResearcher | 隐式 | 隐式 | 扇出 (3-5 subagents) | 生产 |

### 2.3 能否实现"确保 LLM 按需调度"？

**能，但代价高且收益低**。

对于固定的 GM→Actor→Scribe→Archivist 序列，LLM Planner 每次都会生成相同的计划：

- 花了 1-2 个额外 LLM 调用来规划
- 95%+ 的时间产出相同结果
- 5% 的时间可能出错（漏步、乱序、多余步骤）

| 维度 | Plan+Executor | 硬编码 Pipeline |
|------|-------------|---------------|
| 调度可靠性 | ~85-95%（取决于 Planner 质量） | ~99.9%（代码即逻辑） |
| 额外 LLM 调用 | 1-3 次（Planner + 可能的 Replan） | 0 次 |
| 额外延迟 | 2-6 秒（Planner 思考时间） | 0 秒 |
| 额外 Token 消耗 | ~2000-5000 tokens/请求 | 0 |
| 灵活性 | 高——可处理未预见的流程组合 | 低——只处理预定义路径 |
| 可调试性 | 需要 tracing——计划是概率性的 | 代码即 spec——确定性 |

### 2.4 关键洞察：当前方案已是混合架构

当前方案本身就是混合的——**固定骨架（代码驱动）+ 动态填充（LLM 驱动）**：

```
固定骨架（代码驱动）           动态填充（LLM 驱动）
─────────────────           ─────────────────
Phase 1: GM Orient+Script  →  GM 决定读哪些文件、写什么剧本
Phase 2: Enact             →  GM 决定哪些角色、什么顺序、什么指示
Phase 3: Scribe            →  固定步骤，输入自动注入
Phase 4: Archivist         →  Characters 门控 → 并行 → Debts 串行
```

这符合 **OpenAI Agents JS 官方立场**：

> *"While orchestrating via LLM is powerful, orchestrating via code makes tasks more deterministic and predictable, in terms of speed, cost and performance."*

也符合 **LangGraph 生产实践**——固定图结构 + 动态扇出。

也符合 **Anthropic 生产经验**——固定 LeadResearcher → Subagents → CitationAgent 骨架，动态子 agent 数量。

### 2.5 Plan+Executor 真正有价值的场景

不是替代当前 Pipeline，而是**未来的长程剧情演绎**——项目 README 已预见：

> 长期（梦想）：plan-executor 结构的长程剧情演绎

这种场景下：
- 流程不是固定的（可能需要多轮 GM→Actor→Scribe→Archivist 循环）
- 任务依赖是动态的（某个剧情分支需要额外场景）
- 并行机会随剧情变化（同时推进多条剧情线）

**当流程本身不可预知时，让 LLM 来决定流程**——这才是 Plan+Executor 的真正价值。

### 2.6 Plan+Executor 的核心挑战

1. **LLM 不可靠地生成 DAG**——可能漏依赖、加伪依赖、创建环
2. **动态依赖解析在生产中未解决**——VMAO (ICLR 2026) 是最接近的，但仍依赖 Planner 正确性
3. **无限循环风险**——BabyAGI 的教训：plan-execute-replan 可能永远不停
4. **Anthropic 的经验**："agents continuing when they already had sufficient results"——需要显式的 effort-scaling 规则

---

## 三、综合对比矩阵

| 维度 | LangGraph 图调度 | Plan+Todolist+Executor | 当前硬编码 Pipeline |
|------|----------------|----------------------|-------------------|
| **适合场景** | 复杂动态图、需要持久化和 HITL | 流程不可预知、需要自适应 | 流程固定、已知路径 |
| **调度可靠性** | 高（图编译时验证） | 中（依赖 Planner 质量） | 最高（代码确定性） |
| **开发成本** | 高（学习曲线陡） | 中（Planner prompt 调试） | 低（JS 原语） |
| **运行成本** | 中（框架开销） | 高（额外 LLM 调用） | 低（零额外调用） |
| **灵活性** | 中（编译时拓扑） | 高（运行时规划） | 低（硬编码路径） |
| **可观测性** | 最强（可视化 + tracing） | 中（需自建） | 弱（只有 console.log） |
| **与项目契合度** | 低（需换 SDK） | 中（需加 Planner 层） | 最高（原生 @openai/agents） |
| **演进潜力** | 高（图 + 子图 + HITL） | 高（动态 DAG + 验证） | 中（增量加 helper） |

---

## 四、务实建议

### 4.1 当前阶段：硬编码 Pipeline 是最务实的选择

LangGraph 和 Plan+Executor 都是"当问题变得更复杂时"的答案——而当前问题还不够复杂。

### 4.2 低成本改进：意图路由器

在 Pipeline 之前添加代码级意图分类，比"让 GM 在 Prompt 里自己决定走哪条路"更可靠，比"Plan+Executor"更简单：

```typescript
const intent = await classifyIntent(userMessage);
// intent = { type: 'scene' | 'question' | 'recall' | 'edit' | ... }

switch (intent.type) {
  case 'scene':    return runScenePipeline(input);     // 完整 Pipeline
  case 'question': return runDirectQuery(input);       // GM 直接回答
  case 'recall':   return runRecall(input);            // GM 读取 + 回忆
  case 'edit':     return runEditState(input);         // 直接编辑 .novel/ 文件
}
```

### 4.3 未来演进路径

```
当前（Phase 1）              近期（Phase 2）              长期（Phase 3）
──────────────              ──────────────              ──────────────
硬编码 Pipeline             + 意图路由器                 Plan+Executor
callAgent/callAgentsParallel + callAgentStreaming         动态 DAG 调度
                            + mergeStreams               验证 + 重规划
                            + checkpointing              长程剧情演绎
```

Phase 2 是 Phase 1 的自然增量（加 helper、加路由），Phase 3 是架构升级（引入 Planner 层），三者不冲突。

### 4.4 值得借鉴的 LangGraph 设计

| LangGraph 特性 | 借鉴方式 | 时机 |
|---------------|---------|------|
| Checkpointing | 为 Pipeline 添加 phase 进度追踪，支持断点续跑 | Phase 2 |
| `Send` API | 当前 `callAgentsParallel` 已等价，无需改动 | — |
| `interrupt()` | 未来人机协作（用户审批调度计划）时参考 | Phase 3 |
| 7 种 stream mode | 当前单一组合流足够，`callAgentStreaming` 是自然扩展 | Phase 2 |
| 子图组合 | 当前 `callAgent` 嵌套已等价，无需改动 | — |

### 4.5 值得借鉴的 Plan+Executor 设计

| Plan+Executor 特性 | 借鉴方式 | 时机 |
|-------------------|---------|------|
| LLMCompiler DAG | Archivist 并行子 Agent 的 DAG 执行 | Phase 1（已实现） |
| VMAO Verify 步骤 | Pipeline 末尾添加验证步骤（检查所有预期更新是否完成） | Phase 2 |
| Anthropic effort-scaling | 给 Agent 添加"已充分完成"的停止条件 | Phase 2 |
| 动态 replan | 长程剧情演绎的核心机制 | Phase 3 |
