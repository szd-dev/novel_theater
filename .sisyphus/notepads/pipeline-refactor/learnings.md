# Learnings

## 2026-05-06: tool-progress.ts created

- Created `src/lib/tool-progress.ts` — in-memory Map-based progress store for pipeline execution tracking.
- Uses `Map<string, Map<string, ToolProgress>>` pattern (projectId → toolName → progress).
- Exports: `setToolProgress`, `getToolProgress`, `clearToolProgress`, `_resetToolProgress` (test hook).
- `getToolProgress` returns a plain object copy via `Object.fromEntries()` to prevent mutation.
- `clearToolProgress` cleans up inner map entry and removes the project entry when empty.
- All 8 tests pass. Test isolation via `beforeEach` calling `_resetToolProgress()`.
- Comment rule caught an unnecessary `// Should not throw` comment — removed it since the test name was self-explanatory.

## 2026-05-06: Pipeline phase extraction (Task 2)

- Created `src/pipeline/enact-phase.ts` — exports `runEnactPhase(schedule, storyDir, projectId, projectDir)`
  - Non-streaming: uses `run()` from `@openai/agents` directly (no `call-agent.ts`, no `_run` pattern)
  - Manages per-character session cache via `createSubSession`
  - Calls `clearInteractionLog` at start, `appendInteractionLog` after each actor
  - Catches per-actor errors; one failure doesn't abort the pipeline
  - Returns `{ steps: EnactStep[], interactionLog: string }`
  - 12 tests, all pass

- Created `src/pipeline/scribe-archivist-phase.ts` — exports `runScribeAndArchivist(narrativeSummary, storyDir)`
  - Non-streaming Scribe run with `maxTurns: 25`
  - Archivist DAG: Characters → Promise.allSettled(Scene/World/Plot/Timeline) → Debts
  - All archivist agents run regardless of failures in earlier steps
  - Returns `{ scribeOutput: string, archivistDone: boolean }`
  - 13 tests, all pass

- Full test suite: 318 pass, 0 fail
- Build: passes cleanly
- Lint: `RunResult<any, any>` pattern matches existing `narrative-pipeline.ts:23` convention
- Existing narrative-pipeline.ts left UNCHANGED (will be deleted in later task)
