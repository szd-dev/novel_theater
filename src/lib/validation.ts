export function isSafePath(relativePath: string): boolean {
  if (relativePath.includes('..')) return false;
  if (relativePath.startsWith('/')) return false;
  if (relativePath.startsWith('.working/') || relativePath.startsWith('.archive/')) return false;
  return true;
}

export function isValidCharacterFile(content: string): boolean {
  const lines = content.split('\n');
  const hasHeading = lines[0]?.startsWith('# ');
  const hasL0 = lines.some((l) => l.startsWith('> '));
  return hasHeading && hasL0;
}

export function isValidSceneFile(content: string): boolean {
  const required = ['## 地点', '## 时间', '## 在场角色', '## 经过'];
  return required.every((section) => content.includes(section));
}

export function isDirectivesPath(path: string): boolean {
  return path.endsWith('.directives.md');
}

export function isAllowedFilePath(path: string): boolean {
  if (!path || path.trim() === '') return false;
  if (path.startsWith('/')) return false;
  if (path.startsWith('.working/') || path.startsWith('.archive/')) return false;
  if (path.includes('\0')) return false;
  // Must end with .md or be a directory-like pattern (no extension)
  const lastSegment = path.split('/').pop() ?? '';
  if (lastSegment.includes('.') && !lastSegment.endsWith('.md')) return false;
  return true;
}
