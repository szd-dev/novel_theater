# Decisions

## 2026-04-25 Architecture Decisions (from ARCHITECTURE.md)
- Code-driven routing (LLM outputs structured data → code validates and constructs Command)
- interactionLog in State (not files) - eliminates append_interaction/end_interaction tools
- .novel/ files as authoritative state source, Store API as runtime cache
- Archivist as a graph node (not independent service)
- Tests-after approach (implement first, test later)
