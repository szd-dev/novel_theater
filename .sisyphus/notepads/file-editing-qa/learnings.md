# Learnings — File Editing QA

## Key API change: `dir` is the novel directory
- `initStory(dir)`, `archiveStory(dir, ...)`, `resetStory(dir)` — `dir` IS the `.novel/` directory path, NOT the parent
- `archiveStory` puts archives at `join(dirname(dir), ".archive")` — sibling of the novel dir
- `initStory` checks `existsSync(dir)` first — if directory exists, returns "already initialized"
- Tests must use a non-existent path for `dir`, e.g. `join(mkdtempSync(...), ".novel")`

## File editing architecture
- API route: `src/app/api/projects/[id]/files/route.ts` — GET (pattern/path), PUT (with optimistic locking via hash), DELETE
- Components: `story-file-tree.tsx` → sidebar file tree, `code-mirror-editor.tsx` → CodeMirror, `file-editor-sheet.tsx` → sheet with tabs
- `use-autosave.ts` hook: debounce (1.5s), Cmd+S, flush on unmount
- Directives: `.directives.md` files, edited via `isDirectives: true` flag in PUT body
