import { join } from "node:path";

/** Get the project directory name from env (default: .novel) */
export function getProjectDir(): string {
  return process.env.PROJECT_DIR || ".novel";
}

/** Resolve the full project path (baseDir + projectDir) */
export function resolveProjectPath(baseDir?: string): string {
  return join(baseDir || process.cwd(), getProjectDir());
}
