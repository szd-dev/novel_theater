# Learnings — Pipeline Orchestration

## Task 4: submitScheduleTool

- **OpenAI Agents `tool.invoke()` does NOT throw on Zod validation failure.** It returns an error string containing `InvalidToolInputError`. Tests must check the returned string, not use `rejects.toThrow()`.
- **`toolResult()` wraps data as `JSON.stringify({ ok: true, data })`. When the execute function itself returns `toolResult(JSON.stringify({...}))`, the result is double-encoded: `JSON.parse(result).data` yields another JSON string that must be parsed again.
- **Tool definition pattern**: `tool({ name, description, parameters: z.object({...}), execute: async (input) => {...} })` — clean and simple, no context needed if tool doesn't access storyDir.
- **Zod v4 `.min(1).max(10)` on arrays** works correctly for validation — empty arrays and arrays >10 are both rejected.

## Task 6: AgentName + ToolMeta Updates

- **Kept `'Archivist'` in AgentName type** — still used in `src/agents/registry.ts` (lines 248, 263) and `src/agents/archivist.ts` (line 9). Added 6 new sub-variants alongside it.
- **AGENT_KEY_MAP in tool-meta.ts** maps `'Archivist'` → `'archivist'`. The new `AgentName` values like `'Archivist-Characters'` are NOT yet in AGENT_KEY_MAP — downstream tasks (Pipeline) will need to update AGENT_KEY_MAP when wiring up the sub-agents.
- **Build has pre-existing failure** in `src/lib/trace-exporter.ts:98` — `Span` generic needs type arg. Unrelated to this task. LSP diagnostics on changed files are clean.
- **Tool meta pattern**: archivist sub-tools share `color: "#10B981"`, `agentKey: "archivist"`, `category: "agent"`, `headlineParam: "narrativeSummary"` — consistent with existing `call_archivist` entry.
- **submit_schedule** maps to `agentKey: "gm"`, `category: "system"` — it's a GM orchestration tool, not an agent-call tool.


## Task 2: Trace Exporter & Setup (trace-exporter.ts, trace-setup.ts)

- **TracingExporter interface**: `export(items: (Trace | Span)[], signal?: AbortSignal): Promise<void>` — Trace has `type: "trace"`, Span has `type: "trace.span"`. Use `item.type` to discriminate.
- **Span generic**: `Span<TData extends SpanData>` requires exactly 1 type argument — `Span` alone causes TS2314. Use `Span<SpanData>` for collections.
- **traceMetadata**: Spans carry `traceMetadata` from their parent Trace — set via `SpanOptions.traceMetadata`. This is where `storyDir` and `projectId` live.
- **Span construction for tests**: `new Span(options: SpanOptions<TData>, processor: TracingProcessor)` — need a TracingProcessor (can be a noop object). Span.start()/end() set startedAt/endedAt but calling start() on an already-started span prints "Span already started" warning.
- **BatchTraceProcessor**: Takes a TracingExporter in constructor, handles batching/spooling automatically.
- **setupTracing() idempotency**: Uses a module-level `tracingInitialized` flag since `addTraceProcessor` is additive — prevents duplicate processors on repeated calls.
- **models.ts overrides**: `setTracingDisabled(true)` is called at module load time in models.ts. `setupTracing()` calls `setTracingDisabled(false)` first, then adds the processor.
- **Best-effort pattern**: Wrap entire export in try/catch with empty catch (commented: "Best-effort: don't throw on write errors"). Follows same pattern as prompt-logger.ts.

## Task 5: Archivist Sub-Agent Factory + Sub-Prompts

- `Parameters<typeof Agent>` doesn't work with `@openai/agents` Agent class — use `makeInstructions` helper + inline tools in each factory instead
- Each sub-Agent's tools array must be a tuple literal (not spread from `as const` array) for TypeScript to correctly infer the Agent constructor's generic types
- Characters agent uniquely needs `writeFileTool` + `resolveCharacterTool` + `listCharactersTool` (6 tools total); all others get `readFileTool`, `editFileTool`, `globFilesTool` (3 tools)
- Sub-prompt structure: common part (role, input format, constraints, fact attribution) + responsibility-specific workflow + state block — keeps DRY while allowing per-domain customization
- Archivist workflow steps (a-j) map to responsibilities: characters=a/b/c/d/f, scene=a/b/e, world=a/b/g, plot=a/b/h, timeline=a/b/i, debts=a/b/j
- `ArchivistResponsibility` type union + `RESPONSIBILITIES` const array pattern enables exhaustive iteration in tests

## Task 1: Event Construction (rawItem Schema)

- **FunctionCallItem (for tool_called rawItem)**:
  - REQUIRED: `type: "function_call"`, `callId: string`, `name: string`, `arguments: string`
  - OPTIONAL: `id?: string`, `namespace?: string`, `status?: "in_progress"|"completed"|"incomplete"`, `providerData?: Record<string,any>`
  - `ToolCallItem` is a Zod discriminated union (function_call | hosted_tool_call | computer_call | shell_call | apply_patch_call) — NOT exported as a type from `@openai/agents-core`. Use `FunctionCallItem` for type imports.
  - `RunToolCallItem.rawItem` is typed as the full `ToolCallItem` union, so accessing `callId`, `name`, `arguments` requires narrowing via `as FunctionCallItem`

- **FunctionCallResultItem (for tool_output rawItem)**:
  - REQUIRED: `type: "function_call_result"`, `callId: string`, `name: string`, `status: "in_progress"|"completed"|"incomplete"`, `output: string | object`
  - OPTIONAL: `id?: string`, `namespace?: string`, `providerData?: Record<string,any>`
  - `RunToolCallOutputItem.rawItem` is typed as `FunctionCallResultItem | ComputerCallResultItem | ShellCallResultItem | ApplyPatchCallResultItem` — requires narrowing

- **buildUiMessageStream event mapping**:
  - `tool_called` → `tool-input-start` (toolCallId, toolName, dynamic:true) + `tool-input-available` (toolCallId, toolName, input, dynamic:true)
  - `tool_output` → `tool-output-available` (toolCallId, output, dynamic:true)
  - toolCallId resolved as: `raw.callId || raw.id || ${toolName}-${generatedUUID}`
  - toolName resolved via `getToolCallDisplayName(raw) ?? String(raw.type ?? 'tool')` — for function_call, this returns `raw.name`
  - input for function_call: `JSON.parse(raw.arguments)` — parses the JSON string
  - output: `item.output` (RunToolCallOutputItem constructor arg) takes priority over `raw.output`

- **Missing field behaviors (runtime)**:
  - Without callId but with id: `resolveToolCallId` falls back to `raw.id`
  - Without both callId and id: `resolveToolCallId` generates `${toolName}-${UUID}` fallback
  - For tool_output: `extractToolOutput` returns `null` if `raw.callId || raw.id` is falsy → event is SILENTLY DROPPED (no tool-output-available emitted)
  - Zod schemas are NOT enforced at JS construction time — objects missing required fields can be constructed but produce broken stream behavior

- **Agent construction**: `new Agent({ name: "..." })` — only `name` is required

## call-agent.ts (Wave 1, Task 3)

### Architecture
- `callAgent()` wraps `run()` in an async generator that yields `tool_called` → `tool_output` events
- `callAgentsParallel()` yields ALL `tool_called` first, then `Promise.allSettled`, then `tool_output` events
- `forwardRun()` is a simple `for await` passthrough for `StreamedRunResult`
- Result/results are exposed as separate Promises, resolved/rejected inside the generator

### rawItem minimal schema (validated by event-construction.test.ts)
- FunctionCallItem: `{ type: "function_call", callId, name, arguments }`
- FunctionCallResultItem: `{ type: "function_call_result", callId, name, status: "completed", output }`
- `callId` MUST match between paired events for UI stream adapter to correlate them

### RunResult typing
- `RunResult<TContext, TAgent>` requires 2 type args — use `RunResult<any, any>` alias
- Same for `StreamedRunResult<any, any>`

### Testing approach
- bun 1.3.9: `mock.fn` doesn't exist; use `jest.fn` from `bun:test`
- bun `mock.module` doesn't support `import.original()` — can't spread original exports in mock factory
- Solution: `_setRunFn()`/`_resetRunFn()` module-level variable pattern for testability
- `RunStreamEvent` is a union type — use `instanceof RunItemStreamEvent` to narrow before accessing `.name`/`.item`
- Mock RunResult: just `{ finalOutput } as RunResult<any, any>` — only `.finalOutput` is accessed

### Key patterns
- `crypto.randomUUID()` for toolCallId generation (same as session/manager.ts)
- `Promise.allSettled` for parallel runs with proper error propagation
- Generator captures resolve/reject callbacks from the result Promise for bidirectional signaling

## Task 7: GM Prompt Rewrite for Pipeline Architecture

- **Phase restructure**: Four-stage → Three-stage flow. Removed Phase 2 (Enact) and Phase 3 (Resolve), replaced with Phase 2 (Submit) that calls `submit_schedule`.
- **Tool table simplification**: Removed 5 tools (enact_sequence, call_actor, call_scribe, call_archivist, clear_interaction_log), added submit_schedule. Tool table now has just 4 entries: submit_schedule, read_file, write_file, glob_files.
- **GM role boundary**: Added explicit "GM 的职责到此结束" statement after submit_schedule description — clearly communicates that system handles Actor/Scribe/Archivist automatically.
- **Constraint updates**: Replaced `enact_sequence 自动管理角色会话` constraint with `submit_schedule 后无需再调用任何工具`. Updated `四阶段流程` reference to `三阶段流程`.
- **narrativeSummary**: Now passed via submit_schedule (not call_archivist), GM describes what happened in the narrative summary field.
- **Test updates**: Replaced `call_actor`/`call_scribe`/`call_archivist` presence test with absence test + submit_schedule presence test. Updated stage name tests from four-stage to three-stage. Added explicit "GM only does Orient + Script" test checking for duty-end statement.
- **Build**: Pre-existing Turbopack warning about `project-path.ts` NFT tracing — unrelated to this task.

## Task 9: Route.ts Pipeline Integration

- **`runScenePipeline` is synchronous** — it returns a `Response` directly (wraps `createAiSdkUiMessageStreamResponse` internally). No `await` needed at the call site.
- **Import removal**: Removed 4 unused imports (`run`, `createAiSdkUiMessageStreamResponse`, `gmAgent`, `createPromptLogFilter`) — all now handled inside the pipeline.
- **`join` from `node:path` still needed** — used for `storyDir` construction on line 43.
- **Signal/abort handling preserved** — the pipeline's async generator will throw on abort, caught by the existing try/catch in the POST handler.
- **Log message updated** — changed "Agent run started" to "Pipeline started" to reflect new architecture.
- **GET/PUT handlers unchanged** — they don't use the pipeline, only read/write chat history.

## Task 10: Registry Cleanup + Deprecations

- **Removed 5 tool definitions** from registry.ts: enactSequenceTool, callActorTool, callScribeTool, callArchivistTool, clearInteractionLogTool (lines 62-281 of old file).
- **Removed 7 now-unused imports**: `join` (node:path), `z` (zod), `tool`/`run` (@openai/agents), `archivistAgent` (./archivist), `appendInteractionLog`/`clearInteractionLog` (@/store/interaction-log), `toolResult`/`toolError` (@/lib/tool-result), `createPromptLogFilter` (@/lib/prompt-logger), `Session` type.
- **Kept only `addExecutionLog`** from `@/session/manager` — `createSubSession` and `getSubSession` were only used in removed tools.
- **Re-export updated**: `export { gmAgent, actorAgent, scribeAgent }` — removed `archivistAgent` since registry no longer imports it. Consumers import directly from `@/agents/archivist`.
- **e2e.test.ts required update**: Changed import from `archivistAgent` via registry to direct import from `@/agents/archivist`. Updated GM tool assertions from 8 old tools to 4 new tools.
- **Pre-existing test failures**: 8 tests fail in `interaction-log.test.ts` (6) and `narrative-pipeline.test.ts` (2) — all pre-existing, not caused by this task.
- **@deprecated pattern**: JSDoc `/** @deprecated Reason. Will be removed in next version. */` added to both `createPromptLogFilter` and `archivistAgent` exports.

## F4 Scope Fidelity Check (2026-04-30)

- All 7 "Must NOT Have" guardrails verified clean
- All 10 tasks (T1-T10) have 1:1 spec compliance
- Cross-task contamination: CLEAN (0 issues)
- `doc/architecture-comparison.md` is untracked scope creep doc — harmless but should be cleaned up before final commit
- registry.ts re-exports no longer include archivistAgent — e2e.test.ts correctly imports from `@/agents/archivist` directly
