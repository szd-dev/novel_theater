<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 自由剧场 (Novel Theater) — Agent Guide

Multi-agent interactive narrative engine. Next.js 16 + OpenAI Agents JS + Vercel AI SDK + shadcn/ui.

## Build / Lint / Test

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun dev` | Dev server on port 4477 |
| `bun run build` | Production build (`next build`) |
| `bun run lint` | ESLint (core-web-vitals + typescript config) |
| `bun test` | Run all tests |
| `bun test tests/unit/prompts/gm.test.ts` | Run a single test file |
| `bun test tests/unit/context/` | Run all tests in a directory |
| `bun test --watch` | Watch mode |

Package manager: **Bun** (not npm/yarn/pnpm). Test runner: **Bun built-in** (`bun:test`).

## Project Structure

```
src/
├── app/                    # Next.js App Router (page, layout, api/)
├── agents/                 # Agent definitions (gm, actor, scribe, archivist, registry)
├── prompts/                # System prompt functions (pure: state → string)
├── tools/                  # Agent tool definitions (zod schemas)
├── context/                # Story context assembly (priority-based truncation)
├── session/                # Session management (per-thread, per-character)
├── store/                  # .novel/ file I/O
├── lib/                    # Shared utilities (models, retry, templates, cn)
└── components/
    ├── chat/               # Chat UI components
    └── ui/                 # shadcn/ui base components (base-nova style)
tests/
├── unit/                   # Unit tests (mirrors src/ structure)
└── integration/            # Integration tests (agent architecture, story APIs)
```

## Code Style

### TypeScript

- **Strict mode** enabled (`tsconfig.json: strict: true`)
- Path alias: `@/*` → `./src/*`
- `interface` for object shapes; `type` for unions, aliases, and utility types
- `import type` for type-only imports (enforced in tests and type files)
- No `as any`, `@ts-ignore`, or `@ts-expect-error`

### Exports

- **Named exports** for components, utilities, agents, and tools
- **Default exports** only for Next.js pages and layouts (`page.tsx`, `layout.tsx`)
- Re-export pattern in `registry.ts`: `export { gmAgent, actorAgent, scribeAgent, archivistAgent }`

### Components

- `"use client"` directive at top of client components
- Function declarations (not arrow functions): `export function ChatInput({ ... }) {}`
- Props defined as `interface` directly above the component
- shadcn/ui components via `@/components/ui` alias
- Tailwind CSS v4 with `@tailwindcss/postcss` plugin
- CSS utility: `cn()` from `@/lib/utils` (clsx + tailwind-merge)

### Imports — Order

1. `"use client"` directive (if needed) — always first
2. Node.js built-ins (`node:fs`, `node:path`) — using `node:` prefix
3. React / Next.js built-ins
4. External packages (`@openai/agents`, `@ai-sdk/*`, `ai`, `zod`)
5. Type-only imports (`import type { ... }`) — can be interspersed or separated
6. **Blank line**
7. Internal aliases (`@/agents/*`, `@/lib/*`, `@/components/*`)
8. Relative imports (`./`, `../`)
9. Inline type imports last or mixed in (`import { type FormEvent } from "react"`)

### Quotes

No enforced quote style — both single and double quotes exist. Stay consistent within a file.

### Logging

Structured prefix format in API routes and services:
```typescript
console.log(`[API /narrative] Request start, threadId=${threadIdFinal}`);
console.error('[API /narrative] Error after', Date.now() - startTime, 'ms:', error);
```

### Naming

- **Files**: kebab-case (`build-story-context.ts`, `chat-input.tsx`)
- **Directories**: kebab-case
- **Variables/functions**: camelCase (`buildStoryContext`, `extractL0`, `getGMPrompt`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_TOKEN_BUDGET`, `TEMPLATES`, `AGENT_COLORS`)
- **Types/interfaces**: PascalCase, no `I` prefix (`StorySession`, `GMPromptState`)
- **Boolean functions**: `is`/`has` prefix (`isSafePath`, `isValidCharacterFile`)
- **Factory/getter functions**: `get` prefix (`getModel`, `getGMPrompt`)
- **Agent instances**: camelCase + `Agent` suffix (`gmAgent`, `actorAgent`)
- **Tool instances**: camelCase + `Tool` suffix (`readFileTool`, `resolveCharacterTool`)
- **Tool names (for AI)**: snake_case (`call_actor`, `read_file`, `resolve_character`)

### Error Handling

- API routes: try/catch with structured JSON responses (two formats)
  ```typescript
  // Format 1 — narrative route
  catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
  // Format 2 — story/status/sessions routes
  return NextResponse.json({ success: false, message: '...' }, { status: 400 });
  ```
- Agent tools: return descriptive error strings (never throw)
  ```typescript
  return `Error: Unsafe path "${input.path}". Path traversal (..) and absolute paths are not allowed.`;
  ```
- Retry utility: `withRetry()` in `src/lib/retry.ts` — exponential backoff + jitter
- Error type guards: `isRateLimitError()`, `isNetworkError()` in `src/lib/retry.ts`
- Path safety: `isSafePath()` validates against `..` and absolute paths
- Content validation: `isValidCharacterFile()`, `isValidSceneFile()` check markdown structure
- No empty catch blocks (except intentional silent catches with comment)

### Agent Patterns

- **Agent-as-Tool**: GM orchestrates via `asTool()` — sub-agents are tools, not graph nodes
- **Prompt functions are pure**: `getGMPrompt(state: GMPromptState): string` — no side effects
- **Zod for tool parameters**: every tool uses `z.object({...})` with `.describe()` on each field
- **customOutputExtractor**: controls what GM sees from sub-agent results
- **Session per character**: `DynamicCharacterSession` resolves to per-character session at runtime
- **Context injection**: `buildStoryContext()` with priority-based token budget truncation (2000 token default)

## Testing

- Framework: **Bun test** (`import { describe, test, expect } from "bun:test"`)
- File pattern: `*.test.ts`
- Structure mirrors `src/`: `tests/unit/context/`, `tests/unit/prompts/`, `tests/unit/store/`
- Filesystem tests use `mkdtempSync`/`rmSync` with `beforeAll`/`afterAll` cleanup
- No mocks — tests use real filesystem with temp directories
- Integration tests in `tests/integration/e2e.test.ts` verify agent architecture and session management

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `next` 16.2 | App Router, RSC, route handlers |
| `@openai/agents` | Agent, Runner, Session, tool(), asTool() |
| `@openai/agents-extensions` | aisdk() provider bridge, AI SDK UI stream adapter |
| `ai` + `@ai-sdk/react` | UIMessage types, useChat() hook |
| `@ai-sdk/anthropic` + `@ai-sdk/openai` | LLM providers |
| `zod` v4 | Tool parameter validation |
| `shadcn` (base-nova) | UI component library |
| `tailwindcss` v4 | Styling |

## Story Data (.novel/)

Runtime story state stored as markdown files in `.novel/` directory (gitignored):

| File | Content |
|------|---------|
| `world.md` | World settings — locations, factions, rules |
| `style.md` | Style guide — POV, pacing, language |
| `timeline.md` | Timeline — eras, known time points |
| `plot.md` | Plot lines — main + subplots |
| `characters/*.md` | Character files (heading + L0 quote + sections) |
| `scenes/*.md` | Scene records (location, time, characters, events) |

Character files must have `# Name` heading and `> ` L0 line. Scene files must have `## 地点`, `## 时间`, `## 在场角色`, `## 经过` sections.
