# 文件编辑能力：设定文件 CRUD + 双层指令架构

## TL;DR

> **Quick Summary**: 为自由剧场添加设定文件编辑能力，用户可直接编辑 .novel/ 下的角色/场景/世界等 markdown 文件以获得更强粒度的剧情控制。核心创新是双层架构：主文件（AI 维护的状态）+ directives 伴生文件（用户意图声明，AI 只读），从根本上解决"AI 多轮覆写导致用户意图丢失"的问题。
> 
> **Deliverables**:
> - 文件 CRUD API 端点（含 hash 乐观锁）
> - 共享验证模块 + edit_file 后验证修复
> - 侧栏文件树组件
> - CodeMirror 6 markdown 编辑器（Sheet 面板内）
> - useAutosave 自动保存 hook
> - 保存时冲突检测（hash 不一致 → 重载 + 草稿保留）
> - directives 伴生文件支持（工具层硬阻止 AI 写入 + 上下文注入）
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9

---

## Context

### Original Request
给项目增加文件操作/编辑能力，允许用户编辑对应项目下的设定文件（characters/scenes/debts/plot/style/timeline/world）以支持更强粒度的剧情控制。

### Interview Summary
**Key Discussions**:
- UI 融入方式：复用现有 Sheet 通道而非新增布局列，侧栏扩展文件树
- 编辑器选型：MDXEditor → CodeMirror 6（Metis 指出 MDXEditor 的 CJK IME 缺陷，改为 CodeMirror 6）
- 冲突处理（用户覆盖 AI）：保存时 hash 检测 → 不一致则重载最新 + 保留用户编辑为草稿
- 冲突处理（AI 覆盖用户）：双层架构 — 主文件 + directives 伴生文件，工具层硬阻止 AI 写入 directives
- 设计理念：绝大多数时候用户不需要关注文件内容，仅在需要更强掌控时才编辑，因此不做脏标记通知
- directives 时效性：用户声明放在 directives = 持久意图；直接编辑主文件 = 临时干预（AI 可演进）

**Research Findings**:
- MDXEditor 有 CJK IME 问题（#808），markdown 规范化会静默改变文件，bundle ~400KB — 不适合
- CodeMirror 6：完美 markdown 保真、最佳 CJK/IME 支持、~80KB、内置虚拟化、Obsidian/VS Code 同款
- 现有 Sheet 状态在 MessageItem 内部（useState），需要提升到 ProjectChat 层以支持侧栏触发
- edit_file 无后验证（可损坏 character/scene 文件格式），writeNovelFile 无原子写入

### Metis Review
**Identified Gaps** (addressed):
- MDXEditor CJK IME 问题 → 改用 CodeMirror 6
- Sheet 状态归属需重构 → 新增独立任务提升 Sheet 状态
- edit_file 无后验证 → 新增验证修复任务
- writeNovelFile 无原子写入 → 新增原子写入任务
- isSafePath 需加固 → 在验证模块中强化
- directives 路径约定 → 采用同目录伴生文件（`characters/塞莉娅.directives.md`）
- directives 优先级 → 新增 priority -1（高于在场角色）
- CRUD API 不依赖全局状态 → 通过 getProject() 显式传参

---

## Work Objectives

### Core Objective
为自由剧场添加设定文件编辑能力，通过双层架构（主文件 + directives）实现用户意图的持久化表达，同时不破坏 AI 的自动状态维护闭环。

### Concrete Deliverables
- `src/lib/validation.ts` — 共享验证模块
- `src/store/story-files.ts` — 新增 deleteNovelFile、readDirectivesFile、computeFileHash、原子写入
- `src/app/api/projects/[id]/files/route.ts` — 文件 CRUD API（含 hash 乐观锁）
- `src/components/chat/story-file-tree.tsx` — 侧栏文件树
- `src/components/chat/file-editor-sheet.tsx` — 文件编辑器 Sheet
- `src/components/chat/code-mirror-editor.tsx` — CodeMirror 6 编辑器组件
- `src/hooks/use-autosave.ts` — 自动保存 hook
- `src/context/build-story-context.ts` — directives 注入逻辑

### Definition of Done
- [ ] `bun test` 全部通过
- [ ] `bun run build` 无错误
- [ ] 用户可在侧栏浏览文件树，点击文件在 Sheet 中编辑并保存
- [ ] AI 无法写入 `*.directives.md` 文件（工具层硬阻止）
- [ ] 保存时若文件已被 AI 修改，自动重载并保留用户编辑为草稿
- [ ] directives 内容在上下文注入中以最高优先级出现

### Must Have
- 文件 CRUD API 端点（list/read/write/delete）
- hash 乐观锁（If-Match / 409 Conflict）
- 共享验证模块（API 和 tool 层共用）
- edit_file 后验证
- writeNovelFile 原子写入
- 侧栏文件树
- CodeMirror 6 markdown 编辑器
- useAutosave hook
- Sheet 状态提升 + 双 kind 调度
- directives 伴生文件支持（工具层阻止 + 上下文注入）
- 保存时冲突检测与草稿保留

### Must NOT Have (Guardrails)
- 不引入 react-resizable-panels
- 不做 diff 审查 / tracked changes
- 不做脏标记通知
- 不做段落级所有权标注
- 不做乐观合并
- 不修改 Actor / Scribe 的工具或 prompt
- style.md 不需要 directives 伴生
- 不做 WYSIWYG 富文本模式（V1 仅源码模式）
- 不修改现有 agent prompt（GM/Archivist directives 感知为 follow-up）
- 不使用 MDXEditor
- 不使用 .directives/ 集中目录（用同目录伴生文件）

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun:test)
- **Automated tests**: YES (Tests-after)
- **Framework**: bun test
- **Test pattern**: New tests alongside implementation, `bun test` at each commit

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) - Send requests, assert status + response fields
- **UI Components**: Use Bash (bun test) for unit tests + Playwright for integration
- **Store/Logic**: Use Bash (bun test) for unit tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - backend infrastructure):
├── Task 1: Extract shared validation module [quick]
├── Task 2: Atomic write + hash utility for writeNovelFile [quick]
├── Task 3: File CRUD API endpoints [unspecified-high]
└── Task 4: Block directives paths in agent file tools [quick]

Wave 2 (After Wave 1 - UI refactor + components):
├── Task 5: Lift Sheet state ownership [unspecified-high]
├── Task 6: StoryFileTree sidebar component [unspecified-high]
└── Task 7: CodeMirror 6 file editor Sheet [deep]

Wave 3 (After Wave 2 - directives + integration):
├── Task 8: Directives context injection in buildStoryContext [unspecified-high]
└── Task 9: Directives UI (creation/editing in editor, badge in file tree) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| 1 | - | 3, 4 |
| 2 | - | 3, 7 |
| 3 | 1, 2 | 6, 7 |
| 4 | 1 | 8 |
| 5 | - | 6, 7 |
| 6 | 3, 5 | 9 |
| 7 | 2, 3, 5 | 9 |
| 8 | 4 | F1-F4 |
| 9 | 6, 7, 8 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`, T4 → `quick`
- **Wave 2**: 3 tasks — T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `deep`
- **Wave 3**: 2 tasks — T8 → `unspecified-high`, T9 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Extract shared validation module

  **What to do**:
  - Create `src/lib/validation.ts` — extract and export `isSafePath`, `isValidCharacterFile`, `isValidSceneFile` from `src/tools/file-tools.ts`
  - Add new helpers: `isDirectivesPath(path)` — returns true if path ends with `.directives.md`; `isAllowedFilePath(path)` — rejects `.working/`, `.archive/`, non-`.md` extensions, null bytes, enforces non-empty path
  - Harden `isSafePath`: add rejection of `.working/` and `.archive/` prefixes (these are runtime dirs, not user-editable)
  - Add post-edit re-validation to `editFileTool` in `src/tools/file-tools.ts`: after `content.replace()`, re-run `isValidCharacterFile` / `isValidSceneFile` for the affected path before writing; if validation fails, return error and do NOT write
  - Update `src/tools/file-tools.ts` to import from `src/lib/validation.ts` instead of defining validation inline
  - Write unit tests in `tests/unit/lib/validation.test.ts` covering all validation functions (positive + negative cases)
  - Write unit test for `editFileTool` post-edit rejection: editing a character file to remove `# Name` heading should fail

  **Must NOT do**:
  - Do not change the behavior of `writeFileTool` (it already validates)
  - Do not add directives-specific logic to validation (that's Task 4)
  - Do not modify `isSafePath` in a way that breaks existing agent tool calls

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-scoped extraction + small additions, clear patterns to follow
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — no complex git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3 blocked, 4)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/tools/file-tools.ts:6-22` — Current validation functions to extract. Follow exact same logic, just relocate.
  - `src/tools/file-tools.ts:70-94` — `editFileTool` implementation. The post-edit validation check goes between line 90 (`content.replace()`) and line 91 (`writeNovelFile()`).

  **API/Type References** (contracts to implement against):
  - `src/lib/tool-result.ts` — `toolResult()` / `toolError()` helpers for returning tool results

  **Test References** (testing patterns to follow):
  - `tests/unit/prompts/gm.test.ts` — Test structure pattern with `describe`/`test`/`expect`

  **WHY Each Reference Matters**:
  - `file-tools.ts:6-22`: Exact functions to move — must preserve identical behavior
  - `file-tools.ts:70-94`: Insertion point for post-edit validation — the `newContent` variable is what needs re-validation before write
  - `tool-result.ts`: Must use same result format for edit_file validation errors

  **Acceptance Criteria**:

  - [ ] `src/lib/validation.ts` exists and exports `isSafePath`, `isValidCharacterFile`, `isValidSceneFile`, `isDirectivesPath`, `isAllowedFilePath`
  - [ ] `src/tools/file-tools.ts` imports validation from `src/lib/validation.ts` (no inline definitions remain)
  - [ ] `bun test tests/unit/lib/validation.test.ts` → PASS
  - [ ] editFileTool rejects edits that break character/scene file format
  - [ ] `bun test` → all tests pass (no regressions)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: edit_file removes character heading — should be rejected
    Tool: Bash (bun test)
    Preconditions: Character file with "# 林黛玉" and "> L0" exists
    Steps:
      1. Run test: edit_file replaces "# 林黛玉" with "林黛玉" (removes heading)
      2. Assert: tool returns error containing "Invalid character file content"
      3. Assert: file on disk is unchanged (still has "# 林黛玉")
    Expected Result: edit_file rejects the edit, file content preserved
    Failure Indicators: File content changed, or no error returned
    Evidence: .sisyphus/evidence/task-1-edit-validation-reject.txt

  Scenario: isAllowedFilePath rejects .working/ prefix
    Tool: Bash (bun test)
    Preconditions: None
    Steps:
      1. Test isAllowedFilePath(".working/agent-logs.jsonl") → false
      2. Test isAllowedFilePath("characters/林黛玉.md") → true
    Expected Result: .working/ rejected, normal path accepted
    Evidence: .sisyphus/evidence/task-1-path-allowlist.txt
  ```

  **Commit**: YES
  - Message: `feat(validation): extract shared validation module`
  - Files: `src/lib/validation.ts`, `src/tools/file-tools.ts`, `tests/unit/lib/validation.test.ts`
  - Pre-commit: `bun test`

- [x] 2. Atomic write + hash utility for writeNovelFile

  **What to do**:
  - Create `src/lib/file-hash.ts` — export `computeFileHash(content: string): string` using Node.js crypto SHA-256, return hex string
  - Refactor `writeNovelFile` in `src/store/story-files.ts` to use atomic write pattern: write to `.tmp` file first, then `renameSync` to target path (follow pattern from `src/session/index.ts:writeSessionIndex`)
  - Add `deleteNovelFile(dir: string, relativePath: string): Promise<boolean>` to `src/store/story-files.ts` — returns true if file existed and was deleted, false if not found. Must enforce `isSafePath` + `isAllowedFilePath` + reject deletion of `.directives.md` files (user-only deletion via API)
  - Add `readDirectivesFile(dir: string, entityPath: string): Promise<string | null>` — appends `.directives.md` to entityPath and calls readNovelFile internally
  - Write unit tests in `tests/unit/store/story-files.test.ts` using `mkdtempSync`/`rmSync` pattern

  **Must NOT do**:
  - Do not change `readNovelFile` behavior
  - Do not add API endpoints (that's Task 3)
  - Do not modify `globNovelFiles`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility additions following existing patterns (atomic write from session layer)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3 blocked, 4)
  - **Blocks**: Tasks 3, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/session/index.ts:writeSessionIndex` — Atomic write pattern: `writeFileSync(tmpPath, ...)` + `renameSync(tmpPath, targetPath)`. Copy this exact approach.
  - `src/store/story-files.ts:190-202` — Current `writeNovelFile` to refactor. Replace bare `writeFile` with atomic pattern.

  **API/Type References**:
  - `src/lib/validation.ts` (from Task 1) — Import `isSafePath`, `isAllowedFilePath` for `deleteNovelFile`

  **External References**:
  - Node.js `crypto.createHash('sha256')` — SHA-256 hash computation

  **WHY Each Reference Matters**:
  - `session/index.ts`: Proven atomic write pattern in this codebase — must match exactly
  - `story-files.ts:190-202`: The function being refactored — must preserve auto-create-parent-dirs behavior
  - `validation.ts`: deleteNovelFile needs safety checks — reuse shared validation

  **Acceptance Criteria**:

  - [ ] `src/lib/file-hash.ts` exists, exports `computeFileHash`
  - [ ] `writeNovelFile` uses atomic write (tmp + rename)
  - [ ] `deleteNovelFile` exists with safety checks
  - [ ] `readDirectivesFile` exists
  - [ ] `bun test tests/unit/store/story-files.test.ts` → PASS
  - [ ] Existing tests pass (atomic write is transparent to callers)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: computeFileHash returns consistent SHA-256
    Tool: Bash (bun test)
    Steps:
      1. Hash "hello world" → verify returns 64-char hex string
      2. Hash same string again → verify identical result
    Expected Result: Consistent 64-char SHA-256 hex string
    Evidence: .sisyphus/evidence/task-2-hash-consistency.txt

  Scenario: writeNovelFile atomic — target file always valid
    Tool: Bash (bun test)
    Preconditions: Temp directory with .novel/
    Steps:
      1. Write file via writeNovelFile
      2. Read file immediately → verify content matches
      3. Verify no .tmp files remain in directory
    Expected Result: File exists with correct content, no residual .tmp
    Evidence: .sisyphus/evidence/task-2-atomic-write.txt

  Scenario: deleteNovelFile rejects directives path
    Tool: Bash (bun test)
    Steps:
      1. Attempt deleteNovelFile(dir, "characters/test.directives.md")
      2. Assert returns false / throws
    Expected Result: Directives file deletion blocked
    Evidence: .sisyphus/evidence/task-2-delete-reject.txt
  ```

  **Commit**: YES
  - Message: `fix(store): atomic write and hash utility`
  - Files: `src/lib/file-hash.ts`, `src/store/story-files.ts`, `tests/unit/store/story-files.test.ts`
  - Pre-commit: `bun test`

- [x] 3. File CRUD API endpoints

  **What to do**:
  - Create `src/app/api/projects/[id]/files/route.ts` with:
    - `GET` — list files: `?pattern=characters` for subdirectory filtering, returns `{ success: true, files: string[] }`. Pattern follows `globNovelFiles` semantics.
    - `GET` with `?path=world.md` — read single file: returns `{ success: true, data: { content: string, hash: string, lastModified: number } }`. Hash from `computeFileHash`.
    - `PUT` — write file: body `{ path: string, content: string, hash?: string }`. If `hash` provided, compare with current disk hash → mismatch returns 409 `{ success: false, message: "文件已被修改，请刷新后重试", currentContent, currentHash }`. Validate content via `isValidCharacterFile`/`isValidSceneFile` for appropriate paths. Reject `.directives.md` writes from this endpoint (user-only, see Task 9 for directives API).
    - `DELETE` — `?path=characters/test.md`: calls `deleteNovelFile`. Returns `{ success: true }` or 404.
  - Create Zod schemas for request validation in the route file
  - Resolve project via `getProject(projectId)` from `src/project/manager.ts` — do NOT use `setCurrentProjectId()` global state
  - Use `{ success, message }` error format consistently
  - Write integration tests in `tests/unit/api/files.test.ts` or manual curl tests

  **Must NOT do**:
  - Do not use `setCurrentProjectId()` global state
  - Do not allow writing `.directives.md` files via this endpoint (separate auth context needed later)
  - Do not modify existing API routes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API design with multiple endpoints, validation, error handling — moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Tasks 1, 2)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References** (existing code to follow):
  - `src/app/api/projects/[id]/route.ts` — Project CRUD pattern: `getProject(params.id)` → `project.dataDir` → store functions → JSON response. Follow this exact structure.
  - `src/app/api/projects/[id]/init/route.ts` — POST with action pattern, error handling

  **API/Type References**:
  - `src/lib/validation.ts` (Task 1) — `isValidCharacterFile`, `isValidSceneFile`, `isSafePath`, `isAllowedFilePath`, `isDirectivesPath`
  - `src/lib/file-hash.ts` (Task 2) — `computeFileHash`
  - `src/store/story-files.ts` (Task 2 updated) — `readNovelFile`, `writeNovelFile`, `deleteNovelFile`, `globNovelFiles`
  - `src/project/manager.ts:getProject()` — Project resolution without global state
  - `src/project/types.ts:Project` — `{ id, name, createdAt, dataDir }`

  **Test References**:
  - `tests/integration/e2e.test.ts` — Integration test structure

  **WHY Each Reference Matters**:
  - `projects/[id]/route.ts`: Canonical API pattern — must match error format, project resolution, and response structure
  - `validation.ts` + `file-hash.ts`: New dependencies for this task — validate on write, hash on read
  - `getProject()`: Must use this instead of global state to avoid race conditions

  **Acceptance Criteria**:

  - [ ] `GET /api/projects/{id}/files?pattern=characters` returns file list
  - [ ] `GET /api/projects/{id}/files?path=world.md` returns content + hash
  - [ ] `PUT /api/projects/{id}/files` writes file with validation
  - [ ] `PUT` with stale hash returns 409 with current content
  - [ ] `DELETE /api/projects/{id}/files?path=X` deletes file
  - [ ] `.directives.md` paths rejected on PUT
  - [ ] `bun run build` → no errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full CRUD cycle — happy path
    Tool: Bash (curl)
    Preconditions: Dev server running, project with .novel/ exists
    Steps:
      1. GET /api/projects/{id}/files?pattern=characters → assert success=true, files array non-empty
      2. GET /api/projects/{id}/files?path=world.md → assert content present, hash is 64-char hex
      3. PUT /api/projects/{id}/files body={"path":"world.md","content":"# test","hash":"<hash-from-step2>"} → assert success=true
      4. GET same path again → assert new content + new hash
    Expected Result: Full read-write cycle works with hash verification
    Failure Indicators: Any step returns non-success, hash mismatch not caught
    Evidence: .sisyphus/evidence/task-3-crud-cycle.txt

  Scenario: Hash conflict detection — 409 response
    Tool: Bash (curl)
    Preconditions: File exists on disk
    Steps:
      1. GET file → capture hash
      2. Modify file on disk separately (writeNovelFile)
      3. PUT with old hash → assert 409 status, response has currentContent + currentHash
    Expected Result: 409 Conflict with current disk state
    Evidence: .sisyphus/evidence/task-3-hash-conflict.txt

  Scenario: Directives path rejected
    Tool: Bash (curl)
    Steps:
      1. PUT body={"path":"characters/test.directives.md","content":"test"} → assert 403 or 400
    Expected Result: Write rejected for directives path
    Evidence: .sisyphus/evidence/task-3-directives-reject.txt

  Scenario: Invalid character file content rejected
    Tool: Bash (curl)
    Steps:
      1. PUT body={"path":"characters/test.md","content":"no heading no L0"} → assert 400 with validation error
    Expected Result: Validation catches invalid format
    Evidence: .sisyphus/evidence/task-3-validation-reject.txt
  ```

  **Commit**: YES
  - Message: `feat(api): file CRUD endpoints with optimistic locking`
  - Files: `src/app/api/projects/[id]/files/route.ts`
  - Pre-commit: `bun run build`

- [x] 4. Block directives paths in agent file tools

  **What to do**:
  - In `src/tools/file-tools.ts`, add `isDirectivesPath()` check to `writeFileTool` and `editFileTool` execute functions
  - If path ends with `.directives.md`, return `toolError("作者指令文件仅限手动编辑，AI不可修改。如需调整角色设定，请在作者指令中声明。")`
  - Also add `isAllowedFilePath()` check to `writeFileTool`, `editFileTool`, `readFileTool`, `globFilesTool` — reject `.working/` and `.archive/` paths
  - Write unit tests verifying rejection for directives paths and disallowed paths

  **Must NOT do**:
  - Do not add directives logic to `readFileTool` (AI CAN read directives — it needs to see them in context)
  - Do not modify `character-tools.ts` or `story-tools.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small guard additions to existing tool functions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3 blocked)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/tools/file-tools.ts:54-68` — `writeFileTool` execute function. Add `isDirectivesPath` check after `isSafePath` check, same pattern.
  - `src/tools/file-tools.ts:78-93` — `editFileTool` execute function. Same insertion point.

  **API/Type References**:
  - `src/lib/validation.ts` (Task 1) — `isDirectivesPath`, `isAllowedFilePath`
  - `src/lib/tool-result.ts` — `toolError()` for error returns

  **WHY Each Reference Matters**:
  - `file-tools.ts:54-68`: Exact insertion point — follows existing `isSafePath` guard pattern
  - `validation.ts`: New guard functions from Task 1

  **Acceptance Criteria**:

  - [ ] `write_file` with `*.directives.md` path returns error
  - [ ] `edit_file` with `*.directives.md` path returns error
  - [ ] `read_file` with `*.directives.md` path still works (AI can read)
  - [ ] `glob_files` with `.working/` pattern returns error
  - [ ] `bun test` → all pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: write_file rejects directives path
    Tool: Bash (bun test)
    Steps:
      1. Call writeFileTool with path="characters/林黛玉.directives.md", content="test"
      2. Assert result contains "作者指令文件仅限手动编辑"
    Expected Result: Write blocked with clear Chinese error message
    Evidence: .sisyphus/evidence/task-4-write-directives-reject.txt

  Scenario: read_file allows directives path
    Tool: Bash (bun test)
    Steps:
      1. Create a .directives.md file on disk
      2. Call readFileTool with path="characters/林黛玉.directives.md"
      3. Assert result contains file content (not error)
    Expected Result: Read succeeds — AI can read directives
    Evidence: .sisyphus/evidence/task-4-read-directives-allow.txt
  ```

  **Commit**: YES
  - Message: `feat(tools): block directives paths in agent file tools`
  - Files: `src/tools/file-tools.ts`, `tests/unit/tools/file-tools.test.ts`
  - Pre-commit: `bun test`

- [x] 5. Lift Sheet state ownership

  **What to do**:
  - In `src/app/page.tsx`, add `selectedTool` state (currently local to MessageItem) and `selectedFilePath` state at the `ProjectChat` level
  - Define `SheetContent` type: `{ kind: "tool-detail"; toolName: string; input?; output?; error?; state? } | { kind: "file-editor"; filePath: string; projectId: string } | null`
  - Pass `onToolClick` callback down to `MessageList` → `MessageItem` so ToolTag clicks set the ProjectChat-level state
  - Replace per-MessageItem ToolDetailSheet with a single Sheet at ProjectChat level that renders based on `sheetContent.kind`
  - Sheet width: `w-[400px]` for tool-detail, `w-[560px]` for file-editor (use `cn()` conditional)
  - Verify existing ToolDetailSheet behavior is preserved — clicking a ToolTag still opens the same detail view

  **Must NOT do**:
  - Do not add file editor rendering yet (that's Task 7)
  - Do not change the visual appearance of ToolDetailSheet
  - Do not remove SessionModal (it stays per-MessageItem)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: State lifting across component tree requires careful prop threading and behavior verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6 blocked, 7 blocked)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None (can start immediately, independent of backend)

  **References**:

  **Pattern References**:
  - `src/app/page.tsx:92-121` — Current ProjectChat layout. Sheet goes after the flex row div, before the closing div.
  - `src/components/chat/message-item.tsx:106-136` — Current Sheet state (`selectedTool`) and rendering. This state moves to ProjectChat.
  - `src/components/chat/tool-detail-sheet.tsx` — Existing Sheet component. Stays unchanged, just rendered at a higher level.

  **API/Type References**:
  - `src/components/chat/tool-tag.tsx` — `ToolTag` onClick interface — the callback shape

  **WHY Each Reference Matters**:
  - `page.tsx:92-121`: Where the shared Sheet will be mounted
  - `message-item.tsx:106-136`: State being lifted — must preserve exact same SelectedTool interface
  - `tool-detail-sheet.tsx`: Rendered component — no changes needed, just mounted differently

  **Acceptance Criteria**:

  - [ ] `page.tsx` has `sheetContent` state at ProjectChat level
  - [ ] Clicking ToolTag in any message opens the shared Sheet with tool detail
  - [ ] Clicking ToolTag in different messages switches the Sheet content
  - [ ] Closing Sheet clears `sheetContent` state
  - [ ] SessionModal still works (per-MessageItem)
  - [ ] `bun run build` → no errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: ToolTag click opens shared Sheet
    Tool: Bash (bun dev + Playwright)
    Preconditions: Project with chat history containing tool calls
    Steps:
      1. Navigate to project chat
      2. Click a ToolTag pill in a message
      3. Assert Sheet opens from right side with tool detail content
      4. Click a different ToolTag in another message
      5. Assert Sheet content updates to new tool
    Expected Result: Shared Sheet opens and switches content correctly
    Evidence: .sisyphus/evidence/task-5-sheet-state-lift.png

  Scenario: Sheet width switches by kind
    Tool: Bash (bun dev + Playwright)
    Steps:
      1. Open tool detail Sheet → assert width ~400px
      2. (After Task 7) Open file editor Sheet → assert width ~560px
    Expected Result: Width differs between kinds
    Evidence: .sisyphus/evidence/task-5-sheet-width.png
  ```

  **Commit**: YES
  - Message: `refactor(ui): lift Sheet state to ProjectChat`
  - Files: `src/app/page.tsx`, `src/components/chat/message-item.tsx`, `src/components/chat/message-list.tsx`
  - Pre-commit: `bun run build`

- [x] 6. StoryFileTree sidebar component

  **What to do**:
  - Create `src/components/chat/story-file-tree.tsx` — client component
  - Props: `{ projectId: string; selectedFilePath: string | null; onFileSelect: (path: string) => void }`
  - On mount and projectId change, fetch `GET /api/projects/{id}/files` to get file list
  - Render file tree with:
    - Root `.md` files (world.md, style.md, plot.md, etc.) with type icons (🌍🎭📋⏰💰📖)
    - Subdirectories (characters/, scenes/) as collapsible groups
    - Files within subdirectories
    - Selected file highlighted
  - Click handler: `onFileSelect(path)` → sets `selectedFilePath` in parent
  - Place below `ProjectSelector` in the aside, separated by `Separator`
  - Use `ScrollArea` for overflow, `Collapsible` for directories
  - Add a refresh button to re-fetch file list

  **Must NOT do**:
  - Do not show `.working/` or `.archive/` directories
  - Do not show `.directives.md` files as separate entries (they're accessed via tab in editor)
  - Do not implement drag-and-drop or file creation (follow-up)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New component with API integration, tree rendering, and interaction logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Tasks 3, 5)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 5

  **References**:

  **Pattern References**:
  - `src/components/chat/project-selector.tsx:99-186` — Sidebar variant pattern: `flex h-full flex-col`, section header with label + button, `ScrollArea` for list, item click handler
  - `src/components/chat/tool-meta.ts` — Icon mapping pattern. Create a similar `FILE_TYPE_ICONS` map for story file types.

  **API/Type References**:
  - `GET /api/projects/{id}/files` (Task 3) — Returns `{ success: true, files: string[] }`

  **WHY Each Reference Matters**:
  - `project-selector.tsx:99-186`: Exact sidebar section pattern to follow — same layout, spacing, interaction style
  - `tool-meta.ts`: Icon mapping convention — create analogous mapping for file types

  **Acceptance Criteria**:

  - [ ] File tree renders in sidebar below ProjectSelector
  - [ ] Root .md files show with type icons
  - [ ] characters/ and scenes/ are collapsible
  - [ ] Clicking a file calls `onFileSelect`
  - [ ] Selected file is visually highlighted
  - [ ] Refresh button re-fetches file list
  - [ ] `bun run build` → no errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: File tree renders project files
    Tool: Bash (bun dev + Playwright)
    Preconditions: Project with .novel/ containing world.md, characters/*.md, scenes/*.md
    Steps:
      1. Navigate to project chat
      2. Assert sidebar shows "设定文件" section
      3. Assert world.md, style.md, plot.md visible with icons
      4. Assert "角色/" collapsible group exists
      5. Click "角色/" → assert character files listed
    Expected Result: File tree shows all .novel/ files with correct structure
    Evidence: .sisyphus/evidence/task-6-file-tree-render.png

  Scenario: File selection triggers Sheet open
    Tool: Bash (bun dev + Playwright)
    Steps:
      1. Click "world.md" in file tree
      2. Assert Sheet opens from right side (file-editor kind)
      3. Assert selected file is highlighted in tree
    Expected Result: Clicking file opens editor Sheet
    Evidence: .sisyphus/evidence/task-6-file-select.png
  ```

  **Commit**: YES
  - Message: `feat(ui): StoryFileTree sidebar component`
  - Files: `src/components/chat/story-file-tree.tsx`, `src/app/page.tsx`
  - Pre-commit: `bun run build`

- [x] 7. CodeMirror 6 file editor Sheet

  **What to do**:
  - Install CodeMirror 6 packages: `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/language-data`, `@codemirror/theme-one-dark` (or use a custom theme matching shadcn/ui)
  - Create `src/components/chat/code-mirror-editor.tsx` — client component, dynamic imported with `ssr: false`
    - Props: `{ initialValue: string; onChange: (value: string) => void; readOnly?: boolean }`
    - Initialize CodeMirror 6 with markdown language support, line numbers, fold, bracket matching
    - Custom theme matching the app's color scheme (background, text, selection colors from CSS variables)
    - Call `onChange` on document changes (debounced)
    - `readOnly` prop sets EditorState.readOnly
  - Create `src/hooks/use-autosave.ts`
    - Params: `{ content: string; savedContent: string; onSave: () => Promise<void>; delay?: number (default 1500); enabled?: boolean }`
    - Returns: `{ saveStatus: "idle" | "saving" | "saved" | "error"; saveImmediately: () => Promise<void>; isDirty: boolean }`
    - Debounced auto-save, Cmd+S support, flush on unmount, minimum "Saving..." display time (600ms)
  - Create `src/components/chat/file-editor-sheet.tsx` — renders inside the shared Sheet when `sheetContent.kind === "file-editor"`
    - Fetches file content + hash from `GET /api/projects/{id}/files?path=X`
    - Renders CodeMirror editor with fetched content
    - Header: filename + save status indicator (Saved ✓ / Saving… / Unsaved ●)
    - View mode toggle: Edit / Read-only (simple toggle, not WYSIWYG)
    - On save: `PUT /api/projects/{id}/files` with current content + original hash
    - On 409 Conflict: auto-reload latest content from response, preserve user's current content as draft, show conflict banner with options: "Accept latest" / "Switch to my draft"
    - useAutosave hook wired to onChange + save function
  - Wire file-editor Sheet into `page.tsx`: when `sheetContent.kind === "file-editor"`, render `FileEditorSheet` instead of `ToolDetailSheet`

  **Must NOT do**:
  - Do not implement WYSIWYG/rich-text mode
  - Do not implement diff view or tracked changes
  - Do not add directives tab yet (that's Task 9)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple new components, CodeMirror 6 integration (non-trivial), auto-save hook with edge cases, conflict detection UI flow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Tasks 2, 3, 5)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 2, 3, 5

  **References**:

  **Pattern References**:
  - `src/components/chat/tool-detail-sheet.tsx` — Sheet content pattern: SheetHeader with title, ScrollArea for content area
  - `src/components/ui/sheet.tsx` — Sheet primitive with `side="right"`, custom className for width

  **API/Type References**:
  - `GET /api/projects/{id}/files?path=X` (Task 3) — Returns `{ data: { content, hash, lastModified } }`
  - `PUT /api/projects/{id]/files` (Task 3) — Accepts `{ path, content, hash }`, returns 409 on conflict

  **External References**:
  - CodeMirror 6 docs: `https://codemirror.net/docs/guide/` — Setup, markdown language, theming
  - `@codemirror/lang-markdown` — Markdown language support with nested code block languages

  **WHY Each Reference Matters**:
  - `tool-detail-sheet.tsx`: Same Sheet content structure — follow header + scrollable content pattern
  - `sheet.tsx`: Base Sheet primitive — must use same component for consistency
  - CodeMirror 6 docs: Required for correct initialization, especially `ssr: false` and theme setup

  **Acceptance Criteria**:

  - [ ] CodeMirror 6 editor renders markdown with syntax highlighting
  - [ ] CJK input works correctly (IME composition)
  - [ ] Auto-save triggers after 1.5s of no typing
  - [ ] Cmd+S triggers immediate save
  - [ ] Save status indicator shows correct states
  - [ ] 409 Conflict → auto-reload + draft preservation + conflict banner
  - [ ] Read-only mode prevents editing
  - [ ] `bun run build` → no errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Edit and auto-save a character file
    Tool: Bash (bun dev + Playwright)
    Preconditions: Project with characters/林黛玉.md
    Steps:
      1. Click 林黛玉.md in file tree → Sheet opens with editor
      2. Assert markdown content rendered with syntax highlighting
      3. Type "测试编辑" at end of file
      4. Wait 2 seconds → assert "Saved ✓" appears in header
      5. Re-open file → assert "测试编辑" is present in content
    Expected Result: Edit persists via auto-save
    Evidence: .sisyphus/evidence/task-7-autosave.png

  Scenario: CJK IME composition works
    Tool: Bash (bun dev + Playwright)
    Steps:
      1. Open file editor
      2. Type pinyin "lin" → select "林" from IME candidates
      3. Assert "林" appears correctly (not "l" + "i" + "n" fragments)
    Expected Result: CJK input via IME works correctly
    Evidence: .sisyphus/evidence/task-7-cjk-ime.png

  Scenario: Conflict detection on save
    Tool: Bash (curl + Playwright)
    Preconditions: File open in editor
    Steps:
      1. Note the hash from the editor's loaded state
      2. Via curl, modify the file on disk (simulating AI write)
      3. In editor, make a change and trigger save (Cmd+S)
      4. Assert conflict banner appears with "Accept latest" / "Switch to my draft" options
      5. Click "Accept latest" → assert editor shows disk content
    Expected Result: Conflict detected and handled with user choice
    Evidence: .sisyphus/evidence/task-7-conflict-detect.png
  ```

  **Commit**: YES
  - Message: `feat(ui): CodeMirror 6 file editor Sheet`
  - Files: `src/components/chat/code-mirror-editor.tsx`, `src/components/chat/file-editor-sheet.tsx`, `src/hooks/use-autosave.ts`, `src/app/page.tsx`, `package.json`
  - Pre-commit: `bun run build`

- [x] 8. Directives context injection in buildStoryContext

  **What to do**:
  - In `src/context/build-story-context.ts`, add directives reading logic:
    - For each in-scene character, check if `characters/{name}.directives.md` exists via `readDirectivesFile()`
    - If exists, read content and add as `ContextSection` with label `"{name} — 作者指令（不可违反）"` and priority -1 (new level, above existing priority 0)
    - Also check for root-level directives: `world.directives.md`, `plot.directives.md`, `timeline.directives.md`
    - If any exist, add as sections with label `"{type} — 作者指令"` and priority -1
  - Add priority -1 to the sorting logic (currently priorities are 0, 1, 2, 4 — -1 is new and highest)
  - Ensure directives content is counted in token budget and truncated if necessary (truncate from end, preserving the most important declarations at the top)
  - Write unit tests with mock directive files

  **Must NOT do**:
  - Do not modify existing priority values (0, 1, 2, 4 stay the same)
  - Do not change agent prompts (GM/Archivist directives awareness is follow-up)
  - Do not add directives for `style.md` (it IS user intent already)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Modifying core context assembly with new priority level and file reading logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 4)
  - **Blocks**: Task 9
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `src/context/build-story-context.ts` — Full context assembly function. Add directives reading after character resolution, before priority sort.
  - `src/context/extract.ts` — Content extraction helpers. May need a simple `extractDirectives()` or can use raw content.

  **API/Type References**:
  - `src/store/story-files.ts` (Task 2) — `readDirectivesFile(dir, entityPath)` — reads `*.directives.md`
  - `src/context/build-story-context.ts:ContextSection` — `{ label: string; content: string; priority: number }`

  **WHY Each Reference Matters**:
  - `build-story-context.ts`: The function being modified — must understand its section assembly and priority sort logic
  - `readDirectivesFile`: New store function for reading directives — the data source

  **Acceptance Criteria**:

  - [ ] If `characters/林黛玉.directives.md` exists, its content appears in buildStoryContext output at priority -1
  - [ ] If `world.directives.md` exists, its content appears at priority -1
  - [ ] Directives sections have "作者指令（不可违反）" label
  - [ ] Directives content is truncated if it exceeds remaining token budget
  - [ ] No directives files → buildStoryContext output unchanged from current behavior
  - [ ] `bun test tests/unit/context/build-story-context.test.ts` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Directives injected at highest priority
    Tool: Bash (bun test)
    Preconditions: Mock .novel/ with character file + directives file
    Steps:
      1. Create characters/林黛玉.md and characters/林黛玉.directives.md
      2. Call buildStoryContext(dir)
      3. Assert output contains "林黛玉 — 作者指令（不可违反）" section
      4. Assert directives section appears before "在场角色" section
    Expected Result: Directives at priority -1, above all existing sections
    Evidence: .sisyphus/evidence/task-8-directives-priority.txt

  Scenario: No directives files — no change
    Tool: Bash (bun test)
    Preconditions: Mock .novel/ without any .directives.md files
    Steps:
      1. Call buildStoryContext(dir)
      2. Assert output is identical to pre-change output
    Expected Result: Zero impact when no directives exist
    Evidence: .sisyphus/evidence/task-8-no-directives.txt
  ```

  **Commit**: YES
  - Message: `feat(context): inject directives into buildStoryContext`
  - Files: `src/context/build-story-context.ts`, `tests/unit/context/build-story-context.test.ts`
  - Pre-commit: `bun test`

- [x] 9. Directives UI — creation, editing, and badge in file tree

  **What to do**:
  - In `src/components/chat/story-file-tree.tsx`:
    - For files that have a `.directives.md` companion, show a small badge/indicator (e.g., "📋" icon next to filename)
    - Badge indicates "this entity has author directives"
  - In `src/components/chat/file-editor-sheet.tsx`:
    - Add tab bar in Sheet header: [状态] | [作者指令]
    - "状态" tab: shows the main .md file (current behavior)
    - "作者指令" tab:
      - If `.directives.md` exists: load and edit via CodeMirror (same editor component, different file)
      - If not exists: show empty state with "创建作者指令" button → creates empty `.directives.md` file via PUT API (special endpoint or same endpoint with directives-allowed flag)
    - Directives editor uses same useAutosave hook
    - Directives editor is always editable (no read-only mode for user-owned files)
  - Add API support for directives file writes:
    - Extend `PUT /api/projects/{id]/files` to allow `.directives.md` writes when request includes a special flag (e.g., `isDirectives: true` in body) — this distinguishes user-initiated writes from AI writes
    - Or create a separate endpoint `PUT /api/projects/{id}/directives?path=X` that only accepts `.directives.md` paths
  - When user creates/edits/deletes directives, the file tree badge updates accordingly

  **Must NOT do**:
  - Do not allow AI tools to write directives (Task 4 hard block stays)
  - Do not add structured format requirements for directives content (free-form)
  - Do not add directives for `style.md`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: UI additions with tab switching, creation flow, and API integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Tasks 6, 7, 8)
  - **Blocks**: None (final implementation task)
  - **Blocked By**: Tasks 6, 7, 8

  **References**:

  **Pattern References**:
  - `src/components/chat/file-editor-sheet.tsx` (Task 7) — Editor Sheet to extend with tabs
  - `src/components/chat/story-file-tree.tsx` (Task 6) — File tree to add badge

  **API/Type References**:
  - `GET /api/projects/{id}/files?path=characters/林黛玉.directives.md` (Task 3) — Read directives file
  - `PUT /api/projects/{id]/files` (Task 3) — Write directives file (with isDirectives flag)

  **WHY Each Reference Matters**:
  - `file-editor-sheet.tsx`: Component being extended — add tab UI and directives editing mode
  - `story-file-tree.tsx`: Component being extended — add badge for entities with directives

  **Acceptance Criteria**:

  - [ ] File tree shows badge for entities with directives
  - [ ] Editor Sheet has [状态] / [作者指令] tabs when directives exist or can be created
  - [ ] "创建作者指令" button creates empty directives file
  - [ ] Directives content editable and auto-saves
  - [ ] Deleting all content in directives + save → file deleted, badge removed
  - [ ] `bun run build` → no errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create and edit directives for a character
    Tool: Bash (bun dev + Playwright)
    Preconditions: Project with characters/林黛玉.md but no .directives.md
    Steps:
      1. Click 林黛玉.md in file tree → editor opens
      2. Assert [状态] tab is active, [作者指令] tab shows "创建" prompt
      3. Click [作者指令] tab → click "创建作者指令" button
      4. Assert empty editor appears
      5. Type "性格坚韧果决" → wait for auto-save
      6. Assert "Saved ✓" in header
      7. Close Sheet → assert 📋 badge appears next to 林黛玉.md in file tree
    Expected Result: Directives created, edited, saved, and badge shown
    Evidence: .sisyphus/evidence/task-9-directives-create.png

  Scenario: Directives tab shows existing content
    Tool: Bash (bun dev + Playwright)
    Preconditions: Character with existing .directives.md file
    Steps:
      1. Click character file → editor opens
      2. Assert [作者指令] tab shows 📋 indicator (has content)
      3. Click [作者指令] tab → assert existing directives content shown
      4. Edit content → assert auto-save works
    Expected Result: Existing directives load and are editable
    Evidence: .sisyphus/evidence/task-9-directives-edit.png

  Scenario: AI cannot write directives via tool
    Tool: Bash (bun test)
    Steps:
      1. Call writeFileTool with path="characters/林黛玉.directives.md"
      2. Assert error returned
    Expected Result: Tool-level block still enforced
    Evidence: .sisyphus/evidence/task-9-ai-block.txt
  ```

  **Commit**: YES
  - Message: `feat(ui): directives creation/editing in file editor`
  - Files: `src/components/chat/file-editor-sheet.tsx`, `src/components/chat/story-file-tree.tsx`, `src/app/api/projects/[id]/files/route.ts`
  - Pre-commit: `bun run build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (file tree → editor → save → conflict detection → directives). Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `feat(validation): extract shared validation module` — src/lib/validation.ts, tests/unit/lib/validation.test.ts
- **2**: `fix(store): atomic write and hash utility` — src/store/story-files.ts, src/lib/file-hash.ts, tests/unit/store/story-files.test.ts
- **3**: `feat(api): file CRUD endpoints with optimistic locking` — src/app/api/projects/[id]/files/route.ts, tests/
- **4**: `feat(tools): block directives paths in agent file tools` — src/tools/file-tools.ts, tests/unit/tools/file-tools.test.ts
- **5**: `refactor(ui): lift Sheet state to ProjectChat` — src/app/page.tsx, src/components/chat/message-item.tsx
- **6**: `feat(ui): StoryFileTree sidebar component` — src/components/chat/story-file-tree.tsx
- **7**: `feat(ui): CodeMirror 6 file editor Sheet` — src/components/chat/file-editor-sheet.tsx, src/components/chat/code-mirror-editor.tsx, src/hooks/use-autosave.ts
- **8**: `feat(context): inject directives into buildStoryContext` — src/context/build-story-context.ts, tests/unit/context/build-story-context.test.ts
- **9**: `feat(ui): directives creation/editing in file editor` — src/components/chat/file-editor-sheet.tsx, src/components/chat/story-file-tree.tsx

---

## Success Criteria

### Verification Commands
```bash
bun test                    # Expected: all tests pass
bun run build               # Expected: no errors
bun run lint                # Expected: no errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] File CRUD API responds correctly (list/read/write/delete + 409 conflict)
- [ ] CodeMirror 6 editor renders markdown with CJK input support
- [ ] Directives files cannot be written by AI tools
- [ ] Directives content appears in buildStoryContext output at highest priority
- [ ] Save-time conflict detection works (hash mismatch → reload + draft)
