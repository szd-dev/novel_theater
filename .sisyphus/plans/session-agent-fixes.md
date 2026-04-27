# Fix Session Restoration, Agent Logging & Tool Architecture

## TL;DR

> **Quick Summary**: Fix 4 issues: (1) chat history not restored on page refresh due to useChat race condition, (2) same root cause as #1, (3) add LLM system prompt logging via callModelInputFilter + JSONL, (4) remove GM's append_interaction tool (call_actor auto-appends already)
> 
> **Deliverables**:
> - Fixed chat history restoration on page refresh
> - LLM call logging to `.novel/.working/agent-logs.jsonl` (behind `DEBUG_PROMPTS` env var)
> - GM tools reduced from 8 to 7 (append_interaction removed)
> - Updated GM prompt with correct tool list and flow
> - Fixed e2e test tool assertions
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 5 → Task 6 → Final Verification

---

## Context

### Original Request
User identified 4 issues:
1. chat-history.json and history.json in gm-main directory appear redundant
2. Despite storing two copies of history, page refresh doesn't correctly restore sessions
3. No way to see the full system prompt sent to LLM when calling subagents — need logging capability
4. GM still has append_interaction tool, but call_actor already auto-appends; GM sometimes calls append_interaction INSTEAD of call_actor for the second character

### Interview Summary
**Key Discussions**:
- Chat history files: User chose to keep both (UIMessage[] for UI, AgentInputItem[] for SDK) but fix the restoration bug
- append_interaction: User chose complete removal from GM tools and prompt
- LLM logging: User chose file-persisted JSONL format
- Context building improvements (token budget, Actor interaction log visibility): User chose to defer, only fix the 4 reported issues
- Testing: No unit tests, only Agent QA scenarios

**Research Findings**:
- **Issue 2 root cause CONFIRMED**: `useChat` creates `Chat` instance in `useRef` on first render with `messages: []`. The `messages` prop is constructor-only — not watched for updates. When async fetch completes and sets `initialMessages`, Chat is NOT recreated. Only `id` prop change triggers recreation. Fix: use `setMessages` from useChat return value.
- **Issue 3 SDK API**: `callModelInputFilter` hook on `run()` intercepts `{ modelData: { instructions, input }, agent, context }` before every LLM call. Must be added to ALL 4 `run()` calls (narrative route + 3 in registry.ts) since sub-agent runs are independent invocations.
- **Issue 4 dual-write**: `call_actor` auto-appends at registry.ts:91-95 AND GM prompt instructs manual `append_interaction` calls → duplicate entries. GM sometimes bypasses Actor entirely by calling append_interaction directly.
- **E2e test pre-existing bug**: Asserts 5 tools but GM has 8. After fix should be 7.

### Metis Review
**Identified Gaps** (addressed):
- Sub-agent runs need callModelInputFilter too (not just GM) → shared utility function
- Race condition guard needed: only call setMessages when Chat's messages are empty
- GM prompt has 6 references to append_interaction (not just 3) → all must be updated
- tool-call-card.tsx has append_interaction in TOOL_META → must remove
- E2e test tool count assertion is wrong → must fix
- JSONL log entry schema must be defined upfront
- .env.example needs DEBUG_PROMPTS entry

---

## Work Objectives

### Core Objective
Fix the 4 reported issues: chat history restoration, LLM call logging, and append_interaction tool removal from GM.

### Concrete Deliverables
- `src/app/page.tsx` — Fixed useChat initialization with setMessages
- `src/lib/prompt-logger.ts` — New shared callModelInputFilter function
- `src/app/api/narrative/route.ts` — callModelInputFilter added to GM run()
- `src/agents/registry.ts` — appendInteractionTool removed; callModelInputFilter added to 3 sub-agent run() calls
- `src/prompts/gm.ts` — All append_interaction references removed; tool count updated
- `src/components/chat/tool-call-card.tsx` — append_interaction removed from TOOL_META
- `tests/integration/e2e.test.ts` — Fixed tool assertions
- `.env.example` — DEBUG_PROMPTS entry added

### Definition of Done
- [ ] Page refresh correctly restores chat history
- [ ] `DEBUG_PROMPTS=1` enables JSONL logging of all agent system prompts
- [ ] GM has exactly 7 tools (no append_interaction)
- [ ] `bun test` passes
- [ ] `bun run build` succeeds

### Must Have
- Chat messages visible after page refresh
- All 4 agents' system prompts logged when DEBUG_PROMPTS is set
- append_interaction completely removed from GM's tool list and prompt
- call_actor auto-append continues working unchanged
- clear_interaction_log tool preserved

### Must NOT Have (Guardrails)
- No mutation of modelData in callModelInputFilter (logging only)
- No log file created when DEBUG_PROMPTS is not set
- No removal of appendInteractionLog() from interaction-log.ts (used by call_actor)
- No removal of clear_interaction_log tool
- No changes to API endpoints (GET/PUT /api/narrative)
- No changes to chat-history.json format or storage path
- No changes to buildStoryContext() or interaction log injection flow
- No loading states, error boundaries, or UI changes beyond the minimal fix
- No log viewer UI or log rotation
- No context building improvements (token budget, Actor interaction log visibility)
- No new state management library

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: None (user chose no unit tests)
- **Framework**: bun test (existing tests must continue to pass)

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
Wave 1 (Start Immediately - independent fixes):
├── Task 1: Fix chat history restoration (page.tsx) [quick]
├── Task 2: Remove append_interaction from GM tools (registry.ts) [quick]
└── Task 3: Create shared prompt logger (prompt-logger.ts) [quick]

Wave 2 (After Wave 1 - dependent changes):
├── Task 4: Update GM prompt - remove append_interaction references [unspecified-high]
├── Task 5: Wire callModelInputFilter into all run() calls [quick]
└── Task 6: Update UI and tests for append_interaction removal [quick]

Wave 3 (After Wave 2 - config + verification):
└── Task 7: Add DEBUG_PROMPTS to .env.example [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → (independent) → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | - | F1-F4 |
| 2 | - | 4, 6 |
| 3 | - | 5 |
| 4 | 2 | F1-F4 |
| 5 | 3 | F1-F4 |
| 6 | 2 | F1-F4 |
| 7 | - | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **3** — T4 → `unspecified-high`, T5 → `quick`, T6 → `quick`
- **Wave 3**: **1** — T7 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix chat history restoration on page refresh

  **What to do**:
  - In `src/app/page.tsx`:
    - Remove `initialMessages` state (`useState<UIMessage[]>([])`)
    - Destructure `setMessages` from `useChat` return value
    - Remove `messages: initialMessages` prop from `useChat` options
    - In the `useEffect` that fetches chat history: replace `setInitialMessages(data.messages ?? [])` with `setMessages(data.messages ?? [])`
    - Add guard: only call `setMessages` when the Chat's current messages are empty (to avoid overwriting in-flight messages)
    - Update `useEffect` dependency array: replace `[projectId]` with `[projectId, setMessages]`
  - The fix addresses the root cause: `useChat` creates the `Chat` instance in `useRef` on first render. The `messages` prop is constructor-only — not watched for updates. When the async fetch completes and updates `initialMessages`, the Chat instance is NOT recreated. Using `setMessages` directly updates the Chat's internal state reactively.

  **Must NOT do**:
  - Do not add loading states, error boundaries, or UI skeleton
  - Do not add localStorage persistence for projectId (separate concern)
  - Do not change API endpoints (GET/PUT /api/narrative)
  - Do not change chat-history.json format or storage path
  - Do not add any state management library

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change, well-understood pattern, clear before/after
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for code change, will be used in QA

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/app/page.tsx:17-56` — Current buggy useChat + initialMessages pattern
  - `node_modules/@ai-sdk/react/dist/index.mjs:136-242` — useChat implementation showing Chat is created in useRef, only recreated on id/chat change

  **API/Type References**:
  - `node_modules/@ai-sdk/react/dist/index.d.ts:26-38` — UseChatOptions type, ChatInit with `messages?: UI_MESSAGE[]`
  - `node_modules/ai/dist/index.d.ts:3714-3758` — ChatInit interface showing `messages` is constructor-only

  **WHY Each Reference Matters**:
  - `page.tsx:17-56` — This is the exact code that needs changing. The useState + messages prop pattern must be replaced with setMessages.
  - `useChat implementation` — Proves the root cause: Chat is created once in useRef, messages prop is not reactive. setMessages is the correct API.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Chat history restored after page refresh
    Tool: Playwright
    Preconditions: Dev server running on port 4477, a project exists with at least 2 messages in chat history
    Steps:
      1. Navigate to http://localhost:4477
      2. Select the project from sidebar
      3. Verify chat messages are visible (message count > 0)
      4. Send a new message "测试消息"
      5. Wait for response to complete (status !== 'streaming')
      6. Refresh the page (page.reload())
      7. Select the same project again
      8. Assert: previous messages are visible in the message list
    Expected Result: All previous messages visible after refresh, including the new "测试消息"
    Failure Indicators: Message list is empty after refresh; only the new message appears
    Evidence: .sisyphus/evidence/task-1-chat-history-restored.png

  Scenario: Empty project shows empty chat (no crash)
    Tool: Playwright
    Preconditions: A new project exists with no chat history
    Steps:
      1. Navigate to http://localhost:4477
      2. Select the new/empty project
      3. Verify the chat area renders without errors
      4. Send a message
      5. Verify the response appears
    Expected Result: No JavaScript errors, chat works normally
    Failure Indicators: Console errors, blank screen, messages not appearing
    Evidence: .sisyphus/evidence/task-1-empty-project-chat.png
  ```

  **Commit**: YES
  - Message: `fix(chat): restore chat history on page refresh using setMessages`
  - Files: `src/app/page.tsx`

- [x] 2. Remove append_interaction tool from GM agent

  **What to do**:
  - In `src/agents/registry.ts`:
    - Delete the `appendInteractionTool` definition (lines 191-203)
    - Remove `appendInteractionTool` from `gmAgent.tools` array at line 217
    - Remove the import of `appendInteractionLog` from `@/store/interaction-log` (line 9) ONLY if it's no longer used elsewhere in the file — but it IS still used at line 92 in `callActorTool`'s auto-append, so keep the import
  - The resulting tool array: `[callActorTool, callScribeTool, callArchivistTool, clearInteractionLogTool, readFileTool, writeFileTool, globFilesTool]` (7 tools)

  **Must NOT do**:
  - Do NOT remove `appendInteractionLog()` from `src/store/interaction-log.ts` — call_actor auto-append at registry.ts:91-95 depends on it
  - Do NOT remove `clearInteractionLogTool` — still needed for scene-end cleanup
  - Do NOT remove the `appendInteractionLog` import from registry.ts — still used by call_actor
  - Do NOT change how call_actor auto-appends (lines 90-95)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Delete tool definition + remove from array, mechanical change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/agents/registry.ts:191-203` — The appendInteractionTool definition to delete
  - `src/agents/registry.ts:217` — The gmAgent.tools array to update
  - `src/agents/registry.ts:90-95` — The call_actor auto-append that must NOT be changed

  **WHY Each Reference Matters**:
  - Lines 191-203: This is the exact code block to remove
  - Line 217: Must remove appendInteractionTool from the array while preserving all other tools
  - Lines 90-95: Must verify this code is NOT touched — it's the correct auto-append mechanism

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GM has exactly 7 tools after removal
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: bun -e "const {gmAgent}=require('./src/agents/registry'); console.log(gmAgent.tools.length);"
      2. Assert output is "7"
      3. Run: bun -e "const {gmAgent}=require('./src/agents/registry'); const names=gmAgent.tools.map(t=>t.name); console.log(names.join(','));"
      4. Assert output contains "call_actor,call_scribe,call_archivist,clear_interaction_log,read_file,write_file,glob_files"
    Expected Result: GM has 7 tools, append_interaction is not among them
    Failure Indicators: Tool count is 8, or append_interaction still appears in tool names
    Evidence: .sisyphus/evidence/task-2-gm-tool-count.txt

  Scenario: append_interaction no longer in source (except interaction-log.ts)
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -rn "append_interaction" src/ --include="*.ts" --include="*.tsx" | grep -v "interaction-log.ts"
      2. Assert: only references in gm.ts prompt and tool-call-card.tsx remain (these are fixed in Tasks 4 and 6)
    Expected Result: No append_interaction tool references in registry.ts
    Failure Indicators: append_interaction still defined or in tools array
    Evidence: .sisyphus/evidence/task-2-grep-append-interaction.txt
  ```

  **Commit**: YES
  - Message: `fix(gm): remove append_interaction tool from GM agent`
  - Files: `src/agents/registry.ts`

- [x] 3. Create shared prompt logger utility

  **What to do**:
  - Create new file `src/lib/prompt-logger.ts`
  - Export a function `createPromptLogFilter(storyDir: string)` that returns a `callModelInputFilter` function
  - The filter function should:
    - Check `process.env.DEBUG_PROMPTS` — if not set, return `modelData` unchanged (no-op)
    - When set, construct a JSONL entry with: `{ timestamp, agent: agent.name, instructions: modelData.instructions, inputLength: modelData.input.length, model: agent.model }`
    - Append the entry to `.novel/.working/agent-logs.jsonl` (relative to storyDir → `join(storyDir, '.working', 'agent-logs.jsonl')`)
    - Ensure `.working/` directory exists (mkdirSync recursive)
    - Use try/catch — best-effort, never throw or block the agent run
    - Return `modelData` unchanged (logging only, zero mutation)
  - The function signature must be compatible with `RunConfig.callModelInputFilter`

  **Must NOT do**:
  - Do not log to console — only to JSONL file
  - Do not mutate modelData
  - Do not create any file when DEBUG_PROMPTS is not set
  - Do not add log rotation or size limits
  - Do not build a log viewer API endpoint

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small new file, well-defined interface, no external dependencies
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/store/interaction-log.ts:17-38` — Pattern for best-effort file writes to `.working/` directory with mkdirSync recursive
  - `src/agents/registry.ts:90-95` — Pattern for try/catch best-effort writes (don't block agent run)
  - `src/session/chat-history.ts:36-38` — Pattern for atomic file writes (tmp + rename)

  **API/Type References**:
  - `node_modules/@openai/agents-core/dist/runner/conversation.d.ts` — CallModelInputFilter type: `(args: { modelData: ModelInputData, agent: Agent, context: TContext | undefined }) => ModelInputData | Promise<ModelInputData>`
  - `node_modules/@openai/agents-core/dist/run.d.ts` — RunConfig with callModelInputFilter field

  **WHY Each Reference Matters**:
  - `interaction-log.ts` — Shows the exact pattern for writing to .working/ dir that this project uses
  - `registry.ts:90-95` — Shows the try/catch best-effort pattern for writes that must not block
  - `CallModelInputFilter` type — The exact TypeScript type the function must satisfy

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Logger creates valid JSONL file when DEBUG_PROMPTS is set
    Tool: Bash
    Preconditions: DEBUG_PROMPTS=1 in environment, a project directory with .novel/ structure exists
    Steps:
      1. Write a small test script that imports createPromptLogFilter and calls it with mock modelData
      2. Run the script with DEBUG_PROMPTS=1
      3. Check that .novel/.working/agent-logs.jsonl was created
      4. Parse each line as JSON and verify it has: timestamp, agent, instructions, inputLength fields
    Expected Result: JSONL file created with valid entries
    Failure Indicators: File not created, or entries are not valid JSON
    Evidence: .sisyphus/evidence/task-3-jsonl-created.txt

  Scenario: Logger is no-op when DEBUG_PROMPTS is not set
    Tool: Bash
    Preconditions: DEBUG_PROMPTS is not set
    Steps:
      1. Write a small test script that imports createPromptLogFilter and calls it
      2. Run WITHOUT DEBUG_PROMPTS
      3. Verify the function returns modelData unchanged
      4. Verify no file was created
    Expected Result: modelData returned unchanged, no file created
    Failure Indicators: File created, or modelData modified
    Evidence: .sisyphus/evidence/task-3-noop-without-env.txt

  Scenario: Logger doesn't crash on write failure
    Tool: Bash
    Preconditions: StoryDir points to a read-only directory
    Steps:
      1. Call createPromptLogFilter with a read-only directory
      2. Call the filter function with mock data
      3. Verify it returns modelData unchanged without throwing
    Expected Result: No error thrown, modelData returned unchanged
    Failure Indicators: Error thrown, function crashes
    Evidence: .sisyphus/evidence/task-3-write-failure-graceful.txt
  ```

  **Commit**: YES
  - Message: `feat(debug): add shared prompt logger utility`
  - Files: `src/lib/prompt-logger.ts`

- [x] 4. Update GM prompt — remove all append_interaction references

  **What to do**:
  - In `src/prompts/gm.ts`, remove/update ALL references to `append_interaction`:
    1. **Lines 128-131** (tool description #4): Delete the `append_interaction` tool description block entirely. Renumber tool #5 `clear_interaction_log` to become tool #4, and tools #6-8 become #5-7.
    2. **Lines 155-157** (tool call flow): Remove `append_interaction` from the flow sequences:
       - `新场景 → glob_files(scenes/*.md) → write_file(scenes/sXXX.md) → call_actor → ~~append_interaction →~~ call_scribe → call_archivist`
       - `角色互动场景 → call_actor → ~~append_interaction →~~ call_scribe → call_archivist`
       - `多角色对话 → call_actor(A) → ~~append_interaction →~~ call_actor(B) → ~~append_interaction →~~ call_scribe → call_archivist`
    3. **Line 107** (tool count): Change "八个工具" to "七个工具"
    4. **Line 363** (constraint): Remove `append_interaction` from the tool list: `只能调用 call_actor / call_scribe / call_archivist / ~~append_interaction /~~ clear_interaction_log / read_file / write_file / glob_files 七个工具`
    5. **Line 309**: Update wording "由 append_interaction 自动追加" → "由 call_actor 自动追加" (already partially correct in the concise version, but verify both verbosity modes)
    6. **Lines 87-92** (Phase 3 flow chart): Remove `→ 追加交互记录` step from the flow — it's now handled automatically by call_actor
    7. **Lines 516-527** (concise Phase 3): Remove `→ 追加交互记录` from the flow if present
    8. **Lines 579-600** (detailed Phase 3): Remove `→ 将 Actor 输出追加到交互记录` from the flow if present
  - Verify BOTH verbosity modes (normal and detailed) are updated correctly
  - The key message: interaction recording is automatic (via call_actor), GM does NOT need to manually append

  **Must NOT do**:
  - Do not change the clear_interaction_log references — it's still a valid tool
  - Do not change the interaction log injection mechanism description
  - Do not add new instructions about the auto-append mechanism beyond what's already there

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 675-line prompt file with multiple references across two verbosity modes, need to be thorough
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2 (append_interaction must be removed from registry first)

  **References**:

  **Pattern References**:
  - `src/prompts/gm.ts:107` — "八个工具" → change to "七个工具"
  - `src/prompts/gm.ts:128-131` — append_interaction tool description to remove
  - `src/prompts/gm.ts:155-157` — Flow sequences with append_interaction to simplify
  - `src/prompts/gm.ts:309` — Wording about append_interaction to update
  - `src/prompts/gm.ts:363` — Constraint tool list to update
  - `src/prompts/gm.ts:87-92` — Phase 3 flow chart step to remove
  - `src/prompts/gm.ts:516-527` — Concise Phase 3 references
  - `src/prompts/gm.ts:579-600` — Detailed Phase 3 references

  **WHY Each Reference Matters**:
  - Each of these lines contains a reference to append_interaction that must be removed or updated. Missing any one will confuse the LLM into thinking it should use a tool that doesn't exist.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No append_interaction references remain in GM prompt
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -n "append_interaction" src/prompts/gm.ts
      2. Assert: zero matches found
    Expected Result: No references to append_interaction in the GM prompt
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-4-gm-prompt-grep.txt

  Scenario: GM prompt describes 7 tools with correct numbering
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -n "七个工具\|7.*工具" src/prompts/gm.ts
      2. Assert: at least one match (the tool count description)
      3. Run: grep -n "clear_interaction_log" src/prompts/gm.ts
      4. Assert: still referenced (tool was NOT removed)
    Expected Result: Tool count is 7, clear_interaction_log still referenced
    Failure Indicators: Tool count is still 8, or clear_interaction_log was removed
    Evidence: .sisyphus/evidence/task-4-gm-prompt-tool-count.txt
  ```

  **Commit**: YES
  - Message: `fix(gm): update prompt to remove append_interaction references`
  - Files: `src/prompts/gm.ts`

- [x] 5. Wire callModelInputFilter into all agent run() calls

  **What to do**:
  - In `src/app/api/narrative/route.ts`:
    - Import `createPromptLogFilter` from `@/lib/prompt-logger`
    - Add `callModelInputFilter: createPromptLogFilter(storyDir)` to the `run()` options (line 65-71)
  - In `src/agents/registry.ts`:
    - Import `createPromptLogFilter` from `@/lib/prompt-logger`
    - Add `callModelInputFilter: createPromptLogFilter(storyDir)` to the 3 sub-agent `run()` calls:
      - Actor run at line 84-88
      - Scribe run at line 133-137
      - Archivist run at line 178-182
    - Note: `storyDir` is already available as a local variable in each tool's execute function
  - All 4 run() calls now log system prompts to the same JSONL file when DEBUG_PROMPTS is set

  **Must NOT do**:
  - Do not change any other run() options (maxTurns, session, context, etc.)
  - Do not add the filter conditionally based on env var — the filter itself handles that internally
  - Do not modify the stream handling or response format

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add one import + one option to each of 4 run() calls, mechanical
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: Task 3 (prompt-logger.ts must exist first)

  **References**:

  **Pattern References**:
  - `src/app/api/narrative/route.ts:65-71` — GM run() call to add filter to
  - `src/agents/registry.ts:84-88` — Actor run() call to add filter to
  - `src/agents/registry.ts:133-137` — Scribe run() call to add filter to
  - `src/agents/registry.ts:178-182` — Archivist run() call to add filter to

  **API/Type References**:
  - `node_modules/@openai/agents-core/dist/run.d.ts` — RunConfig type with callModelInputFilter field

  **WHY Each Reference Matters**:
  - Each run() call is a separate LLM invocation that needs its own filter. The top-level run() filter does NOT propagate to sub-agent runs.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 run() calls have callModelInputFilter
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -n "callModelInputFilter" src/app/api/narrative/route.ts src/agents/registry.ts
      2. Assert: 4 matches found (1 in narrative route, 3 in registry)
    Expected Result: All 4 run() calls include the filter
    Failure Indicators: Fewer than 4 matches
    Evidence: .sisyphus/evidence/task-5-filter-wired.txt

  Scenario: Build still compiles
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: bun run build
      2. Assert: build succeeds with no TypeScript errors
    Expected Result: Build exits with code 0
    Failure Indicators: TypeScript errors, build failure
    Evidence: .sisyphus/evidence/task-5-build-result.txt
  ```

  **Commit**: YES
  - Message: `feat(debug): wire callModelInputFilter into all agent run() calls`
  - Files: `src/app/api/narrative/route.ts`, `src/agents/registry.ts`

- [x] 6. Update UI and tests for append_interaction removal

  **What to do**:
  - In `src/components/chat/tool-call-card.tsx`:
    - Remove the `append_interaction` entry from `TOOL_META` (line 18)
  - In `tests/integration/e2e.test.ts`:
    - Remove the `expect(toolNames).toContain("append_interaction")` assertion (line 18)
    - Change `expect(toolNames.length).toBe(5)` to `expect(toolNames.length).toBe(7)` (line 20)
    - Add missing tool name assertions: `expect(toolNames).toContain("read_file")`, `expect(toolNames).toContain("write_file")`, `expect(toolNames).toContain("glob_files")`
    - This fixes the pre-existing bug where the test only checked 5 of 8 tools

  **Must NOT do**:
  - Do not remove the `clear_interaction_log` entry from TOOL_META
  - Do not add new UI elements or change the card rendering logic
  - Do not change other test cases in the e2e file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small changes to two files, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2 (append_interaction must be removed from registry first)

  **References**:

  **Pattern References**:
  - `src/components/chat/tool-call-card.tsx:14-20` — TOOL_META map with append_interaction entry
  - `tests/integration/e2e.test.ts:12-21` — GM tools test with wrong assertions

  **WHY Each Reference Matters**:
  - TOOL_META line 18: Must remove the entry or the UI will show a default "工具" label for the now-nonexistent append_interaction tool
  - e2e.test.ts: The test will fail after registry changes unless assertions are updated

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: E2e test passes after updates
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: bun test tests/integration/e2e.test.ts
      2. Assert: all tests pass
    Expected Result: All e2e tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-6-e2e-test-result.txt

  Scenario: TOOL_META has no append_interaction entry
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: grep "append_interaction" src/components/chat/tool-call-card.tsx
      2. Assert: zero matches
    Expected Result: No append_interaction in TOOL_META
    Failure Indicators: Match found
    Evidence: .sisyphus/evidence/task-6-tool-meta-grep.txt
  ```

  **Commit**: YES
  - Message: `fix(ui,test): update tool-call-card and e2e test for tool removal`
  - Files: `src/components/chat/tool-call-card.tsx`, `tests/integration/e2e.test.ts`

- [x] 7. Add DEBUG_PROMPTS to .env.example

  **What to do**:
  - In `.env.example`:
    - Add `DEBUG_PROMPTS=` line after the existing entries
    - Add a comment explaining what it does: `# 启用 Agent 系统提示词日志（设置为 1 启用，日志写入 .novel/.working/agent-logs.jsonl）`

  **Must NOT do**:
  - Do not set a default value (leave empty — disabled by default)
  - Do not modify .env.local

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: One-line addition to .env.example
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with any task)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.env.example:1-15` — Current env var format with comments

  **WHY Each Reference Matters**:
  - Follows the existing pattern of documented env vars in the project

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DEBUG_PROMPTS documented in .env.example
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: grep "DEBUG_PROMPTS" .env.example
      2. Assert: match found with explanatory comment
    Expected Result: DEBUG_PROMPTS entry exists in .env.example
    Failure Indicators: No match found
    Evidence: .sisyphus/evidence/task-7-env-example.txt
  ```

  **Commit**: YES
  - Message: `chore: add DEBUG_PROMPTS to .env.example`
  - Files: `.env.example`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `fix(chat): restore chat history on page refresh using setMessages` — src/app/page.tsx
- **Wave 1**: `fix(gm): remove append_interaction tool from GM agent` — src/agents/registry.ts
- **Wave 1**: `feat(debug): add shared prompt logger utility` — src/lib/prompt-logger.ts
- **Wave 2**: `fix(gm): update prompt to remove append_interaction references` — src/prompts/gm.ts
- **Wave 2**: `feat(debug): wire callModelInputFilter into all agent run() calls` — src/app/api/narrative/route.ts, src/agents/registry.ts
- **Wave 2**: `fix(ui,test): update tool-call-card and e2e test for tool removal` — src/components/chat/tool-call-card.tsx, tests/integration/e2e.test.ts
- **Wave 3**: `chore: add DEBUG_PROMPTS to .env.example` — .env.example

---

## Success Criteria

### Verification Commands
```bash
bun test                    # Expected: all tests pass
bun run build               # Expected: build succeeds
```

### Final Checklist
- [ ] Chat messages visible after page refresh
- [ ] DEBUG_PROMPTS=1 creates agent-logs.jsonl with valid JSONL entries
- [ ] GM has exactly 7 tools (no append_interaction)
- [ ] No append_interaction references in GM prompt
- [ ] call_actor auto-append still works
- [ ] clear_interaction_log tool still works
- [ ] All existing tests pass
