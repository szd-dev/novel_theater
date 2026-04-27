import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";

const PROJECT_ID_PREFIX = "p";
const PROJECT_ID_PAD_LENGTH = 3;

export function generateProjectId(dataStoreDir: string): string {
  const projectsDir = join(dataStoreDir, "projects");

  if (!existsSync(projectsDir)) {
    return `${PROJECT_ID_PREFIX}001`;
  }

  let maxNum = 0;
  const entries = readdirSync(projectsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^p(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${PROJECT_ID_PREFIX}${String(nextNum).padStart(PROJECT_ID_PAD_LENGTH, "0")}`;
}
