# Issues

(No issues recorded yet)

## F2 Code Quality Review Issues — 2026-04-25

- [WARNING] archivist.ts:117-118 — voided variables worldContent/characterContents are fetched but never used; buildStoryContext re-reads from disk
- [WARNING] archivist.ts:219-221 — outer catch swallows file write errors, returns partial changedFiles with no user indication
- [WARNING] gm.ts:124-126 — catch block has no logging (other nodes use console.error); fallback intent routes to actor with empty state
- [INFO] layout.tsx:15-17 — Default Next.js metadata not updated ("Create Next App")
- [INFO] Inconsistent config typing across graph nodes
