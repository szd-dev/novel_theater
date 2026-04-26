# LangGraph Refactor - Learnings

## Session: 2026-04-25

### Initial State
- Project: 自由剧场 v2 (Novel Theater)
- Current stack: Next.js 16 + LangGraph.js + Vercel AI SDK + OpenAI
- Key directories: src/graph/ (LangGraph orchestration), src/prompts/, src/context/, src/store/, src/lib/
- 17 tasks total (13 implementation + 4 final verification)
- 4 execution waves + final verification wave

### Wave Execution Plan
- Wave 1: T1 (deps+models), T2 (tools), T3 (session), T4 (GM prompt) — ALL parallel
- Wave 2: T5 (Actor), T6 (Scribe), T7 (Archivist) parallel → T8 (GM+registry) sequential
- Wave 3: T9 (API routes), T10 (frontend) parallel → T11 (delete LangGraph) sequential
- Wave 4: T12 (tests) → T13 (build+cleanup) sequential
- Final: F1-F4 all parallel

### Key Learnings
- `@openai/agents` v0.8.5 does NOT have `inputBuilder` in `asTool()` API — plan specified it but SDK doesn't support it. Default behavior handles input formatting.
- `createOpenAI()` / `createAnthropic()` are factory functions that return provider instances: `const provider = createOpenAI({ baseURL }); const model = provider('model-name')`
- `MemorySession` constructor: `new MemorySession()` — no required args
- `aisdk()` from `@openai/agents-extensions/ai-sdk` bridges AI SDK models to OpenAI Agents JS format
- `createAiSdkUiMessageStreamResponse(stream)` from `@openai/agents-extensions/ai-sdk-ui` bridges agent stream to AI SDK UI stream
- Agent `tools` property is mutable — can set after construction: `gmAgent.tools = [...]`
- Dynamic instructions: `async (runContext) => string` — `runContext.context` is typed as `unknown`, use type assertion
