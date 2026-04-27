# Learnings — session-agent-fixes

## 2026-04-27 Session Start
- Plan has 7 implementation tasks + 4 final verification tasks = 11 total
- Wave 1 (parallel): Tasks 1, 2, 3
- Wave 2 (parallel, after Wave 1): Tasks 4, 5, 6
- Wave 3: Task 7
- Final Wave: F1-F4 in parallel
- Key root cause: useChat creates Chat instance in useRef on first render, messages prop is constructor-only
- append_interaction dual-write: call_actor auto-appends AND GM prompt instructs manual append
- callModelInputFilter must be added to ALL 4 run() calls (GM + 3 sub-agents)
