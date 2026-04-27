# Learnings - Multi-Agent Fix

## Session
- Started: 2026-04-26T18:06:58Z
- Plan: multi-agent-fix

## Conventions
(Accumulated during execution)

- `project.dataDir` is the absolute path to the project root (e.g., `/path/.data_store/projects/p001/`). The `.novel/` directory lives inside it at `join(dataDir, '.novel')`.
- `getOrCreateStorySession(projectId, projectDir)` expects `projectDir` = project root, NOT `.novel/` subdirectory.
- `setCurrentProjectId(projectId, projectDir)` also expects project root as second arg.
- GM run context `{ storyDir }` points to `.novel/` directory for file tools.
- `bun run build` may exit 143 (SIGTERM/OOM) on constrained environments even when compilation succeeds — use `tsc --noEmit` as fallback verification.
- `readInteractionLog` is synchronous (uses `readFileSync`), so no `await` needed when calling it from `buildStoryContext`.
- Interaction log injection goes AFTER token budget truncation — it's a separate append to the result string, not part of the sections array.
- Pre-existing test bug: `buildStoryContext.test.ts` "returns null when .novel/ doesn't exist" fails because `existsSync(dir)` is true for temp dirs; the function only checks dir existence, not `.novel/` existence.

## Registry Rewrite (2026-04-27)

- `tool()` and `run()` are both exported from `@openai/agents` (re-exported from `@openai/agents-core`)
- `run()` signature: `run(agent, input, options?)` where options has `{ context?, session?, maxTurns?, stream? }`
- `RunResult` type has: `finalOutput`, `newItems` (RunItem[]), `rawResponses`, `agentToolInvocation`
- `RunItem` is a union type — can't naively narrow with `{ type: string; rawItem?: { name?: string } }` — must cast inside the handler
- `createSubSession()` is synchronous; `getSubSession()` is synchronous; `Session.getSessionId()` is async
- `buildExecutionLog` must use `RunResult<any, any>` parameter type — narrow inline types fail due to `RunToolApprovalItem.rawItem` not having `name`
- `asTool()` and `DynamicCharacterSession` successfully replaced with 5 `tool()` definitions
- Removed `setCurrentThreadId` deprecated alias

## ToolCallCard Component (2026-04-27)

- `src/components/chat/tool-call-card.tsx` — collapsible card for dynamic-tool parts
- Handles all 4 states: input-streaming (pulse animation), input-available (param summary), output-available (collapsed output with expand), output-error (error message)
- Tool name → agent label mapping via `TOOL_META` lookup with fallback to "工具"/gray
- Left border accent color matches agent color; small colored dot in header
- ChevronDown SVG rotates on expand; output area has `max-h-64` scrollable container
- Uses design tokens: `border-border/50`, `bg-muted/50`, `text-foreground`, `text-destructive`, `text-muted-foreground`
- No `as any` or `@ts-ignore` — typed `state` as union literal in the `as` cast
- Both `renderParts` and `renderSegmentParts` in `message-item.tsx` now delegate to `<ToolCallCard>` instead of inline rendering
- `getAgentKey` and `extractAgentLabel` still used for the top-level Badge and segment agent labels

## ProjectSelector + Project-Aware Page (2026-04-27)

- **`useChat` must be called unconditionally** — extracted `ProjectChat` as inner component in same file, keyed by `projectId` to force remount on project switch (clears old messages)
- **`DefaultChatTransport` body updates don't clear messages** — the `key={projectId}` pattern on the wrapper component is essential for clean state reset
- **Two ProjectSelector variants** — `default` (full-screen centered, max-w-lg) and `sidebar` (compact, fills aside) controlled via `variant` prop rather than deriving from `currentProjectId`
- **Delete confirmation** — uses `deleteConfirmId` state to show confirm/cancel inline instead of modal; `e.stopPropagation()` required on delete buttons to prevent triggering project selection
- **SceneIndicator still accepts `threadId` prop** — passed `projectId` as `threadId`; the `/api/narrative/status` route doesn't actually use it (calls `resolveProjectPath()` instead), needs separate fix
- **ChatLayout not used** — page.tsx now inlines the layout structure (header + separator + flex-row content) since sidebar layout requires `flex-row` while ChatLayout wraps children in `flex-col`
- **No localStorage** — `projectId` is pure `useState`; page always starts with project selector on fresh load

