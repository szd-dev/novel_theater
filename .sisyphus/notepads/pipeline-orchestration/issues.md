# Issues — Pipeline Orchestration


## F2 Code Quality Review (2026-04-30)

### Blocking Issues Found

1. **`as any` violations** (project convention forbids `as any`):
   - `src/pipeline/call-agent.ts:6-7` — `RunResult<any, any>` / `StreamedRunResult<any, any>` type aliases
   - `src/pipeline/narrative-pipeline.ts:22,104` — same pattern + cast
   - `src/agents/registry.ts:23,35` — same pattern in function signatures

2. **Dead code in `src/agents/registry.ts`**:
   - `addExecutionLog` imported but unused (line 5)
   - `getRunContext()` defined but never called (lines 17-21)
   - `buildExecutionLog()` defined but never called (lines 32-53)
   - `projectId` parameter unused (line 36)

3. **8 test failures**:
   - 2 in `narrative-pipeline.test.ts` (Actor failure handling)
   - 6 in `interaction-log.test.ts` (functions returning undefined)

### Non-Blocking
- `_lang` unused in prompts — intentional pre-i18n pattern
- Lint `as any` in test files — out of source review scope but should be addressed

## F1 Plan Compliance Audit (2026-04-30)

### Must Have Failure: Execution Log Not Recorded

- **Requirement**: "执行日志（ExecutionLog）持续记录" — Must Have #5
- **Finding**: Pipeline has zero `addExecutionLog` calls. Old GM tools that recorded execution logs were removed without replacement.
- **Affected code**:
  - `src/pipeline/narrative-pipeline.ts` — `enactPhase()`, `scribePhase()`, `archivistDagPhase()` all lack execution log recording
  - `src/agents/registry.ts:5` — `addExecutionLog` imported but unused (dead code)
  - `src/agents/registry.ts:32-53` — `buildExecutionLog()` defined but never called (dead code)
- **Fix needed**: Add `buildExecutionLog()` + `addExecutionLog()` calls after each `callAgent`/`callAgentsParallel` in the pipeline, matching the pattern from the old tool implementations.
- **Impact**: API endpoint consuming execution log data will return empty/stale results. Token usage and tool call chain tracking is lost for pipeline runs.

### Overall Audit Score
Must Have [8/9] | Must NOT Have [6/6] | Deliverables [13/13] | VERDICT: REJECT
