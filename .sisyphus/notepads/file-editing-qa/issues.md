# Issues Found During QA

## Test Failures (Fixed)

### 1. Archivist tools test outdated
- **File**: `tests/integration/e2e.test.ts:41`
- **Issue**: Test expected 5 tools but archivist now has 6 (added `list_characters`)
- **Fix**: Updated expected array to include `list_characters`

### 2. Story-files tests assumed old API (`.novel/` as subdirectory)
- **Files**: `tests/unit/store/story-files.test.ts`, `tests/integration/e2e.test.ts`
- **Issue**: `initStory(dir)` now treats `dir` AS the novel directory, not the parent. Tests used `mkdtempSync` which creates the directory, causing `initStory` to return "already initialized". Tests also checked for `join(dir, ".novel", ...)` instead of `join(dir, ...)`.
- **Fix**: Tests now create a parent temp dir and pass `join(parentDir, ".novel")` as the novel dir. Archive assertions use `join(parentDir, ".archive", ...)` matching `dirname(dir)` logic in source.
