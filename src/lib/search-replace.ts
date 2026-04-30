type MatchResult =
  | { success: true; result: string; strategy: string }
  | { success: false; error: string };

function normalizeWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim();
}

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = content.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

function countLineOccurrences(
  contentLines: string[],
  searchLines: string[],
): number {
  let count = 0;
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let match = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (contentLines[i + j] !== searchLines[j]) {
        match = false;
        break;
      }
    }
    if (match) count++;
  }
  return count;
}

function replaceLineRange(
  contentLines: string[],
  startLine: number,
  endLine: number,
  replacement: string,
): string {
  const before = contentLines.slice(0, startLine);
  const after = contentLines.slice(endLine);
  return [...before, replacement, ...after].join("\n");
}

function findLineMatch(
  contentLines: string[],
  searchLines: string[],
  normalize: (line: string) => string = (l) => l,
): number {
  const normalizedSearch = searchLines.map(normalize);
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let match = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (normalize(contentLines[i + j]) !== normalizedSearch[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;
  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

export function findAndReplace(
  content: string,
  search: string,
  replace: string,
): MatchResult {
  if (search === "") {
    return { success: false, error: "搜索内容不能为空" };
  }

  // Layer 1: Exact match
  const exactIndex = content.indexOf(search);
  if (exactIndex !== -1) {
    const occurrences = countOccurrences(content, search);
    if (occurrences > 1) {
      return {
        success: false,
        error: `搜索内容在文件中出现 ${occurrences} 次，无法确定替换位置。请提供更多上下文使搜索内容唯一。`,
      };
    }
    return {
      success: true,
      result: content.slice(0, exactIndex) + replace + content.slice(exactIndex + search.length),
      strategy: "exact",
    };
  }

  const contentLines = content.split("\n");
  const searchLines = search.split("\n");

  // Layer 2: Whitespace-insensitive match (normalize whitespace within lines)
  const wsStart = findLineMatch(
    contentLines,
    searchLines,
    (line) => line.replace(/\s+/g, " ").trim(),
  );
  if (wsStart !== -1) {
    const wsSearchLines = searchLines.map((l) => l.replace(/\s+/g, " ").trim());
    const wsContentLines = contentLines.map((l) => l.replace(/\s+/g, " ").trim());
    const wsOccurrences = countLineOccurrences(wsContentLines, wsSearchLines);
    if (wsOccurrences > 1) {
      return {
        success: false,
        error: `搜索内容（空白归一化后）在文件中出现 ${wsOccurrences} 次，无法确定替换位置。请提供更多上下文。`,
      };
    }
    return {
      success: true,
      result: replaceLineRange(contentLines, wsStart, wsStart + searchLines.length, replace),
      strategy: "whitespace-insensitive",
    };
  }

  // Layer 3: Indentation-preserving match (trim leading whitespace only)
  const indentStart = findLineMatch(
    contentLines,
    searchLines,
    (line) => line.trimStart(),
  );
  if (indentStart !== -1) {
    const indentSearchLines = searchLines.map((l) => l.trimStart());
    const indentContentLines = contentLines.map((l) => l.trimStart());
    const indentOccurrences = countLineOccurrences(indentContentLines, indentSearchLines);
    if (indentOccurrences > 1) {
      return {
        success: false,
        error: `搜索内容（忽略缩进后）在文件中出现 ${indentOccurrences} 次，无法确定替换位置。请提供更多上下文。`,
      };
    }
    // Preserve the indentation of the first matched line
    const originalFirstLine = contentLines[indentStart];
    const searchFirstLine = searchLines[0];
    const leadingWhitespace = originalFirstLine.slice(
      0,
      originalFirstLine.length - originalFirstLine.trimStart().length,
    );
    const searchLeading = searchFirstLine.slice(
      0,
      searchFirstLine.length - searchFirstLine.trimStart().length,
    );
    const indentDelta = leadingWhitespace.length - searchLeading.length;
    const adjustedReplace =
      indentDelta !== 0
        ? replace
            .split("\n")
            .map((line) => (line.trim() ? " ".repeat(Math.max(0, indentDelta)) + line : line))
            .join("\n")
        : replace;

    return {
      success: true,
      result: replaceLineRange(
        contentLines,
        indentStart,
        indentStart + searchLines.length,
        adjustedReplace,
      ),
      strategy: "indentation-preserving",
    };
  }

  // Layer 4: Fuzzy match (line-level sliding window with similarity threshold)
  const FUZZY_THRESHOLD = 0.8;
  let bestScore = 0;
  let bestStart = -1;

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const candidate = contentLines.slice(i, i + searchLines.length).join("\n");
    const score = calculateSimilarity(
      normalizeWhitespace(candidate),
      normalizeWhitespace(search),
    );
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  if (bestScore >= FUZZY_THRESHOLD && bestStart !== -1) {
    return {
      success: true,
      result: replaceLineRange(
        contentLines,
        bestStart,
        bestStart + searchLines.length,
        replace,
      ),
      strategy: `fuzzy (${Math.round(bestScore * 100)}%)`,
    };
  }

  return {
    success: false,
    error: `搜索内容未找到。已尝试：精确匹配 → 空白归一化匹配 → 忽略缩进匹配 → 模糊匹配（最佳相似度 ${Math.round(bestScore * 100)}%，阈值 ${Math.round(FUZZY_THRESHOLD * 100)}%）。请确认搜索内容与文件中的文本一致。`,
  };
}
