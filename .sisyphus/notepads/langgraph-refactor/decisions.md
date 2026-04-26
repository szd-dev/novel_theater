# LangGraph Refactor - Decisions

## Session: 2026-04-25

### Architecture Decisions
- Agent-as-Tool pattern: GM owns call_actor/call_scribe/call_archivist tools
- No handoffs (GM keeps control via asTool)
- MemorySession for session management (no SQLite/Redis/MongoDB)
- maxTurns=25 on run() options, not on Agent definition
- Dynamic instructions for GM and Actor, static for Scribe and Archivist
