# Multi-Agent Fix Round 2

## TL;DR

> **Quick Summary**: Fix 5 critical issues in the multi-agent orchestration: chat history persistence, interaction log as file-based mechanism, sub-agent session ID return format, sub-session storage path, and Actor scene context injection via general file tools + buildStoryContext().
> 
> **Deliverables**:
> - Chat history persists across page refresh (UIMessage[] storage + GET endpoint)
> - Interaction log auto-appends after Actor, Scribe gets it via buildStoryContext()
> - Sub-agent tools return JSON with sessionId, stale sessionId returns error
> - Sub-sessions stored at `.sessions/subagent/` with agentName in index.json
> - GM/Archivist get general file read/write/glob tools; all agents get read/glob
> - Actor/Scribe instructions() call buildStoryContext() for dynamic context
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: T1 → T7 → T8 → T9 → F1-F4

---

## Context

### Original Request
User identified 5 significant issues after the previous implementation round:
1. Chat history lost on page refresh
2. Interaction log not properly implemented (zombie features, wrong mechanism)
3. Sub-agent session ID not returned properly
4. Sub-session storage path wrong + missing agentName in index.json
5. Actor missing scene/plot context (GM can't create scene skeletons)

### Interview Summary
**Key Discussions**:
- User explicitly instructed: "不要自主做太多决策，应该更多咨询用户的决定"
- Interaction log: file persistence, auto-write after actor, NOT parameter-based
- Scribe gets interaction data via buildStoryContext() auto-injection, NOT call_scribe parameter
- GM + Archivist get general file read/write/glob tools (not per-category tools)
- All agents get file read/search tools
- Actor calls buildStoryContext() for context (replaces findLatestScene())
- Stale sessionId → return error, but re-hydrate from disk if session exists on disk
- Sub-agent output → pure JSON format
- Per-turn session save → REMOVED from scope (keep current behavior)

**Research Findings**:
- GM has NO file write tool — can't create scene skeletons despite prompt saying to
- Actor reads stale previous scene via findLatestScene(), not current scene
- Scribe/Archivist have static prompts with no dynamic context injection
- ActorPromptState.interactionLog / ScribePromptState.interactionLog are dead code
- buildStoryContext() interaction log appended AFTER token budget (not subject to truncation)
- @openai/agents FileSession persists to disk but in-memory Map not re-hydrated on restart
- Archivist already has readFileTool + writeFileTool; needs glob_files added

### Metis Review
**Identified Gaps** (addressed):
- Sub-session re-hydration after server restart: re-hydrate from disk if exists, error if not
- Interaction log duplication across agents: add excludeInteractionLog option to buildStoryContext()
- GM write_file scope: general (within isSafePath/.novel/), per user's "通用" request
- Partial scene skeleton validation: skip isValidSceneFile for scene skeleton creation
- Token budget for Actor/Scribe: same DEFAULT_TOKEN_BUDGET (2000) as GM
- UIMessage serialization: verify during QA

---

## Work Objectives

### Core Objective
Fix 5 issues in the multi-agent orchestration to restore the designed flow: GM creates scene skeletons → Actor performs with proper context → interaction log persists → Scribe reads from file → Archivist updates state. Plus: chat history survives refresh, sub-sessions properly organized, session IDs properly returned.

### Concrete Deliverables
- `src/session/chat-history.ts` — UIMessage[] file I/O
- `src/session/types.ts` — SubSessionEntry with agentName + characterName
- `src/session/manager.ts` — sub-session path fix, re-hydration, createSubSession returns {session, sessionId}
- `src/context/build-story-context.ts` — excludeInteractionLog option
- `src/tools/file-tools.ts` — glob_files tool added
- `src/agents/gm.ts` + `src/agents/registry.ts` — GM gets file tools, prompt updated
- `src/agents/actor.ts` — instructions() calls buildStoryContext()
- `src/agents/scribe.ts` — instructions() becomes async, calls buildStoryContext()
- `src/agents/registry.ts` — JSON output, stale error, auto-append, remove interactionLog param
- `src/app/api/narrative/route.ts` — GET handler for chat history
- `src/app/page.tsx` — initialMessages, onFinish persistence

### Definition of Done
- [x] Page refresh preserves chat history
- [x] Interaction log auto-appends after Actor, Scribe reads it via buildStoryContext()
- [x] Sub-agent tools return JSON with sessionId
- [x] Stale sessionId returns error (but disk re-hydration works)
- [x] Sub-sessions stored at .sessions/subagent/ with agentName in index.json
- [x] GM can create scene skeletons with write_file tool
- [x] Actor/Scribe get dynamic context via buildStoryContext()
- [x] `bun run build` passes

### Must Have
- Chat history persistence (server-side, alongside gm-main session)
- Interaction log as file-based mechanism (auto-append after Actor)
- Sub-agent JSON output with sessionId
- Sub-session path at .sessions/subagent/
- SubSessionEntry.agentName in index.json
- GM file write tool for scene creation
- Actor/Scribe buildStoryContext() for dynamic context
- Scribe instructions() async with buildStoryContext()
- Remove interactionLog parameter from call_scribe

### Must NOT Have (Guardrails)
- 不修改 @openai/agents SDK 内部代码
- 不实现每轮 session 落盘（用户决定保持现状）
- 不给 GM 添加 edit_file 工具（只有 read/write/glob）
- 不自动创建新 session 当 sessionId 不存在时（返回错误）
- 不迁移旧 .sessions/ 路径下的 sub-session 文件
- 不修改 Archivist 的现有工具集（只添加 glob_files）
- 不填充 GMPromptState 的死字段（currentSceneId/currentLocation/currentTime/activeCharacter）
- 不修改 buildStoryContext() 的核心算法（只添加 excludeInteractionLog 选项）
- 不给 UIMessage GET 端点加分页（返回全部消息）
- 不让 interaction log 写入失败阻塞 Actor 结果返回（best-effort）

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: None (user decision)
- **Framework**: bun test (existing, not adding new tests)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Library/Module**: Use Bash (bun REPL) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 3 tasks, all parallel):
├── T1: Session infrastructure update [deep]
├── T2: Chat history storage module [quick]
└── T3: File tools definitions [quick]

Wave 2 (Agent + Registry updates - 4 tasks, mostly parallel):
├── T4: GM agent update (depends: T1, T3) [unspecified-high]
├── T5: Actor agent update (depends: T1, T3) [unspecified-high]
├── T6: Scribe agent update (depends: T1, T3) [unspecified-high]
└── T7: Registry rewrite (depends: T1) [deep]

Wave 3 (Frontend + cleanup - 2 tasks):
├── T8: Chat page + GET endpoint (depends: T2, T7) [visual-engineering]
└── T9: Cleanup dead code (depends: T4-T7) [quick]

Wave FINAL (4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T7 → T8 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | - | T4, T5, T6, T7 | 1 |
| T2 | - | T8 | 1 |
| T3 | - | T4, T5, T6 | 1 |
| T4 | T1, T3 | T9 | 2 |
| T5 | T1, T3 | T9 | 2 |
| T6 | T1, T3 | T9 | 2 |
| T7 | T1 | T8, T9 | 2 |
| T8 | T2, T7 | F1-F4 | 3 |
| T9 | T4, T5, T6, T7 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: T1 → `deep`, T2 → `quick`, T3 → `quick`
- **Wave 2**: T4 → `unspecified-high`, T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `deep`
- **Wave 3**: T8 → `visual-engineering`, T9 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Session Infrastructure Update

  **What to do**:
  - Update `SubSessionEntry` in `src/session/types.ts`: add `agentName: 'Actor' | 'Scribe' | 'Archivist'` and `characterName?: string` as proper fields (remove type-cast hack)
  - Update `createSubSession` in `src/session/manager.ts`: accept `agentName` parameter, return `{ session: Session; sessionId: string }` instead of just `Session`
  - Fix sub-session storage path: use `join(sessionsDir, "subagent")` as storageDir for sub-sessions (GM stays at `.sessions/gm-main/`)
  - Update `getSubSession` to support disk re-hydration: if sessionId not in memory Map, check if `.sessions/subagent/{sessionId}/history.json` exists on disk; if yes, create FileSession and add to Map; if no, return null
  - Remove type-cast hack for characterName in createSubSession
  - Add `excludeInteractionLog?: boolean` option to `buildStoryContext()` in `src/context/build-story-context.ts` — when true, skip appending the interaction log after token budget
  - Update `src/session/index.ts` createInitialSessionIndex to handle new SubSessionEntry fields

  **Must NOT do**:
  - 不迁移旧 .sessions/ 路径下的 sub-session 文件
  - 不修改 buildStoryContext 的核心算法（只添加选项）
  - 不填充 GMPromptState 死字段

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple interconnected changes across session/ and context/ directories
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T4, T5, T6, T7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/session/types.ts:SubSessionEntry` — Current type definition to extend
  - `src/session/manager.ts:createSubSession` — Current implementation to modify (storageDir, return type)
  - `src/session/manager.ts:getSubSession` — Currently only checks in-memory Map; needs disk fallback
  - `src/session/index.ts` — Session index read/write; update for new fields
  - `src/session/file-session.ts` — FileSession constructor takes {storageDir, sessionId}; understand for re-hydration
  - `src/context/build-story-context.ts:218-221` — Interaction log injection point; add excludeInteractionLog option
  - `src/session/execution-log.ts:2` — ExecutionLog already has `agentName` field; follow this pattern

  **API/Type References**:
  - `src/session/types.ts:SessionIndex` — Contains subSessions map
  - `@openai/agents` Session interface — FileSession implements this

  **WHY Each Reference Matters**:
  - `types.ts:SubSessionEntry` — Must add agentName + characterName properly
  - `manager.ts:createSubSession` — Must change storageDir to subagent/ and return type
  - `manager.ts:getSubSession` — Must add disk re-hydration for server restart recovery
  - `build-story-context.ts` — excludeInteractionLog option prevents duplication when multiple agents call it
  - `execution-log.ts` — Pattern reference for agentName field

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Sub-session created in correct path
    Tool: Bash (bun)
    Preconditions: Clean project directory
    Steps:
      1. Import createSubSession from session/manager
      2. Call createSubSession('p001', projectDir, 'Actor', '塞莉娅')
      3. Check that .sessions/subagent/{sessionId}/history.json exists
      4. Check that .sessions/index.json has subSessions entry with agentName: "Actor" and characterName: "塞莉娅"
    Expected Result: Sub-session directory at .sessions/subagent/ not .sessions/
    Failure Indicators: Directory at .sessions/{uuid}/ instead of .sessions/subagent/{uuid}/
    Evidence: .sisyphus/evidence/task-1-sub-session-path.txt

  Scenario: Disk re-hydration after memory loss
    Tool: Bash (bun)
    Preconditions: Sub-session exists on disk but not in memory Map
    Steps:
      1. Create a sub-session, get sessionId
      2. Clear the in-memory sessions Map (simulate restart)
      3. Call getSubSession(projectId, projectDir, sessionId)
      4. Verify session is re-hydrated from disk
    Expected Result: Session returned successfully from disk
    Failure Indicators: getSubSession returns null despite file existing on disk
    Evidence: .sisyphus/evidence/task-1-rehydration.txt

  Scenario: Stale sessionId returns null
    Tool: Bash (bun)
    Preconditions: No session on disk for given sessionId
    Steps:
      1. Call getSubSession(projectId, projectDir, 'nonexistent-uuid')
      2. Verify null is returned
    Expected Result: null returned for truly non-existent session
    Failure Indicators: Error thrown or new session created
    Evidence: .sisyphus/evidence/task-1-stale-error.txt
  ```

  **Commit**: YES
  - Message: `fix(session): update SubSessionEntry types, sub-session path, and buildStoryContext options`
  - Files: `src/session/types.ts`, `src/session/manager.ts`, `src/session/index.ts`, `src/context/build-story-context.ts`

- [x] 2. Chat History Storage Module

  **What to do**:
  - Create `src/session/chat-history.ts` with:
    - `readChatHistory(projectDir: string): Promise<UIMessage[]>` — reads from `.sessions/gm-main/chat-history.json`
    - `saveChatHistory(projectDir: string, messages: UIMessage[]): Promise<void>` — writes to same file
  - Use atomic write (write to .tmp, then renameSync) for safety
  - Handle missing file gracefully (return empty array)
  - Import UIMessage type from `@ai-sdk/react` or `ai`

  **Must NOT do**:
  - 不给 GET 端点加分页
  - 不修改 FileSession 的 AgentInputItem 格式
  - 不使用 localStorage

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: New module with simple file I/O, no complex logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: T8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/session/file-session.ts:saveToDisk` — Atomic write pattern (tmp + renameSync)
  - `src/session/manager.ts:getSessionsDir` — Returns join(projectDir, ".sessions")

  **API/Type References**:
  - `ai` package — UIMessage type
  - `@ai-sdk/react` — UIMessage type alias

  **WHY Each Reference Matters**:
  - `file-session.ts:saveToDisk` — Copy the atomic write pattern for data safety
  - `manager.ts:getSessionsDir` — Use to construct the storage path

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Save and read chat history round-trip
    Tool: Bash (bun)
    Preconditions: Clean project directory with .sessions/gm-main/
    Steps:
      1. Import { saveChatHistory, readChatHistory } from session/chat-history
      2. Create sample UIMessage[] with 3 messages
      3. Call saveChatHistory(projectDir, messages)
      4. Call readChatHistory(projectDir)
      5. Compare result with original messages
    Expected Result: Read messages match saved messages exactly
    Failure Indicators: Messages differ or read returns empty
    Evidence: .sisyphus/evidence/task-2-roundtrip.txt

  Scenario: Read from missing file
    Tool: Bash (bun)
    Preconditions: No chat-history.json exists
    Steps:
      1. Call readChatHistory(projectDir) where file doesn't exist
    Expected Result: Returns empty array []
    Failure Indicators: Throws error or returns null
    Evidence: .sisyphus/evidence/task-2-missing-file.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `feat(session): add chat history storage module`
  - Files: `src/session/chat-history.ts`

- [x] 3. File Tools Definitions

  **What to do**:
  - Add `glob_files` tool to `src/tools/file-tools.ts`:
    - Parameters: `pattern: z.string()` (glob pattern like `scenes/*.md`), `dir: z.string().optional()` (subdirectory within .novel/)
    - Execute: use Node.js `fs.globSync` or similar to list matching files
    - Apply `isSafePath` validation
  - Verify that existing `readFileTool` and `writeFileTool` in `src/tools/file-tools.ts` can be shared across agents (they should be — tools are just definitions)
  - Ensure all file tools use `isSafePath` for path safety
  - Tools should resolve paths relative to the story directory (`.novel/`)

  **Must NOT do**:
  - 不给 GM 添加 edit_file 工具
  - 不修改 Archivist 的现有工具定义（只添加 glob_files）
  - 不修改 isSafePath 的逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding one new tool definition, verifying existing ones
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: T4, T5, T6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/tools/file-tools.ts:readFileTool` — Existing read tool definition pattern
  - `src/tools/file-tools.ts:writeFileTool` — Existing write tool definition pattern
  - `src/tools/character-tools.ts:resolveCharacterTool` — Another tool definition pattern
  - `src/lib/retry.ts:isSafePath` — Path safety validation

  **API/Type References**:
  - `@openai/agents` — `tool()` function for defining tools with zod schemas
  - `zod` v4 — Schema definition

  **WHY Each Reference Matters**:
  - `file-tools.ts` — Must follow exact same pattern for glob_files
  - `isSafePath` — Must use for path validation in glob_files

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: glob_files lists matching files
    Tool: Bash (bun)
    Preconditions: .novel/ directory with scenes/s001.md, scenes/s002.md, characters/塞莉娅.md
    Steps:
      1. Import glob_files tool
      2. Execute with pattern "scenes/*.md" and storyDir
      3. Verify result includes s001.md and s002.md
    Expected Result: Array containing matching file paths
    Failure Indicators: Empty result or error
    Evidence: .sisyphus/evidence/task-3-glob-files.txt

  Scenario: glob_files rejects unsafe path
    Tool: Bash (bun)
    Steps:
      1. Execute glob_files with pattern "../../../etc/passwd"
      2. Verify error message about unsafe path
    Expected Result: Error string about path traversal
    Failure Indicators: Returns file list from outside .novel/
    Evidence: .sisyphus/evidence/task-3-unsafe-path.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `feat(tools): add glob_files tool definition`
  - Files: `src/tools/file-tools.ts`

- [x] 4. GM Agent Update

  **What to do**:
  - Add `readFileTool`, `writeFileTool`, `glob_files` to GM agent's tools array in `src/agents/registry.ts`
  - Update GM prompt in `src/prompts/gm.ts`:
    - Reinforce scene skeleton creation workflow: GM should use write_file to create `scenes/sXXX.md` BEFORE calling actors
    - Update tool documentation section to include read_file, write_file, glob_files
    - Clarify that interaction log is file-based: GM calls clear_interaction_log at scene start, append_interaction is automatic after Actor
    - Remove contradictory statements about "交互记录随工具参数传递"
  - Ensure GM's write_file can write to any path within .novel/ (general capability per user request), but GM prompt should guide it to primarily write to scenes/

  **Must NOT do**:
  - 不给 GM 添加 edit_file
  - 不修改 GM 的 model 或 maxTurns
  - 不移除 append_interaction / clear_interaction_log（GM 仍需调用 clear_interaction_log）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Agent definition + prompt changes requiring careful coordination
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T6, T7)
  - **Parallel Group**: Wave 2
  - **Blocks**: T9
  - **Blocked By**: T1, T3

  **References**:

  **Pattern References**:
  - `src/agents/registry.ts:210` — Current GM tools array
  - `src/prompts/gm.ts:128-140` — Current tool documentation section
  - `src/prompts/gm.ts:176-198` — Scene lifecycle documentation
  - `src/tools/file-tools.ts:readFileTool` — Tool to add to GM
  - `src/tools/file-tools.ts:writeFileTool` — Tool to add to GM
  - `src/tools/file-tools.ts:glob_files` — New tool to add (from T3)

  **API/Type References**:
  - `src/agents/gm.ts` — GM agent definition

  **WHY Each Reference Matters**:
  - `registry.ts:210` — Must add file tools to this array
  - `gm.ts:128-140` — Must update tool docs to include file tools
  - `gm.ts:176-198` — Must reinforce scene skeleton creation workflow

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: GM has file tools available
    Tool: Bash (bun)
    Steps:
      1. Import gmAgent from agents/registry
      2. Check gmAgent.tools includes readFileTool, writeFileTool, glob_files
    Expected Result: All three file tools present in GM tools array
    Failure Indicators: Missing any file tool
    Evidence: .sisyphus/evidence/task-4-gm-tools.txt

  Scenario: GM prompt mentions scene creation workflow
    Tool: Bash (bun)
    Steps:
      1. Import getGMPrompt from prompts/gm
      2. Call with sample state
      3. Verify prompt text mentions write_file for scene skeleton creation
      4. Verify prompt does NOT say "交互记录随工具参数传递"
    Expected Result: Prompt correctly describes file-based scene creation and interaction log
    Failure Indicators: Missing scene creation instructions or contradictory statements
    Evidence: .sisyphus/evidence/task-4-gm-prompt.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `fix(agents): add file tools to GM and update prompt for scene creation`
  - Files: `src/agents/registry.ts`, `src/prompts/gm.ts`

- [x] 5. Actor Agent Update

  **What to do**:
  - Modify `src/agents/actor.ts` instructions function:
    - Replace `findLatestScene(storyDir)` with `buildStoryContext(storyDir, { excludeInteractionLog: true })`
    - Keep character file reading separately (buildStoryContext only provides L0+L1 summaries, Actor needs full file)
    - Pass buildStoryContext result as `storyContext` to getActorPrompt
  - Add `readFileTool` and `glob_files` to Actor agent's tools array
  - Remove `interactionLog` from ActorPromptState if it's only dead code (or leave for T9 cleanup)

  **Must NOT do**:
  - 不修改 Actor 的 model 或 maxTurns
  - 不移除 character file 的单独读取（buildStoryContext 只提供摘要）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Agent definition changes with behavioral impact (context source change)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4, T6, T7)
  - **Parallel Group**: Wave 2
  - **Blocks**: T9
  - **Blocked By**: T1, T3

  **References**:

  **Pattern References**:
  - `src/agents/actor.ts:19-36` — Current instructions function (uses findLatestScene)
  - `src/context/build-story-context.ts` — New context source (with excludeInteractionLog option from T1)
  - `src/prompts/actor.ts` — Actor prompt builder (accepts ActorPromptState)
  - `src/prompts/types.ts:ActorPromptState` — Prompt state type

  **API/Type References**:
  - `@openai/agents` — Agent instructions: async (runContext) => string pattern (already used)

  **WHY Each Reference Matters**:
  - `actor.ts:19-36` — Must replace findLatestScene with buildStoryContext
  - `build-story-context.ts` — New API with excludeInteractionLog option
  - `prompts/actor.ts` — Must ensure storyContext is passed correctly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Actor gets dynamic context via buildStoryContext
    Tool: Bash (bun)
    Steps:
      1. Import actorAgent from agents/actor
      2. Verify instructions is an async function
      3. Call instructions with a runContext containing storyDir
      4. Verify the result contains story context (not just latest scene)
    Expected Result: Actor prompt includes full story context from buildStoryContext
    Failure Indicators: Prompt only contains latest scene or is empty
    Evidence: .sisyphus/evidence/task-5-actor-context.txt

  Scenario: Actor has file read/glob tools
    Tool: Bash (bun)
    Steps:
      1. Import actorAgent
      2. Check actorAgent.tools includes readFileTool and glob_files
    Expected Result: Both tools present
    Failure Indicators: Missing tools
    Evidence: .sisyphus/evidence/task-5-actor-tools.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `fix(agents): Actor uses buildStoryContext for dynamic context`
  - Files: `src/agents/actor.ts`

- [x] 6. Scribe Agent Update

  **What to do**:
  - Convert `src/agents/scribe.ts` instructions from static string to async function:
    - `instructions: async (runContext) => { const ctx = await buildStoryContext(storyDir); return getScribePrompt({ storyContext: ctx, styleGuide: ... }); }`
    - Read style.md from disk using readNovelFile
    - Call buildStoryContext() WITHOUT excludeInteractionLog (Scribe needs the interaction log)
  - Add `readFileTool` and `glob_files` to Scribe agent's tools array
  - Update `ScribePromptState` in `src/prompts/types.ts` if needed to accept the new fields
  - Update `src/prompts/scribe.ts` to handle the new prompt state fields

  **Must NOT do**:
  - 不修改 Scribe 的 model 或 maxTurns
  - 不在此任务中修改 registry.ts 的 call_scribe 工具定义（那是 T7）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Converting static to async instructions with context injection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4, T5, T7)
  - **Parallel Group**: Wave 2
  - **Blocks**: T9
  - **Blocked By**: T1, T3

  **References**:

  **Pattern References**:
  - `src/agents/scribe.ts:9` — Current static instructions: `getScribePrompt({})`
  - `src/agents/actor.ts:19-36` — Pattern for async instructions function
  - `src/context/build-story-context.ts` — Context source to call
  - `src/prompts/scribe.ts` — Scribe prompt builder
  - `src/prompts/types.ts:ScribePromptState` — Prompt state type
  - `src/store/story-files.ts:readNovelFile` — For reading style.md

  **API/Type References**:
  - `@openai/agents` — Agent instructions: async (runContext) => string

  **WHY Each Reference Matters**:
  - `scribe.ts:9` — Must convert from static to async
  - `actor.ts:19-36` — Reference pattern for async instructions
  - `build-story-context.ts` — Scribe needs interaction log (no excludeInteractionLog)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Scribe gets dynamic context with interaction log
    Tool: Bash (bun)
    Steps:
      1. Import scribeAgent from agents/scribe
      2. Verify instructions is an async function
      3. Call instructions with runContext containing storyDir
      4. Verify result contains interaction log content
      5. Verify result contains style guide
    Expected Result: Scribe prompt includes story context + interaction log + style guide
    Failure Indicators: Prompt is static or missing interaction log
    Evidence: .sisyphus/evidence/task-6-scribe-context.txt

  Scenario: Scribe has file read/glob tools
    Tool: Bash (bun)
    Steps:
      1. Import scribeAgent
      2. Check scribeAgent.tools includes readFileTool and glob_files
    Expected Result: Both tools present
    Failure Indicators: Missing tools
    Evidence: .sisyphus/evidence/task-6-scribe-tools.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `fix(agents): Scribe uses buildStoryContext for dynamic context`
  - Files: `src/agents/scribe.ts`, `src/prompts/scribe.ts`, `src/prompts/types.ts`

- [x] 7. Registry Rewrite (Sub-agent Tools)

  **What to do**:
  - **JSON output format**: All three sub-agent tools (call_actor, call_scribe, call_archivist) return `JSON.stringify({ output: result.finalOutput, sessionId, isNewSession })` instead of plain text with `[sessionId: xxx]`
  - **Remove interactionLog parameter from call_scribe**: Remove from zod schema. Scribe gets interaction data via buildStoryContext() now (T6)
  - **Stale sessionId error**: When sessionId is provided but not found (neither in memory nor on disk), return error string: `"Error: Session ${sessionId} not found. Start a new session by calling without sessionId."`
  - **Auto-append interaction log after Actor**: Inside call_actor's execute function, after `run(actorAgent, ...)` completes successfully, call `appendInteractionLog(storyDir, characterName, result.finalOutput)` — best-effort (catch and ignore errors)
  - **Update createSubSession calls**: Pass agentName parameter ('Actor'/'Scribe'/'Archivist') and use destructured return `{ session, sessionId }`
  - **Add glob_files to Archivist tools**: Archivist already has readFileTool + writeFileTool; add glob_files

  **Must NOT do**:
  - 不自动创建新 session 当 sessionId 不存在时
  - 不让 interaction log 写入失败阻塞 Actor 结果返回
  - 不修改 customOutputExtractor（不存在）
  - 不修改 Archivist 的 readFileTool / writeFileTool 定义

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core logic changes affecting all sub-agent tools, multiple interacting concerns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4, T5, T6)
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T9
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/agents/registry.ts:80-92` — call_actor execute function (current return format)
  - `src/agents/registry.ts:123-136` — call_scribe execute function
  - `src/agents/registry.ts:167-180` — call_archivist execute function
  - `src/agents/registry.ts:100` — call_scribe interactionLog z.string() parameter (REMOVE)
  - `src/agents/registry.ts:68-74` — Stale sessionId handling (currently auto-creates)
  - `src/store/interaction-log.ts:appendInteractionLog` — Function to call after Actor
  - `src/session/manager.ts:createSubSession` — New signature with agentName + {session, sessionId} return

  **API/Type References**:
  - `@openai/agents` — `tool()` function, `run()` function
  - `zod` v4 — Schema modifications

  **WHY Each Reference Matters**:
  - `registry.ts:80-92` — Must change return format to JSON
  - `registry.ts:100` — Must remove interactionLog parameter
  - `registry.ts:68-74` — Must change stale behavior to error
  - `interaction-log.ts` — Must call appendInteractionLog after Actor run

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Sub-agent returns JSON with sessionId
    Tool: Bash (bun)
    Steps:
      1. Import call_actor tool
      2. Execute with valid input
      3. Parse result as JSON
      4. Verify { output, sessionId, isNewSession } structure
    Expected Result: Valid JSON with all three fields
    Failure Indicators: Plain text or missing fields
    Evidence: .sisyphus/evidence/task-7-json-output.txt

  Scenario: Stale sessionId returns error
    Tool: Bash (bun)
    Steps:
      1. Call call_actor with sessionId: "nonexistent-uuid"
      2. Verify result contains "Error: Session" and "not found"
    Expected Result: Error string about session not found
    Failure Indicators: New session silently created
    Evidence: .sisyphus/evidence/task-7-stale-error.txt

  Scenario: Interaction log auto-appended after Actor
    Tool: Bash (bun)
    Preconditions: .novel/.working/ directory exists
    Steps:
      1. Call call_actor with a character and direction
      2. After completion, read .novel/.working/latest-interaction.md
      3. Verify it contains the Actor's output
    Expected Result: Interaction log file updated with Actor output
    Failure Indicators: File empty or missing
    Evidence: .sisyphus/evidence/task-7-auto-append.txt

  Scenario: call_scribe has no interactionLog parameter
    Tool: Bash (bun)
    Steps:
      1. Import call_scribe tool
      2. Check zod schema parameters
      3. Verify interactionLog is NOT in the schema
    Expected Result: No interactionLog parameter in call_scribe
    Failure Indicators: interactionLog still in schema
    Evidence: .sisyphus/evidence/task-7-no-interaction-param.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `fix(agents): JSON output for sub-agents, stale error, auto-append interaction log`
  - Files: `src/agents/registry.ts`

- [x] 8. Chat Page + GET Endpoint

  **What to do**:
  - Add GET handler to `src/app/api/narrative/route.ts`:
    - Accept `projectId` query parameter
    - Call `readChatHistory(projectDir)` from chat-history module
    - Return `NextResponse.json({ messages })`
  - Update `src/app/page.tsx`:
    - On mount (when projectId changes), fetch GET /api/narrative?projectId=xxx
    - Pass fetched messages as `initialMessages` to `useChat({ transport, messages: loadedMessages })`
    - Add `id: projectId` to useChat options for stable chat identity
    - Use `onFinish` callback to persist messages: POST to a save endpoint or call saveChatHistory via API
  - Add POST handler or use existing to save chat history after each exchange
  - Handle loading state (show spinner while fetching initial messages)

  **Must NOT do**:
  - 不使用 localStorage
  - 不给 GET 端点加分页
  - 不修改 useChat 的 transport 配置

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend changes (page.tsx, API route) with UI state management
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T9)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: T2, T7

  **References**:

  **Pattern References**:
  - `src/app/page.tsx` — Current chat page with useChat
  - `src/app/api/narrative/route.ts` — Current POST handler; add GET
  - `src/session/chat-history.ts` — readChatHistory / saveChatHistory (from T2)
  - `src/project/manager.ts` — getProject for resolving projectDir from projectId

  **API/Type References**:
  - `@ai-sdk/react` — useChat options: `messages`, `id`, `onFinish`
  - `ai` — UIMessage type
  - Next.js App Router — route handlers (GET/POST)

  **WHY Each Reference Matters**:
  - `page.tsx` — Must add initialMessages loading and onFinish persistence
  - `narrative/route.ts` — Must add GET handler
  - `chat-history.ts` — Module for reading/writing chat history

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Chat history survives page refresh
    Tool: Playwright
    Preconditions: Dev server running, project created
    Steps:
      1. Navigate to http://localhost:4477
      2. Select or create a project
      3. Send a message "测试消息"
      4. Wait for response
      5. Refresh the page (F5)
      6. Wait for page to load
      7. Verify "测试消息" is still visible in chat
    Expected Result: Previous messages visible after refresh
    Failure Indicators: Chat is empty after refresh
    Evidence: .sisyphus/evidence/task-8-refresh-persist.png

  Scenario: GET endpoint returns chat history
    Tool: Bash (curl)
    Preconditions: Project with chat history
    Steps:
      1. curl http://localhost:4477/api/narrative?projectId=p001
      2. Parse JSON response
      3. Verify messages array is present and non-empty
    Expected Result: JSON with messages array
    Failure Indicators: 404 error or empty messages
    Evidence: .sisyphus/evidence/task-8-get-endpoint.txt

  Scenario: Empty project returns empty messages
    Tool: Bash (curl)
    Preconditions: New project with no chat history
    Steps:
      1. curl http://localhost:4477/api/narrative?projectId=new-project
      2. Parse JSON response
      3. Verify messages is empty array
    Expected Result: { "messages": [] }
    Failure Indicators: Error or null
    Evidence: .sisyphus/evidence/task-8-empty-project.txt
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `fix(chat): add history persistence and GET endpoint`
  - Files: `src/app/page.tsx`, `src/app/api/narrative/route.ts`

- [x] 9. Cleanup Dead Code

  **What to do**:
  - Remove `interactionLog` field from `ActorPromptState` in `src/prompts/types.ts`
  - Remove `interactionLog` field from `ScribePromptState` in `src/prompts/types.ts`
  - Remove `interactionLog` handling in `src/prompts/actor.ts` (dead branch)
  - Remove `interactionLog` handling in `src/prompts/scribe.ts` (dead branch)
  - Remove `interactionLog` parameter from `call_scribe` zod schema in `src/agents/registry.ts` (if T7 didn't already do it)
  - Remove `readInteractionLog` injection from `buildStoryContext()` if it's now handled differently (actually keep it — GM still needs it)
  - Remove any test files that test removed functionality (interaction-log-inject.test.ts if it tests the old injection path)
  - Clean up any remaining type-cast hacks

  **Must NOT do**:
  - 不删除 interaction-log.ts 本身（仍在被使用）
  - 不删除 append_interaction / clear_interaction_log 工具定义
  - 不删除 buildStoryContext 中的 readInteractionLog 注入（GM 仍需要）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Removing dead code, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T8)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: T4, T5, T6, T7

  **References**:

  **Pattern References**:
  - `src/prompts/types.ts:ActorPromptState` — Has dead interactionLog field
  - `src/prompts/types.ts:ScribePromptState` — Has dead interactionLog field
  - `src/prompts/actor.ts` — Has dead interactionLog branch
  - `src/prompts/scribe.ts` — Has dead interactionLog branch
  - `tests/unit/context/interaction-log-inject.test.ts` — May test old injection path

  **WHY Each Reference Matters**:
  - `types.ts` — Must remove dead fields
  - `actor.ts`/`scribe.ts` — Must remove dead branches
  - Test files — Must update or remove tests for deleted functionality

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: No dead interactionLog fields in prompt types
    Tool: Bash (grep)
    Steps:
      1. Search src/prompts/types.ts for "interactionLog"
      2. Verify it only appears in GMPromptState (not Actor/Scribe)
    Expected Result: interactionLog only in GMPromptState
    Failure Indicators: interactionLog still in ActorPromptState or ScribePromptState
    Evidence: .sisyphus/evidence/task-9-no-dead-fields.txt

  Scenario: Build still passes after cleanup
    Tool: Bash
    Steps:
      1. Run bun run build
    Expected Result: Build succeeds with no errors
    Failure Indicators: TypeScript errors from removed fields
    Evidence: .sisyphus/evidence/task-9-build.txt
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `cleanup: remove dead interactionLog fields from Actor/Scribe prompt types`
  - Files: `src/prompts/types.ts`, `src/prompts/actor.ts`, `src/prompts/scribe.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `bun run lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports, AI slop.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — no missing, no creep. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `fix(session): update types, path, and buildStoryContext options` - session/*, context/*
- **Wave 2**: `fix(agents): update GM/Actor/Scribe agents and registry` - agents/*, tools/*
- **Wave 3**: `fix(chat): add history persistence and cleanup dead code` - app/*, components/*

---

## Success Criteria

### Verification Commands
```bash
bun run build  # Expected: success
bun run lint   # Expected: no errors
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] Build passes
- [x] Chat history survives page refresh
- [x] Interaction log auto-appends after Actor
- [x] Sub-agent tools return JSON with sessionId
- [x] Sub-sessions at .sessions/subagent/ with agentName
- [x] GM can create scene skeletons
- [x] Actor/Scribe get dynamic context
