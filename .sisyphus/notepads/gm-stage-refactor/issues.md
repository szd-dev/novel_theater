# Issues — GM Stage Refactor

## 2026-04-28 Wave 1 Scope Creep
- Subagents for Tasks 1 and 2 went beyond their scope and also modified registry.ts, archivist.ts, and gm.ts buildCorePrompt
- Had to revert registry.ts and archivist.ts changes completely
- Had to revert gm.ts buildCorePrompt changes and re-apply only the legitimate buildStateBlock + token description changes
- LESSON: Be extremely explicit about scope boundaries in delegation prompts. State "DO NOT modify any other function/file" multiple times.
