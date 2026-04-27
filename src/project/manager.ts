import { join, resolve } from "node:path";
import { mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import type { Project } from "@/project/types";
import { getDataStoreDir } from "@/project/data-store";
import { generateProjectId } from "@/project/id-generator";
import { TEMPLATES, SUBDIRS } from "@/lib/templates";

const PROJECTS_SUBDIR = "projects";
const NOVEL_SUBDIR = ".novel";
const SESSIONS_SUBDIR = ".sessions";
const PROJECT_JSON = "project.json";

export function getProjectDataDir(id: string, dataStoreDir?: string): string {
  const base = dataStoreDir || getDataStoreDir();
  return join(base, PROJECTS_SUBDIR, id);
}

export async function createProject(name: string, dataStoreDir?: string): Promise<Project> {
  const base = dataStoreDir || getDataStoreDir();
  const id = generateProjectId(base);
  const projectDir = getProjectDataDir(id, base);

  mkdirSync(projectDir, { recursive: true });

  const novelDir = join(projectDir, NOVEL_SUBDIR);
  mkdirSync(novelDir, { recursive: true });

  for (const [filename, content] of Object.entries(TEMPLATES)) {
    await writeFile(join(novelDir, filename), content, "utf-8");
  }

  for (const subdir of SUBDIRS) {
    mkdirSync(join(novelDir, subdir), { recursive: true });
  }

  mkdirSync(join(projectDir, SESSIONS_SUBDIR), { recursive: true });

  const project: Project = {
    id,
    name,
    createdAt: new Date().toISOString(),
    dataDir: resolve(projectDir),
  };

  await writeFile(join(projectDir, PROJECT_JSON), JSON.stringify(project, null, 2), "utf-8");

  return project;
}

export async function getProject(id: string, dataStoreDir?: string): Promise<Project | undefined> {
  const projectDir = getProjectDataDir(id, dataStoreDir);
  const jsonPath = join(projectDir, PROJECT_JSON);

  if (!existsSync(jsonPath)) {
    return undefined;
  }

  const raw = await readFile(jsonPath, "utf-8");
  return JSON.parse(raw) as Project;
}

export async function listProjects(dataStoreDir?: string): Promise<Project[]> {
  const base = dataStoreDir || getDataStoreDir();
  const projectsDir = join(base, PROJECTS_SUBDIR);

  if (!existsSync(projectsDir)) {
    return [];
  }

  const projects: Project[] = [];
  const entries = readdirSync(projectsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const jsonPath = join(projectsDir, entry.name, PROJECT_JSON);
    if (!existsSync(jsonPath)) continue;

    const raw = await readFile(jsonPath, "utf-8");
    projects.push(JSON.parse(raw) as Project);
  }

  return projects;
}

export function deleteProject(id: string, dataStoreDir?: string): boolean {
  const projectDir = getProjectDataDir(id, dataStoreDir);

  if (!existsSync(projectDir)) {
    return false;
  }

  rmSync(projectDir, { recursive: true, force: true });
  return true;
}
