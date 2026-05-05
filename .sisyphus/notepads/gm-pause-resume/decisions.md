## Decisions

## 2026-05-05 Session Start
- Wave 1: Tasks 1+2 can run in parallel (no file conflicts)
- Task 3 depends on Tasks 1+2 semantically but not code-wise
- scribePhase already extracts literaryText on line 199, just needs to return it
- gmOutputPhase should follow gmPhase pattern (lines 95-126) with maxTurns:1
- clearInteractionLog should stay where it is (after scribePhase, before gmOutputPhase)
