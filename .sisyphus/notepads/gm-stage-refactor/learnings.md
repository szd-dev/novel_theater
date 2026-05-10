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

## Character Content Flow Analysis (2026-05-11)

### Complete Call Chain: File → GM Prompt

```
STORAGE LAYER
  ├── globNovelFiles(dir, "characters")      → [entry1, entry2, ...]
  ├── readNovelFile(dir, path)                → full .md content (string)
  └── readDirectivesFile(dir, entityPath)     → *.directives.md content

EXTRACTION (src/context/extract.ts)
  ├── extractL0(content)                      → "> ..." line
  ├── extractL1(content, maxTokens=150)       → ≤3 lines from each of #身份/#当前状态/#关系/#记忆
  ├── extractSectionLines(content, name, max) → lines from any section
  └── extractCharactersInScene(sceneContent)  → ["角色A", "角色B"]

RESOLUTION (src/context/character-resolver.ts)
  ├── findCharacterByName(dir, name)          → fuzzy match (exact→substring→L0)
  └── listAllCharacters(dir)                  → [{ name, l0 }]

CONTEXT ASSEMBLY (src/context/build-story-context.ts)
  buildStoryContext(dir, config?)
    - Reads ALL character files → L0 for everyone
    - Scene characters: L0 + L1(150 tokens)
    - Non-scene characters: L0 only
    - Directives: *.directives.md for scene chars + world/plot/timeline
    - Priority sort + token budget truncation (default 10K)
    - Interaction log appended AFTER budget content

PROMPT (src/prompts/gm.ts)
  getGMPrompt(state) → core prompt + "## 故事上下文\n" + state.storyContext

AGENT (src/agents/gm.ts)
  gmAgent.instructions → buildStoryContext(storyDir, {excludeInteractionLog: true})
                       → getGMPrompt({storyContext})

ENTRY POINT (src/app/api/narrative/route.ts)
  POST → run(gmAgent, input, {context: {storyDir}})
       → gmAgent.instructions fires → full chain executed
```

### Key Facts

1. **Actor gets FULL character file** (not just L0+L1) via `readNovelFile(dir, characters/{name}.md)` in `actor.ts:18`
2. **GM gets processed content** from `buildStoryContext`:
   - Scene characters: L0 (one line) + L1 (≤3 lines from each of 身份/状态/关系/记忆, 150 token budget)
   - Non-scene: L0 only
3. **L1 extraction budget**: 150 tokens per character, only from L1_SECTIONS ("身份", "当前状态", "关系", "记忆"), max 3 lines per section
4. **Character details have priority 4** (lowest) - truncated first under budget
5. **Directives always have priority -1** - never truncated
6. **Token estimator**: simple `Math.ceil(text.length / 3)` in `token-estimator.ts`
7. **No summarization**: only truncation-based cutting (text slicing)
