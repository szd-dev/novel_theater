# Decisions — GM Stage Refactor

## 2026-04-28 Session Start

### Architecture Decisions
- Reactive 4-stage flow: Orient → Script → Enact → Resolve (replaces 角色发现/场景编排/分步演绎/后处理)
- Every user input = new scene (no continuation logic)
- Initial script (初始剧本) written in Script stage, provides direction for Actor
- Actor allowed read_file/glob_files (risk accepted for character memory/distant info)
- Token budget 2000→10000 (subagent dispatch controlled, GM main session needs long context)
- Hardcoded directory tree (world files are fixed, characters/scenes only need path info)
