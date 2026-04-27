# Final QA Evidence

Date: 2026-04-27

## Scenario 1: Sub-session path verification — PASS

- `createSubSession` (src/session/manager.ts:46-70) creates `FileSession({ storageDir: subagentDir, sessionId })` where `subagentDir = join(sessionsDir, "subagent")`
- `sessionsDir = join(projectDir, ".sessions")`
- FileSession stores at `{storageDir}/{sessionId}/history.json` → `.sessions/subagent/{sessionId}/history.json` ✅
- `SubSessionEntry` (src/session/types.ts:6-11) includes `agentName: AgentName` field ✅

## Scenario 2: Stale sessionId returns error — PASS

All three call_* tools in registry.ts check for stale sessionId:
- call_actor (line 74-75): `return \`Error: Session ${input.sessionId} not found. Start a new session by calling without sessionId.\`;`
- call_scribe (line 123-124): Same error format ✅
- call_archivist (line 166-167): Same error format ✅
- None auto-create a new session when stale sessionId is provided ✅

## Scenario 3: JSON output format — PASS

All three tools return `JSON.stringify({ output, sessionId, isNewSession })`:
- call_actor (line 100): `JSON.stringify({ output: String(result.finalOutput ?? ''), sessionId, isNewSession })` ✅
- call_scribe (line 142): Same format ✅
- call_archivist (line 187): Same format ✅

## Scenario 4: Interaction log auto-append — PASS

- call_actor (lines 90-95): try/catch wrapping `appendInteractionLog(storyDir, input.character, String(result.finalOutput ?? ''))` after `run()` ✅
- Best-effort: catch block is silent (comment: "Best-effort: don't block Actor result on interaction log write failure") ✅
- call_scribe and call_archivist do NOT auto-append (correct — only Actor generates interaction data) ✅

## Scenario 5: GM file tools — PASS

- GM tools (registry.ts line 217): `[callActorTool, callScribeTool, callArchivistTool, appendInteractionTool, clearInteractionLogTool, readFileTool, writeFileTool, globFilesTool]`
- Has readFileTool ✅, writeFileTool ✅, globFilesTool ✅
- Does NOT have editFileTool ✅ (editFileTool exists in file-tools.ts but is not imported into registry.ts or added to GM tools)

## Scenario 6: Actor/Scribe dynamic context — PASS

- actor.ts (line 23): `await buildStoryContext(storyDir, { excludeInteractionLog: true })` ✅
- scribe.ts (line 13): `await buildStoryContext(storyDir)` — no excludeInteractionLog flag ✅
- scribe.ts instructions (line 11): `async (runContext) => {` — async function ✅
- buildStoryContext respects `excludeInteractionLog` flag (build-story-context.ts lines 219-224) ✅

## Scenario 7: call_scribe no interactionLog parameter — PASS

- call_scribe parameters (registry.ts lines 107-109): only `sceneContext: z.string()` and `sessionId: z.string().optional()`
- No `interactionLog` parameter ✅

## Scenario 8: Dead code removal — PASS

- ActorPromptState (prompts/types.ts:18-22): fields are `characterFile?` and `storyContext?` — no interactionLog ✅
- ScribePromptState (prompts/types.ts:24-28): fields are `styleGuide?` and `storyContext?` — no interactionLog ✅
- buildActorStateBlock (prompts/actor.ts:15-27): references `state.characterFile` and `state.storyContext` only — no interactionLog ✅
- buildScribeStateBlock (prompts/scribe.ts:14-26): references `state.styleGuide` and `state.storyContext` only — no interactionLog ✅

## Scenario 9: Chat history persistence — PASS

- GET handler exists (route.ts lines 89-109): reads chat history via `readChatHistory(project.dataDir)` ✅
- PUT handler exists (route.ts lines 111-130): saves chat history via `saveChatHistory(project.dataDir, messages)` ✅
- page.tsx fetches initial messages (lines 22-35): `fetch(\`/api/narrative?projectId=${projectId}\`)` → `setInitialMessages(data.messages ?? [])` ✅
- page.tsx saves on finish (lines 50-57): `onFinish` callback sends PUT to `/api/narrative` with `{ projectId, messages: currentMessages }` ✅

## Scenario 10: Type check — PASS

- `npx tsc --noEmit` completed with zero errors ✅
