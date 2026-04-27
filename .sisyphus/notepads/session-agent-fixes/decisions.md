# Decisions — session-agent-fixes

## 2026-04-27 Session Start
- Keep both chat-history.json and history.json (UIMessage[] for UI, AgentInputItem[] for SDK)
- Fix restoration bug via setMessages instead of initialMessages prop
- Complete removal of append_interaction from GM tools and prompt
- File-persisted JSONL format for LLM logging (behind DEBUG_PROMPTS env var)
- No unit tests (only Agent QA scenarios), existing tests must pass
