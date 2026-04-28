# Learnings — GM Stage Refactor

## 2026-04-28 Session Start

### Codebase Patterns
- validation.ts: `isValidSceneFile()` uses simple array + `.every()` — trivial to add new required section
- types.ts: GMPromptState has 4 dead fields (currentSceneId, currentLocation, currentTime, activeCharacter) — never populated in gm.ts agent
- build-story-context.ts: sections array pattern with priority-based sorting + token budget truncation
- extract.ts: `extractSectionLines(content, sectionName, maxLines)` reusable for extracting 经过/关键事实 from previous scene
- extract.ts: `findLatestScene(dir)` returns the highest-numbered scene file
- gm.ts buildStateBlock: references dead fields in lines 17-20, must be cleaned
- gm.ts buildCorePrompt: 202 lines, needs complete rewrite (not incremental patch)
- actor.ts: buildActorCore is 114 lines, new sections insert before 知识边界
- archivist.ts: scene template in lines 88-104, needs ## 初始剧本 between 在场角色 and 经过
- registry.ts: callActorTool maxTurns=25 at line 89

### Key Decisions
- DEFAULT_TOKEN_BUDGET: 2000 → 10000
- Actor maxTurns: 25 → 10
- New sections: 故事进度 (priority -1), 前序场景 (priority 0), 文件目录 (priority 3)
- Directory tree is hardcoded (not dynamic scan)
- Scene count uses globNovelFiles("scenes/*.md").length
