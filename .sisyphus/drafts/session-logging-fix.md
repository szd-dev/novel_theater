# Draft: Fix Session Storage & Add LLM Logging

## Requirements (confirmed)
- **Issue 1**: chat-history 和 history 文件在 gm-main 目录下冗余存储 — 用户认为完全冗余
- **Issue 2**: 即使冗余存储了两份数据，刷新页面后仍不能正确重新加载会话
- **Issue 3**: 需要日志能力 — 能看到调用 LLM 时发送的全部 system prompt（特别是 sub-agent 调用时）

## Technical Decisions
- (pending research)

## Research Findings
- (pending explore agents)

## Open Questions
- chat-history 和 history 的具体内容差异是什么？
- 页面刷新后重新加载的完整数据流是什么？哪里断了？
- 当前是否已有任何日志基础设施？
- sub-agent 调用时 context 构建的完整流程是什么？

## Scope Boundaries
- INCLUDE: 消除冗余存储、修复会话重新加载、添加 LLM 调用日志
- EXCLUDE: (待确认)
