# Learnings — lexical-chat-input

## 2026-04-29 Initial Exploration

### Current ChatInput
- Simple textarea with composing (IME) state tracking
- Props: `{ input, onInputChange, onSubmit, status, onStop }`
- Enter submits (unless Shift held or composing), Shift+Enter inserts newline
- Auto-height: `Math.min(el.scrollHeight, 160px)` (max-h-40 = 160px)
- Disabled when `status === "submitted" || status === "streaming"`
- Stop button replaces Send button when disabled

### Current page.tsx Integration
- `input`/`setInput` state managed in ProjectChat
- `handleSubmit` extracts `input.trim()`, calls `sendMessage({ text })`, clears input
- ChatInput props: `input={input} onInputChange={setInput} onSubmit={handleSubmit} status={status} onStop={handleStop}`

### API Pattern (projects/[id]/files/route.ts)
- `params: Promise<{ id: string }>` (Next.js 16 async params)
- `getProject(id)` → check if project exists → 404 if not
- `join(project.dataDir, getProjectDir())` → storyDir
- Error handling: try/catch with `NextResponse.json({ success: false, message }, { status })`

### Character Data
- `listAllCharacters(dir)` in `src/context/character-resolver.ts` returns `{ name: string; l0: string }[]`
- Uses `globNovelFiles(dir, "characters")` + `readNovelFile` + `extractL0`

### Polling Pattern (scene-indicator.tsx)
- `useCallback` for fetch function
- `useEffect` with `setInterval(fetchStatus, 5000)` + cleanup

### AGENT_COLORS
- `actor: "#EC4899"` — this is the color for character/actor mentions
- CharacterLabel uses: `color` prop, `backgroundColor: ${color}15`, with small dot indicator

## 2026-04-29: Lexical Dependency Installation

- `@lexical/clear-editor` does NOT exist as a separate npm package. The `ClearEditorPlugin` is included in `@lexical/react`.
- All Lexical packages installed at version 0.44.0.
- `lexical-beautiful-mentions` installed at 0.1.48 (compatible with lexical >=0.11.0).
- Build passes cleanly after install — no peer dep issues with React 19.2 or Next.js 16.2.
- 6 packages installed: `lexical`, `@lexical/react`, `@lexical/plain-text`, `@lexical/history`, `@lexical/list`, `lexical-beautiful-mentions`.

## Characters API + Hook (T2)

- API route pattern: `params: Promise<{ id: string }>` — must `await params` to destructure `id`
- `getProject(id)` returns `Project | undefined` — check undefined → 404
- `join(project.dataDir, getProjectDir())` computes storyDir
- `listAllCharacters(storyDir)` returns `{ name: string; l0: string }[]`
- Polling pattern: `useCallback` for fetch + `useEffect` with `setInterval(fn, 5000)` + cleanup `clearInterval`
- Empty catch blocks use existing `// Silently fail — don't block chat` comment pattern from scene-indicator.tsx
- Hook guards: `if (!projectId) return` to skip fetch when projectId is falsy

## 2026-04-29: Lexical Editor Core Component (T3)

### Key API Discoveries
- `ContentEditable` in Lexical 0.44.0 requires BOTH `aria-placeholder` AND `placeholder` props (union type — either both absent or both present)
- `$findBeautifulMentionNodes` is NOT exported from `lexical-beautiful-mentions` main index (not in `mention-utils` re-export). Must use `$isBeautifulMentionNode` + custom tree traversal instead.
- `BeautifulMentionsMenuProps` and `BeautifulMentionsMenuItemProps` are proper types to use for menuComponent/menuItemComponent — they extend `ComponentPropsWithRef<any>` and don't overlap with regular HTML div props, so you can't spread them onto a `<div>`.
- `INSERT_LINE_BREAK_COMMAND` from `lexical` is the correct way to insert a line break (Shift+Enter) — it creates a `LineBreakNode` within the current paragraph rather than inserting a new paragraph (`INSERT_PARAGRAPH_COMMAND`).
- `BeautifulMentionNode.getData()` returns `Record<string, BeautifulMentionsItemData> | undefined` where `BeautifulMentionsItemData = string | boolean | number | null`.
- The `BeautifulMentionsTheme` uses trigger strings as keys (e.g. `"@"`), with values being either a CSS class string or a `BeautifulMentionsCssClassNames` object with `container`, `containerFocused`, `trigger`, `value` keys.
- `useBeautifulMentions()` hook provides `getMentions()` as an alternative to custom tree traversal, but requires being used inside a component wrapped by `LexicalComposer`.

### Critical Bugs Fixed in Rewrite
- **submit-on-enter.tsx**: Cannot dispatch `CLEAR_EDITOR_COMMAND` inside `editor.read()` — it's a read-only context. Fix: extract text/mentions into local variables inside `editor.read()`, then dispatch `CLEAR_EDITOR_COMMAND` outside.
- **submit-on-enter.tsx**: Must use `useRef` for `menuOpen` prop to avoid stale closure in `KEY_ENTER_COMMAND` handler (since the effect only re-registers on `[editor, onSend]` change).
- **editor.tsx**: `createBeautifulMentionNode()` returns `[CustomBeautifulMentionNodeClass, LexicalNodeReplacement]` — must spread into nodes array: `nodes: [...CustomMentionNode]`.
- **editor.tsx**: Custom MentionComponent using `forwardRef<HTMLDivElement, BeautifulMentionComponentProps>` — renders pill with inline styles matching CharacterLabel pattern (`color`, `backgroundColor: ${color}15`, dot indicator).
- **mention-menu.tsx**: `BeautifulMentionsMenuProps` extends `ComponentPropsWithRef<any>`, so spread `...props` onto `<ul>` works. `BeautifulMentionsMenuItemProps` has `selected`, `item` (with `data?.l0`) plus spreadable HTML props.
- **auto-resize.tsx**: Use `requestAnimationFrame` in `registerUpdateListener` callback to ensure DOM is updated before measuring `scrollHeight`.

## Task 5: chat-input.tsx rewrite + page.tsx integration

- `next/dynamic` with `ssr: false` works cleanly for Lexical — no hydration mismatch
- Dynamic import pattern: `dynamic(() => import("./path").then(m => m.NamedExport), { ssr: false })`
- When removing `input`/`setInput` from page.tsx, `useState` may still be needed for other state (e.g., `sheetContent`)
- `_mentions` prefix underscore avoids "unused param" lint warnings while keeping the signature clear
- The `<form>` wrapper was removed since Lexical handles submit via Enter key plugin, not form submission
- Stop button condition changed from ternary (show Send vs Stop) to just conditionally showing Stop — no explicit Send button needed
- `sendMessage({ text })` from `@ai-sdk/react`'s `useChat` works without form events — just pass the text string
- Build warning about NFT tracing in `project-path.ts` is pre-existing, not related to this change
