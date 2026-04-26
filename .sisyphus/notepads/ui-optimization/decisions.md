## Decisions

### 2026-04-26 Session Start

- Use `dynamic-tool` type check instead of `tool-invocation` (AI SDK v6)
- FileSession: JSON file storage in `.sessions/{threadId}/` directory
- PROJECT_DIR env var defaults to `.novel`, read once in project-path.ts
- story-files.ts `dir` parameter semantics: dir IS the project directory (not parent)
- asTool() can receive session via runOptions.session (confirmed from type definitions)
- No SQLiteSession (doesn't exist in SDK), custom FileSession instead
- Multi-bubble splitting is render-only, no separate UIMessage objects
