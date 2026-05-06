# Decisions

## 2026-05-06: gm.ts prompt adapted for submit_schedule pipeline

- **Tool table**: Added 4-tool table (read_file, write_file, glob_files, submit_schedule) following stable version's pattern.
- **3-stage flow**: Kept 三阶段流程 (Orient → Script → Submit) instead of stable version's 4-stage (Orient → Script → Enact → Resolve), since submit_schedule replaces enact_sequence + call_scribe + call_archivist + clear_interaction_log in one call.
- **Post-submit description**: Added explicit instruction that after submit_schedule, GM waits for scribeOutput and presents literary text to user. The sentence "submit_schedule 调用后，系统将自动按顺序执行 Actor 演绎、Scribe 文学化、Archivist 归档。完成后返回文学文本给你。" was added to the Submit stage.
- **No 叙事摘要格式 section**: Stable version had this as a separate section, but since submit_schedule takes narrativeSummary as a direct parameter, no separate section is needed.
- **No changes to**: 角色定义, 场景骨架, 约束, 错误处理, 输出规范 sections — kept identical to stable version's content.
- **Removed**: All references to enact_sequence, call_actor, call_scribe, call_archivist, clear_interaction_log, gmOutputPhase, createSceneStream.

## 2026-05-06: submit_schedule rewritten (Task 3)

- **Blocking pipeline runner**: `execute` handler now calls `runEnactPhase` and `runScribeAndArchivist` synchronously (non-streaming). Returns `toolResult` with `{ scribeOutput, steps }` on success, `toolError` on failure.
- **Progress reporting**: Calls `setToolProgress` at 3 boundaries: before enact (phase: "actor", step: 0), before scribe (phase: "scribe", step: schedule.length+1), after archivist (status: "completed"). `total = schedule.length + 3`.
- **Error handling**: Wrapped in try/catch — `clearToolProgress` called on both success and error paths. Non-Error exceptions handled via `String(error)`.
- **Context extraction**: `runContext.context` cast to `{ projectId, projectDir, storyDir }`. `storyDir` computed dynamically: `ctx.storyDir ?? join(ctx.projectDir!, '.novel')`.
- **Test hooks**: Added `_setRunEnactPhase` / `_resetRunEnactPhase` (same for scribeAndArchivist, setToolProgress, clearToolProgress) — following the `narrative-pipeline.ts` `_setRunFn` pattern. This avoids `mock.module` which causes cross-test interference in Bun when multiple test files mock the same module.
- **No forbidden imports**: No `call-agent.ts`, no `narrative-pipeline.ts`, no streaming (for await/generators).
- **Test coverage**: 13 tests — correct arguments, progress updates (phase boundaries, order, totals), success/failure return values, clear on error, storyDir fallback, non-Error exceptions, scribe-not-called-after-enact-fail.
- **Full test suite**: 325 pass, 0 fail (no cross-test interference).
