# GM 四阶段流程重构 + 上下文注入增强

## TL;DR

> **Quick Summary**: 重构 GM prompt 从有缺陷的"规划-执行"四阶段改为反应式四阶段（Orient→Script→Enact→Resolve），同时增强上下文注入（场景计数/前序摘要/目录结构/10k预算），给 Actor 添加工具指引，更新场景骨架格式（新增初始剧本）。
> 
> **Deliverables**:
> - 重写后的 GM prompt（四阶段反应式流程）
> - 增强后的 buildStoryContext（3 个新注入项 + 10k 预算）
> - 更新后的场景骨架格式（含 ## 初始剧本）
> - Actor prompt 新增工具指引 + 初始剧本段落
> - Archivist prompt 场景模板同步更新
> - 验证/测试全量通过
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → Task 8

---

## Context

### Original Request
用户认为当前 GM 的阶段流程存在根本问题：阶段2混合了信息获取和场景编排，阶段3依赖阶段2的"幽灵计划"（交互序列），而 AI 无法可靠地跨步骤维持内部规划。需要重构为反应式流程，同时增强上下文注入。

### Interview Summary
**Key Discussions**:
- 取消"先规划后执行"，改为"边执行边决策"的反应式循环
- 每轮用户输入 = 新场景（无条件），删除场景延续逻辑
- 场景编写独立为专门阶段（Script），产出"初始剧本"作为 Actor 指南
- Actor 允许使用 read_file/glob_files（接受风险，角色记忆/久远信息需要主动查询）
- Token 预算 2000→10000（subagent 调度可控，GM 主会话长上下文是必要代价）
- 目录结构硬编码注入（世界设定文件固定，角色/场景只需告知路径）

**Research Findings**:
- Actor 已有 readFileTool + globFilesTool（actor.ts line 30），无需代码改动
- buildStoryContext 被 4 个 agent 共用，预算变更影响全部
- extract.ts 的 extractSectionLines() 可复用提取"经过"/"关键事实"段落
- GMPromptState 的 currentSceneId/currentLocation/currentTime/activeCharacter 从未被填充（死代码）

### Metis Review
**Identified Gaps** (addressed):
- Archivist 场景模板也需同步添加 ## 初始剧本（3 路同步：validation + GM prompt + Archivist prompt）
- ## 用户意图 与 ## 初始剧本 共存（不同用途：意图=用户要求，剧本=导演规划）
- "每轮=新场景"需保留 OOC/回忆等非场景路径的逃生舱
- 前序场景摘要只需提取 经过+关键事实，不是完整场景内容
- 交互记录注入行为不变（仍在预算外追加）
- GMPromptState 死字段应随本次改动一并清理

---

## Work Objectives

### Core Objective
重构 GM 为反应式四阶段流程，增强上下文注入，使 AI 通过工具调用检查点而非内部规划来驱动场景演绎。

### Concrete Deliverables
- `src/prompts/gm.ts` — 完整重写 buildCorePrompt()
- `src/prompts/types.ts` — 移除 GMPromptState 死字段
- `src/prompts/actor.ts` — 新增工具指引 + 初始剧本 + 交互记录段落
- `src/prompts/archivist.ts` — 场景模板添加 ## 初始剧本
- `src/context/build-story-context.ts` — 3 新注入项 + 预算 10k + 硬编码目录树
- `src/lib/validation.ts` — isValidSceneFile 添加 ## 初始剧本
- `src/agents/registry.ts` — Actor maxTurns 25→10
- 对应测试更新

### Definition of Done
- [ ] `bun test tests/unit/` 全量通过
- [ ] `bun run build` 零类型错误
- [ ] `bun run lint` 无新增错误
- [ ] GM prompt 不含旧阶段名（角色发现/场景编排/分步演绎/后处理/场景切换）
- [ ] GM prompt 含新阶段名（准备/场景编写/演绎循环/收束）
- [ ] validation + GM template + Archivist template 三路含 ## 初始剧本
- [ ] DEFAULT_TOKEN_BUDGET = 10000
- [ ] Actor maxTurns = 10

### Must Have
- GM prompt 完整重写（非增量修补）
- 反应式演绎循环（无预规划交互序列）
- 初始剧本写作边界规范（写什么/不写什么）
- 场景骨架三路同步（validation + GM + Archivist）
- 上下文注入：场景计数 + 前序摘要 + 硬编码目录结构
- Actor 工具使用指引（何时读/何时不读）

### Must NOT Have (Guardrails)
- 不修改 Scribe prompt（src/prompts/scribe.ts）
- 不新增 extract 函数（复用 extractSectionLines）
- 不修改 token estimator 逻辑
- 不改变交互记录注入行为（仍在预算外）
- 不重构 Archivist 工作流（仅添加 ## 初始剧本 到模板）
- 不修改 src/agents/gm.ts agent 定义（instructions 函数已正确传递 storyContext）
- 不添加 Actor prompt 完整测试套件（仅更新受影响断言）
- 不在 GM prompt 中保留任何场景延续/切换逻辑

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after（实现后更新受影响测试）
- **Framework**: bun test

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — independent changes):
├── Task 1: validation.ts — 添加 ## 初始剧本 [quick]
├── Task 2: types.ts — 移除 GMPromptState 死字段 [quick]
└── Task 3: build-story-context.ts — 3新注入项 + 预算10k + 硬编码目录 [unspecified-high]

Wave 2 (Prompts — depend on Wave 1 for format sync):
├── Task 4: archivist.ts prompt — 场景模板添加 ## 初始剧本 [quick]
├── Task 5: gm.ts prompt — 完整重写四阶段 [deep]
└── Task 6: actor.ts prompt — 工具指引 + 初始剧本 + 交互记录 [quick]

Wave 3 (Runtime + Verification):
├── Task 7: registry.ts — Actor maxTurns 25→10 [quick]
└── Task 8: Tests — 更新所有受影响测试 + 全量验证 [unspecified-high]

Critical Path: Task 1 → Task 5 → Task 8
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | - | 4, 5, 8 |
| 2 | - | 5, 8 |
| 3 | - | 5, 6, 8 |
| 4 | 1 | 8 |
| 5 | 1, 2, 3 | 8 |
| 6 | 3 | 8 |
| 7 | - | 8 |
| 8 | 1, 2, 3, 4, 5, 6, 7 | - |

### Agent Dispatch Summary

- **Wave 1**: T1→`quick`, T2→`quick`, T3→`unspecified-high`
- **Wave 2**: T4→`quick`, T5→`deep`, T6→`quick`
- **Wave 3**: T7→`quick`, T8→`unspecified-high`

---

## TODOs

- [x] 1. validation.ts — 添加 ## 初始剧本 必填验证

  **What to do**:
  - 在 `src/lib/validation.ts` 的 `isValidSceneFile()` 函数中，将 `'## 初始剧本'` 添加到 `required` 数组
  - 当前：`['## 地点', '## 时间', '## 在场角色', '## 经过']`
  - 改为：`['## 地点', '## 时间', '## 在场角色', '## 初始剧本', '## 经过']`

  **Must NOT do**: 不修改 isValidCharacterFile 或其他验证函数

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 8
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/lib/validation.ts:15-18` — 当前 isValidSceneFile 实现，简单数组 + every()
  **API/Type References**:
  - `src/tools/file-tools.ts:53-58` — writeFileTool 中调用 isValidSceneFile 的位置，验证逻辑与写入逻辑的衔接

  **Acceptance Criteria**:
  - [ ] `isValidSceneFile` 要求包含 `'## 初始剧本'`
  - [ ] 不含 `## 初始剧本` 的场景内容验证失败

  **QA Scenarios**:
  ```
  Scenario: 含初始剧本的场景通过验证
    Tool: Bash (bun test)
    Steps:
      1. bun test tests/unit/lib/validation.test.ts
    Expected Result: 所有测试通过（需先更新测试用例内容，Task 8 处理）
    Evidence: .sisyphus/evidence/task-1-validation-pass.txt

  Scenario: 不含初始剧本的场景验证失败
    Tool: Bash (node -e)
    Steps:
      1. node -e "const {isValidSceneFile} = require('./src/lib/validation'); console.log(isValidSceneFile('## 地点\nx\n## 时间\nx\n## 在场角色\n- a\n## 经过\nx'))"
    Expected Result: false
    Evidence: .sisyphus/evidence/task-1-validation-reject.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(validation): add ## 初始剧本 as required scene section`
  - Files: `src/lib/validation.ts`

- [x] 2. types.ts — 移除 GMPromptState 死字段

  **What to do**:
  - 从 `src/prompts/types.ts` 的 `GMPromptState` 接口中移除 4 个从未被填充的字段：
    - `currentSceneId?: string`
    - `currentLocation?: string`
    - `currentTime?: string`
    - `activeCharacter?: string`
  - 保留 `storyContext?: string`
  - 同步更新 `src/prompts/gm.ts` 的 `buildStateBlock()` 函数，移除对这 4 个字段的引用（line 17-20）

  **Must NOT do**: 不修改 ActorPromptState、ScribePromptState、ArchivistPromptState

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 5, 8
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/prompts/types.ts:10-16` — GMPromptState 接口定义
  - `src/prompts/gm.ts:15-23` — buildStateBlock() 引用了这 4 个字段
  **API/Type References**:
  - `src/agents/gm.ts:13-14` — gmAgent instructions 中只传了 storyContext，证实其他字段从未使用

  **Acceptance Criteria**:
  - [ ] GMPromptState 只包含 `storyContext?: string` 和 `PromptConfig` 相关字段
  - [ ] buildStateBlock() 不引用已移除的字段
  - [ ] `bun test tests/unit/prompts/gm.test.ts` 通过（可能需更新，Task 8 处理）

  **QA Scenarios**:
  ```
  Scenario: GMPromptState 不含死字段
    Tool: Bash (grep)
    Steps:
      1. grep "currentSceneId\|currentLocation\|currentTime\|activeCharacter" src/prompts/types.ts
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-2-dead-fields-removed.txt

  Scenario: GM prompt 仍可正常构建
    Tool: Bash (bun test)
    Steps:
      1. bun test tests/unit/prompts/gm.test.ts
    Expected Result: 全部通过
    Evidence: .sisyphus/evidence/task-2-gm-prompt-ok.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(types): remove unused GMPromptState fields`
  - Files: `src/prompts/types.ts`, `src/prompts/gm.ts`

- [x] 3. build-story-context.ts — 3新注入项 + 预算10k + 硬编码目录树

  **What to do**:
  - **预算变更**：`DEFAULT_TOKEN_BUDGET` 从 2000 改为 10000
  - **新增注入项**（3个，加入 sections 数组）：
    1. **故事进度**（priority -1）：`场景总数: N，当前场景: sXXX`
    2. **前序场景**（priority 0）：上一场景的 `## 经过` + `## 关键事实` section 内容
    3. **文件目录**（priority 3）：硬编码的目录结构树
  - **优先级表更新**：添加 `故事进度: -1`、`前序场景: 0`、`文件目录: 3`
  - **硬编码目录树内容**（不动态扫描）：

  ```
  .novel/
  ├── world.md          # 世界设定——地点、势力、规则
  ├── style.md          # 风格指南
  ├── timeline.md       # 时间线
  ├── plot.md           # 剧情线
  ├── debts.md          # 传播债务
  ├── chapters.md       # 章节结构
  ├── characters/       # 角色文件（{角色名}.md）
  └── scenes/           # 场景记录（s001.md, s002.md, ...）
  ```

  - **场景计数**：用 `globNovelFiles(dir, "scenes/*.md")` 的 `.length`，当前场景编号 = length + 1
  - **前序场景摘要**：读取上一场景文件，用 `extractSectionLines()` 提取 `经过`（最多10行）和 `关键事实`（最多5行）。无前序场景时省略此 section。
  - **GM prompt 中**的 "≤2000 tokens" 改为 "≤10000 tokens"

  **Must NOT do**:
  - 不新增 extract 函数（复用 extractSectionLines）
  - 不修改 token estimator
  - 不改变交互记录注入行为（仍在预算外追加）
  - 不动态扫描目录结构（硬编码）
  - 不排除 .directives.md 文件（它们是可选的，不出现在硬编码树中即可）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 5, 6, 8
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/context/build-story-context.ts:31-38` — DEFAULT_PRIORITIES 优先级表
  - `src/context/build-story-context.ts:158-222` — sections 数组构建逻辑，新注入项遵循相同模式
  - `src/context/build-story-context.ts:246-258` — 交互记录追加逻辑，保持不变
  - `src/context/extract.ts:46-74` — extractSectionLines()，复用提取前序场景内容
  - `src/context/extract.ts:172-182` — findLatestScene()，确定前序场景
  **API/Type References**:
  - `src/store/story-files.ts:247-288` — globNovelFiles()，用于场景计数
  **Test References**:
  - `tests/unit/context/build-story-context.test.ts` — 现有测试使用 tokenBudget: 50/100 显式传参，不受默认值变更影响

  **Acceptance Criteria**:
  - [ ] `DEFAULT_TOKEN_BUDGET = 10000`
  - [ ] buildStoryContext 输出包含 `## 故事进度` section
  - [ ] 有前序场景时，输出包含 `## 前序场景` section（经过 + 关键事实）
  - [ ] 无前序场景时，不包含前序场景 section
  - [ ] 输出包含 `## 文件目录` section（硬编码树）
  - [ ] 优先级排序正确（故事进度 > 在场角色 > 前序场景 > ...）

  **QA Scenarios**:
  ```
  Scenario: 场景计数和前序摘要正确注入
    Tool: Bash (bun test)
    Steps:
      1. bun test tests/unit/context/build-story-context.test.ts
    Expected Result: 全部通过（含新增断言）
    Evidence: .sisyphus/evidence/task-3-context-injection.txt

  Scenario: 硬编码目录树出现在输出中
    Tool: Bash (node -e)
    Steps:
      1. 在已有场景的目录中调用 buildStoryContext
      2. 检查输出包含 "world.md" 和 "characters/" 和 "scenes/"
    Expected Result: 输出含硬编码目录树
    Evidence: .sisyphus/evidence/task-3-directory-tree.txt

  Scenario: 无场景时故事进度显示正确
    Tool: Bash (node -e)
    Steps:
      1. 在空 .novel/ 目录中调用 buildStoryContext
      2. 检查输出包含 "场景总数: 0"
    Expected Result: 显示 "场景总数: 0，当前场景: s001"
    Evidence: .sisyphus/evidence/task-3-no-scenes.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(context): enhance story context injection with scene count, previous scene, directory tree, 10k budget`
  - Files: `src/context/build-story-context.ts`, `src/prompts/gm.ts`（token描述更新）

- [x] 4. archivist.ts prompt — 场景模板添加 ## 初始剧本

  **What to do**:
  - 在 `src/prompts/archivist.ts` 的场景文件格式模板中（lines 88-104），在 `## 在场角色` 和 `## 经过` 之间添加 `## 初始剧本` section
  - 更新后的模板：

  ```
  # 场景 sXXX
  ## 地点
  {地点名}
  ## 时间
  {故事时间}
  ## 在场角色
  - {角色名}
  ## 初始剧本
  （GM 在场景创建时编写）
  ## 经过
  {场景摘要}
  ## 小说文本
  {Scribe 输出 如果已经存在则追加}
  ## 关键事实
  - {事实1}
  - {事实2}
  ```

  **Must NOT do**: 不重构 Archivist 工作流，不修改其他段落

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1（需要确认 ## 初始剧本 是验证必填项）

  **References**:
  **Pattern References**:
  - `src/prompts/archivist.ts:88-104` — 当前场景文件格式模板

  **Acceptance Criteria**:
  - [ ] Archivist prompt 场景模板包含 `## 初始剧本` section
  - [ ] 顺序为：在场角色 → 初始剧本 → 经过

  **QA Scenarios**:
  ```
  Scenario: Archivist 模板含初始剧本
    Tool: Bash (grep)
    Steps:
      1. grep -c "初始剧本" src/prompts/archivist.ts
    Expected Result: ≥1
    Evidence: .sisyphus/evidence/task-4-archivist-template.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `refactor(archivist): add ## 初始剧本 to scene file format template`
  - Files: `src/prompts/archivist.ts`

- [x] 5. gm.ts prompt — 完整重写四阶段流程

  **What to do**:
  - **完整重写** `buildCorePrompt()` 函数（非增量修补），新 prompt 结构如下：

  ```
  # 自由剧场 GM

  ## 1. 角色定义
  （保持不变）

  ## 2. 核心职责
  1. 解析用户意图
  2. 故事启动问询（首条信息不足时，最多3个问题）
  3. 四阶段场景编排（详见各阶段）
  4. 输出结果

  工具一览（保持现有表格，更新调用流程）：
  调用流程更新：
  - 新场景 → glob→write(骨架+初始剧本)→actor→actor→...→scribe→archivist
  - 回忆/搜索 → glob→read
  - 场景结束 → clear_interaction_log

  ## 3. 场景骨架
  删除场景生命周期/切换条件/判断当前场景
  每轮用户输入 = 新场景
  场景编号：glob取最大+1，空目录从s001
  场景骨架模板（含 ## 初始剧本）：
  （完整模板）

  初始剧本写作规范：
  ✅ 核心张力/情感驱动力
  ✅ 情节节拍（3-5个，描述谁做什么产生什么效果）
  ✅ 开场指示（哪个角色先行动）
  ✅ 注意事项（需要避免的偏移）
  ❌ 不写具体对话原文
  ❌ 不写精确内心独白
  ❌ 不写场景最终结局

  ## 4. 四阶段流程

  前置处理：
  调用 clear_interaction_log

  阶段0：准备（Orient）
  1. 解析用户指令，提取角色
  2. resolve_character → canonical name
  3. read_file 获取角色信息
  4. glob_files("scenes/*.md") 确定编号

  阶段1：场景编写（Script）
  1. 确定地点、时间、在场角色
  2. 编写初始剧本
  3. write_file 创建场景骨架

  阶段2：演绎循环（Enact）
  反应式循环：回顾交互记录+初始剧本→决策→call_actor→回到评估
  direction规范：首次=场景描述+相关节拍，续演=另一角色言行+请反应
  终止条件：用户意图实现/情感节拍闭合/10轮上限

  阶段3：收束（Resolve）
  call_scribe → 构造摘要 → call_archivist → clear_log → 呈现

  ## 5. 叙事摘要格式（保持不变）
  ## 6. 信息流（更新token描述为≤10000）
  ## 7. 约束（更新场景相关约束）
  ## 8. 错误处理（保持不变）
  ## 9. 输出规范（保持不变）
  ```

  - **buildStateBlock()** 中移除对已删字段的引用，只保留 storyContext
  - **GM prompt 中** 的 "≤2000 tokens" 改为 "≤10000 tokens"（如果 Task 3 未覆盖此处，此处必须覆盖）

  **Must NOT do**:
  - 不增量修补旧模板（必须完整重写 buildCorePrompt）
  - 不保留任何场景延续/切换逻辑
  - 不修改 buildStateBlock() 的 storyContext 注入逻辑

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2, 3（需确认验证规则、类型定义、上下文格式）

  **References**:
  **Pattern References**:
  - `src/prompts/gm.ts:26-201` — 完整的当前 buildCorePrompt()，需完整替换
  - `src/prompts/gm.ts:15-23` — buildStateBlock()，需移除死字段引用
  **API/Type References**:
  - `src/prompts/types.ts` — 更新后的 GMPromptState（只有 storyContext）
  **Test References**:
  - `tests/unit/prompts/gm.test.ts` — 需验证新阶段名出现、旧阶段名消失

  **Acceptance Criteria**:
  - [ ] GM prompt 包含 "阶段0：准备（Orient）"
  - [ ] GM prompt 包含 "阶段1：场景编写（Script）"
  - [ ] GM prompt 包含 "阶段2：演绎循环（Enact）"
  - [ ] GM prompt 包含 "阶段3：收束（Resolve）"
  - [ ] GM prompt 不含 "角色发现"、"场景编排"、"分步演绎"、"后处理"、"场景切换"、"继续同一场景"
  - [ ] GM prompt 包含 "初始剧本" 写作规范
  - [ ] GM prompt 包含反应式循环描述
  - [ ] GM prompt 包含三个终止条件
  - [ ] buildStateBlock 只使用 storyContext

  **QA Scenarios**:
  ```
  Scenario: 新阶段名全部出现
    Tool: Bash (grep)
    Steps:
      1. grep -c "准备.*Orient\|场景编写.*Script\|演绎循环.*Enact\|收束.*Resolve" src/prompts/gm.ts
    Expected Result: ≥4
    Evidence: .sisyphus/evidence/task-5-new-stages.txt

  Scenario: 旧阶段名全部消失
    Tool: Bash (grep)
    Steps:
      1. grep -c "角色发现\|场景编排\|分步演绎\|后处理\|场景切换\|继续同一场景\|场景 ≠ 剧幕" src/prompts/gm.ts
    Expected Result: 0
    Evidence: .sisyphus/evidence/task-5-old-stages-removed.txt

  Scenario: GM prompt 构建不报错
    Tool: Bash (bun test)
    Steps:
      1. bun test tests/unit/prompts/gm.test.ts
    Expected Result: 全部通过
    Evidence: .sisyphus/evidence/task-5-gm-test.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `refactor(gm): rewrite 4-stage reactive flow (Orient→Script→Enact→Resolve)`
  - Files: `src/prompts/gm.ts`

- [x] 6. actor.ts prompt — 工具指引 + 初始剧本 + 交互记录

  **What to do**:
  - 在 `src/prompts/actor.ts` 的 `buildActorCore()` 中添加 3 个新段落：

  **1. 工具使用段落**（在"知识边界"之前）：
  ```
  ## 工具使用

  你可以使用以下工具读取 .novel/ 下的文件：

  | 工具 | 用途 |
  |------|------|
  | read_file | 读取文件内容 |
  | glob_files | 查找文件列表 |

  使用原则：
  - 主要信息来源：故事上下文自动注入（场景、角色、交互记录），大多数情况不需要额外读取
  - 何时主动读取：
    · 角色记忆中引用了前序场景的事件，你需要了解当时的情景
    · 用户指令涉及久远信息，上下文中的摘要不够
    · 需要了解世界设定中某个地点或规则的细节
  - 不要：读取与当前表演无关的文件、反复读取同一文件
  - 优先表演：如果上下文已提供足够信息，直接表演，不要浪费时间读取
  ```

  **2. 初始剧本段落**（在"工具使用"之后）：
  ```
  ## 初始剧本

  GM 会在场景骨架中提供"初始剧本"，包含核心张力和情节节拍。

  - 核心张力告诉你这场戏的情感驱动力
  - 情节节拍告诉你大致的事件走向——但不是台词
  - 开场指示告诉你第一次被调用时应该做什么
  - 注意事项告诉你需要避免的偏移

  你的职责是沿着节拍方向表演，但用自己的方式——节拍描述"发生了什么"，你决定"怎么发生"。
  ```

  **3. 交互记录参考**（在"工作流程"步骤4中添加）：
  ```
  4. 如果故事上下文包含交互记录，参考其中其他角色的言行做出反应
  ```

  **Must NOT do**: 不修改角色附体/输出格式/约束等核心段落

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: Task 3（需确认上下文注入格式）

  **References**:
  **Pattern References**:
  - `src/prompts/actor.ts:29-113` — 完整 buildActorCore()，新增段落插入其中
  - `src/prompts/actor.ts:49-55` — 工作流程段落，步骤4 需修改

  **Acceptance Criteria**:
  - [ ] Actor prompt 包含 "工具使用" 段落
  - [ ] Actor prompt 包含 "初始剧本" 段落
  - [ ] Actor prompt 工作流程步骤4 引用交互记录

  **QA Scenarios**:
  ```
  Scenario: Actor prompt 含新段落
    Tool: Bash (grep)
    Steps:
      1. grep -c "工具使用\|初始剧本\|交互记录" src/prompts/actor.ts
    Expected Result: ≥3
    Evidence: .sisyphus/evidence/task-6-actor-prompt.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `refactor(actor): add tool usage guidance, initial script section, interaction log reference`
  - Files: `src/prompts/actor.ts`

- [x] 7. registry.ts — Actor maxTurns 25→10

  **What to do**:
  - 在 `src/agents/registry.ts` 中，将 callActorTool 的 `maxTurns` 从 25 改为 10
  - 位置：line 89，`maxTurns: 25` → `maxTurns: 10`

  **Must NOT do**: 不修改 callScribeTool 或 callArchivistTool 的 maxTurns

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/agents/registry.ts:86-91` — callActorTool run 调用，maxTurns 在 line 89

  **Acceptance Criteria**:
  - [ ] Actor maxTurns = 10
  - [ ] Scribe maxTurns 仍为 25
  - [ ] Archivist maxTurns 仍为 50

  **QA Scenarios**:
  ```
  Scenario: Actor maxTurns 为 10
    Tool: Bash (grep)
    Steps:
      1. grep -A5 "call_actor" src/agents/registry.ts | grep maxTurns
    Expected Result: 显示 maxTurns: 10
    Evidence: .sisyphus/evidence/task-7-maxturns.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(runtime): reduce Actor maxTurns from 25 to 10`
  - Files: `src/agents/registry.ts`

- [x] 8. Tests — 更新所有受影响测试 + 全量验证

  **What to do**:
  - **validation.test.ts**：更新 `isValidSceneFile` 测试用例，在所有测试场景内容中添加 `## 初始剧本` 行；新增不含初始剧本的负面测试
  - **gm.test.ts**：移除对已删 GMPromptState 字段（currentSceneId等）的测试断言；添加新阶段名断言；添加"初始剧本"出现断言
  - **build-story-context.test.ts**：添加场景计数、前序场景摘要、硬编码目录树的测试用例；验证 DEFAULT_TOKEN_BUDGET 变更后现有测试仍通过
  - 运行全量测试：`bun test tests/unit/`
  - 运行构建：`bun run build`
  - 运行 lint：`bun run lint`

  **Must NOT do**: 不新增 Actor prompt 完整测试套件

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Task 7)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 1, 2, 3, 4, 5, 6, 7

  **References**:
  **Test References**:
  - `tests/unit/lib/validation.test.ts` — isValidSceneFile 测试
  - `tests/unit/prompts/gm.test.ts` — GM prompt 测试
  - `tests/unit/context/build-story-context.test.ts` — 上下文构建测试
  - `tests/unit/context/interaction-log-inject.test.ts` — 交互记录注入测试（应不受影响）

  **Acceptance Criteria**:
  - [ ] `bun test tests/unit/` — 零失败
  - [ ] `bun run build` — 成功，零类型错误
  - [ ] `bun run lint` — 无新增错误
  - [ ] grep 旧阶段名返回 0
  - [ ] grep 初始剧本 在 3 处出现（validation + gm + archivist）
  - [ ] DEFAULT_TOKEN_BUDGET = 10000
  - [ ] Actor maxTurns = 10

  **QA Scenarios**:
  ```
  Scenario: 全量测试通过
    Tool: Bash (bun test)
    Steps:
      1. bun test tests/unit/
    Expected Result: 全部通过，0 failures
    Evidence: .sisyphus/evidence/task-8-full-test.txt

  Scenario: 构建成功
    Tool: Bash (bun run build)
    Steps:
      1. bun run build
    Expected Result: 成功，零类型错误
    Evidence: .sisyphus/evidence/task-8-build.txt

  Scenario: 三路初始剧本同步确认
    Tool: Bash (grep)
    Steps:
      1. grep -c "初始剧本" src/prompts/gm.ts src/prompts/archivist.ts src/lib/validation.ts
    Expected Result: 每个文件 ≥1
    Evidence: .sisyphus/evidence/task-8-sync.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test: update tests for GM stage refactor and context injection enhancement`
  - Files: `tests/unit/lib/validation.test.ts`, `tests/unit/prompts/gm.test.ts`, `tests/unit/context/build-story-context.test.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, unused imports.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start dev server. Send a multi-turn conversation. Verify scene files created with 初始剧本. Verify Actor uses tools. Verify no old stage names in GM prompt output.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `refactor(context): add 初始剧本 validation, remove dead state fields, enhance story context injection` - validation.ts, types.ts, build-story-context.ts
- **Wave 2**: `refactor(prompts): rewrite GM 4-stage flow, add 初始剧本 to actor/archivist` - gm.ts, actor.ts, archivist.ts
- **Wave 3**: `refactor(runtime): reduce Actor maxTurns, update tests` - registry.ts, tests/

---

## Success Criteria

### Verification Commands
```bash
bun test tests/unit/           # Expected: all pass
bun run build                  # Expected: success, 0 errors
bun run lint                   # Expected: 0 new errors
grep -c "角色发现\|场景编排\|分步演绎\|后处理\|场景切换\|继续同一场景\|场景 ≠ 剧幕" src/prompts/gm.ts  # Expected: 0
grep -c "初始剧本" src/prompts/gm.ts src/prompts/archivist.ts src/lib/validation.ts  # Expected: ≥3
grep "DEFAULT_TOKEN_BUDGET" src/context/build-story-context.ts  # Expected: 10000
grep "maxTurns: 10" src/agents/registry.ts  # Expected: match for Actor
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No old stage names remain in GM prompt
- [ ] 初始剧本 三路同步
