## Learnings

### 2026-04-26 Session Start

- AI SDK v6 uses `dynamic-tool` part type (not `tool-invocation`) for agent-as-tool calls via `@openai/agents-extensions`
- `DynamicToolUIPart` from `ai` package has: `type: "dynamic-tool"`, `toolName`, `state`, `input`, `output`
- Current code checks `part.type === "tool-invocation"` in message-item.tsx and message-list.tsx — WRONG
- `useChat()` from `@ai-sdk/react` returns `sendMessage` (not `handleSubmit`), no `stop` destructured yet
- `asTool()` supports `runOptions` which includes `session?: Session` — can pass per-character sessions
- `Session` interface: `getSessionId()`, `getItems(limit?)`, `addItems(items)`, `popItem()`, `clearSession()`
- `MemorySession` is simple in-memory, not persistent
- `story-files.ts` has 8 hardcoded `join(dir, ".novel")` occurrences
- `initStoryTool` exists in `story-tools.ts` but is NOT imported/used by GM agent
- `characterSessions` Map in StorySession is created but `getCharacterSession()` is never called
- `AgentLabel` component and `AGENT_COLORS` already exist in agent-label.tsx
- `.novel_backup/` directory exists and should be cleaned up
- `DefaultChatTransport` is used for useChat (AI SDK v6 style)
