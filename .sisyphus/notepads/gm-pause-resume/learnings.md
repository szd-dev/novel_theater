## Learnings

## 2026-05-05 Session Start
- submit-schedule.ts:31 lines, simple tool with toolResult() helper
- gm.ts:154 lines, buildCorePrompt returns Chinese prompt string
- narrative-pipeline.ts:332 lines, uses _run testability hook pattern
- call-agent.ts:171 lines, provides callAgent/callAgentsParallel/forwardRun
- tool-result.ts: toolResult() wraps data as JSON string `{ok: true, data: ...}`
- Tests use mock.module() for filesystem deps, _setRunFn/_resetRunFn for agent runs
- pipelineRunMock controls _run in narrative-pipeline.ts
- callAgentRunMock controls _run in call-agent.ts
- Tests create mock streams with createMockGmStream helper

## Wave 1 - GM Prompt Output Spec Tuning

- Line 45 (tool call flow): Changed "→完成（后续由系统自动执行）" → "→完成（后续由系统自动执行，结果将返回给你）" to signal GM that results come back.
- Output spec (§7): Added "调用 submit_schedule 后，只需简短确认（如'调度已提交'），不要输出叙事内容。系统会自动执行调度并将文学文本返回给你。" before the existing Scribe-only rule.
- `npx tsc --noEmit` on a single file shows bun-types noise in node_modules — not our issue. LSP diagnostics are the reliable check.
- Template literal inside `buildCorePrompt()` requires no special backtick escaping since the outer function uses backtick delimiters and inner backticks are already escaped with `\``.

## Wave 2 - Narrative Pipeline Refactor

- `yield*` on `AsyncGenerator<T, R>` correctly returns type `R` — no extra typing needed
- gmOutputPhase follows same pattern as gmPhase: `_run → forwardRun → completed → logAgentResult`, just with `maxTurns: 1`
- scribePhase return type change (`AsyncGenerator<RunStreamEvent>` → `AsyncGenerator<RunStreamEvent, string>`) requires explicit `return` in every code path (success + catch) — TypeScript enforces this strictly
- `clearInteractionLog` must stay between scribePhase and gmOutputPhase (not moved)
- `_run` testability hook (line 324) is shared across gmPhase and gmOutputPhase — no new import needed

## Wave 4 - Test Adaptation for GM Pause/Resume

- submit-schedule message changed from "调度计划已提交（${steps}步）" to "调度已提交，系统正在执行。请勿输出叙事内容，等待执行结果返回。" — no more step count in message
- When pipelineRunMock uses `mockResolvedValue(gmStream)`, the same stream object is returned for both gmPhase and gmOutputPhase calls — works because `[Symbol.asyncIterator]` creates a new generator each time
- `createMockGmStream` can be iterated multiple times safely (new generator per iteration, completedResolve is a no-op after first resolve)
- For "empty scribeOutput" test: `createMockRunResult("")` makes `String(finalOutput ?? "")` return `""` which is falsy, preventing gmOutputPhase
- Session reuse verification: check `(pipelineRunMock.mock.calls[N][2] as any).session` — both calls should reference the same gmSession object
- gmOutputPhase identifiable in mock calls by `maxTurns: 1` vs gmPhase's `maxTurns: 25`
