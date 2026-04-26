# Draft: 自由剧场 UI 优化

## Requirements (confirmed)
1. **无法终止会话**: 用户在页面上无法停止/中止正在进行的对话流
2. **工具调用显示为空白行**: call_actor/call_scribe/call_archivist 的工具调用在聊天界面中显示为空白行
3. **无法查看 subagent session**: 没有 UI 可以查看 Actor/Scribe/Archivist 子代理的执行详情
4. **.novel/ 目录不存在**: 规定的存储目录未创建，只有 .novel_backup 含模板文件
5. **输入框仅支持单行**: 需要支持多行输入和自动换行
6. **多步响应拆分气泡**: 单次消息触发多轮 LLM 调用时，想在前端拆分成多个气泡展示（调研+评估）

## Technical Decisions
- (pending user confirmation on key questions)

## Research Findings

### 问题1: 无法终止会话 [复杂度: LOW]
**根因（双重缺失）**:
- **前端**: `useChat` 的 `stop` 函数未被解构，`ChatInput` 无 Stop 按钮
- **后端**: `req.signal` (AbortSignal) 未传递给 `run()`，客户端中断后服务端代理继续运行

**修复**: 解构 `stop` + 添加 Stop 按钮 + 传递 `signal: req.signal` + abort 错误处理

### 问题2: 工具调用显示为空白行 [复杂度: LOW-MEDIUM]
**根因**: Part type mismatch
- 代码检查 `part.type === "tool-invocation"` 但 AI SDK v6 实际类型是 `"dynamic-tool"`
- `@openai/agents-extensions` 桥接层以 `dynamic: true` 发出工具事件 → 客户端创建 `DynamicToolUIPart`
- `renderParts()` 只处理 `text` 类型，`dynamic-tool` 返回 null → 空白气泡
- `extractAgentLabel()` 和 `deriveProgress()` 同样检查错误的类型 → agent 标签和进度指示器完全失效

**修复**: 
1. 将 `"tool-invocation"` 检查改为 `"dynamic-tool"`，直接读取 `part.toolName`
2. 在 `renderParts()` 中添加 `dynamic-tool` 渲染逻辑（agent 标签 + 输入摘要 + 输出文本）
3. 处理 `step-start` 类型

### 问题3: 无法查看 subagent session [复杂度: HIGH]
**根因（系统性缺失）**:
- Session 管理器: 纯内存 `Map` + `MemorySession`，无持久化
- `characterSessions` Map 是死代码——从未被消费
- `asTool()` 的 `customOutputExtractor` 只提取 `finalOutput`，丢弃所有中间步骤
- 无 session 历史 API 端点
- 追踪被显式禁用: `setTracingDisabled(true)`

**实现需求（按优先级）**:
1. 持久化 Session 后端（SQLiteSession 或自定义）
2. 将 characterSessions 接入 sub-agent runs
3. 捕获完整的 AgentRunResult
4. 创建 session 数据模型和 API 端点
5. 重新考虑追踪禁用策略
6. 构建 session viewer UI

### 问题4: .novel/ 目录不存在 [复杂度: LOW]
**根因（初始化链断裂）**:
- `.novel/` 在 `.gitignore` 中，不随仓库分发
- **无自动初始化**: 无组件/API/中间件在启动时调用 `initStory()`
- GM prompt 指示"初始化 .novel/"，但 GM 工具列表中**没有 initStoryTool**（死代码）
- 唯一初始化路径 `POST /api/story {action: "init"}`，前端从未调用
- `.novel_backup/` 内容与 templates.ts 完全相同，无代码引用

**修复方案（三选一）**:
A. 将 `initStoryTool` 接入 GM agent 工具列表
B. 前端启动时自动检测并调用 init API
C. `buildStoryContext()` 在 .novel/ 不存在时自动调用 `initStory()`

### 问题5: 输入框仅支持单行 [复杂度: LOW]
**根因**: 
- 使用 HTML `<input>` 而非 `<textarea>`（通过 @base-ui/react/input）
- 固定高度 `h-8`，`items-center` 布局
- 无 Textarea UI 组件

**修复**: 
- 替换为 auto-resize `<textarea>`（`rows={1}` + scrollHeight 自动增长）
- `items-end` 对齐按钮到底部
- Shift+Enter 换行，Enter 提交
- `max-h-[200px] overflow-y-auto` 限制最大高度

### 问题6: 多步响应拆分气泡 [复杂度: MEDIUM-HIGH]
**调研结论**:

**可行性**: ✅ 完全可行

**技术方案**: 利用 `step-start` part 作为分段边界，将单个 UIMessage 的 parts 数组拆分为多个 segment，每个 segment 渲染为独立气泡

**UIMessage parts 结构示例**:
```
[
  { type: 'step-start' },
  { type: 'text', text: 'GM 决策文本...' },
  { type: 'dynamic-tool', toolName: 'call_actor', state: 'output-available', ... },
  { type: 'step-start' },
  { type: 'text', text: 'Actor 角色对话...' },
  { type: 'step-start' },
  { type: 'dynamic-tool', toolName: 'call_scribe', ... },
  { type: 'step-start' },
  { type: 'text', text: 'Scribe 文学叙述...' },
  ...
]
```

**分段算法**: 按 `step-start` 边界分组，每组前一个 `dynamic-tool` 的 `toolName` 决定 agent 归属

**成本评估**:
- 分段逻辑: ~40 行核心代码
- MessageItem 重构: 需改为接受 segment 而非完整 message
- 流式响应兼容: 新 `step-start` 到达时自动创建新气泡（天然支持）
- Agent 归属映射: `call_actor` → Actor, `call_scribe` → Scribe, `call_archivist` → Archivist
- **注意**: 问题2的修复是问题6的前置条件——必须先修好 `dynamic-tool` 渲染

## Open Questions
- 问题3: subagent session viewer 的实现深度？完整持久化后端 vs 轻量级方案？
- 问题4: 初始化方案选 A/B/C？
- 问题6: 是否确认实现多气泡拆分？（已确认可行，成本中等）
- 测试策略: TDD / tests-after / none？

## Scope Boundaries
- INCLUDE: 上述6个问题的修复
- EXCLUDE: (待确认)
