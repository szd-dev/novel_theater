# Learnings - Multi-Agent Fix 2

## Session
- Started: 2026-04-27T01:31:34Z
- Plan: multi-agent-fix-2

## Inherited from Round 1
- `project.dataDir` is the absolute path to the project root. The `.novel/` directory lives inside it.
- `getOrCreateStorySession(projectId, projectDir)` expects `projectDir` = project root, NOT `.novel/` subdirectory.
- GM run context `{ storyDir }` points to `.novel/` directory for file tools.
- `bun run build` may exit 143 (SIGTERM/OOM) on constrained environments — use `tsc --noEmit` as fallback.
- `readInteractionLog` is synchronous (uses `readFileSync`).
- Interaction log injection goes AFTER token budget truncation in buildStoryContext().
- `tool()` and `run()` are both from `@openai/agents`.
- `createSubSession()` is synchronous; `getSubSession()` is synchronous.
- `useChat` must be called unconditionally — extracted `ProjectChat` as inner component.

## Round 2 Discoveries
- `globFilesTool` already exists in `src/tools/file-tools.ts` (name: `glob_files`) — T3 only needs isSafePath addition
- `isSafePath` is a private function in `file-tools.ts` — not exported, used by writeFileTool and editFileTool
- `readFileTool` does NOT have isSafePath validation (read-only but still potential path traversal)
- Archivist already has globFilesTool in its tools array
- SubSessionEntry only has `sessionId` and `createdAt` — no `agentName` or `characterName`
- `createSubSession` uses type-cast hack: `(entry as SubSessionEntry & { characterName?: string }).characterName = characterName`
- Sub-sessions stored at `.sessions/{uuid}/` not `.sessions/subagent/{uuid}/`
- `getSubSession` only checks in-memory Map — no disk re-hydration
- Actor uses `findLatestScene()` helper instead of `buildStoryContext()`
- Scribe has static instructions (`getScribePrompt({})`) — not async
- GM tools array populated in registry.ts line 210

## Wave 1 Task: Session Infrastructure Updates
- `AgentName` type exported from `types.ts` as `'Actor' | 'Scribe' | 'Archivist'`
- `createSubSession` now returns `{ session: Session; sessionId: string }` — callers no longer need `await subSession.getSessionId()`, they get `sessionId` directly from the return value
- Sub-session storage path changed from `.sessions/{uuid}/` to `.sessions/subagent/{uuid}/` — old sessions at `.sessions/` will NOT be migrated
- `getSubSession` now does disk re-hydration: checks `existsSync(historyPath)` and creates FileSession if found
- `registry.ts` callers updated: Actor passes `'Actor'` + characterName, Scribe passes `'Scribe'`, Archivist passes `'Archivist'`
- `buildStoryContext` `excludeInteractionLog` option skips the interaction log injection (post token-budget)
- `index.ts` needed NO changes — SessionIndex type in types.ts already references SubSessionEntry which gained the new fields
