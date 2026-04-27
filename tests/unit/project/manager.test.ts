import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generateProjectId } from "@/project/id-generator";
import { getDataStoreDir } from "@/project/data-store";
import {
  createProject,
  getProject,
  listProjects,
  deleteProject,
  getProjectDataDir,
} from "@/project/manager";
import { TEMPLATES, SUBDIRS } from "@/lib/templates";

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "novel-project-test-"));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("getDataStoreDir", () => {
  test("returns default ./.data_store resolved to absolute", () => {
    const original = process.env.DATA_STORE_DIR;
    delete process.env.DATA_STORE_DIR;
    const dir = getDataStoreDir();
    expect(dir).toBe(resolve("./.data_store"));
    if (original) process.env.DATA_STORE_DIR = original;
  });

  test("reads DATA_STORE_DIR from env", () => {
    const original = process.env.DATA_STORE_DIR;
    process.env.DATA_STORE_DIR = "/tmp/custom-store";
    const dir = getDataStoreDir();
    expect(dir).toBe("/tmp/custom-store");
    if (original) process.env.DATA_STORE_DIR = original;
    else delete process.env.DATA_STORE_DIR;
  });
});

describe("generateProjectId", () => {
  test("returns p001 when no projects exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-id-gen-"));
    try {
      expect(generateProjectId(dir)).toBe("p001");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns p001 when projects dir does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-id-gen2-"));
    try {
      expect(generateProjectId(join(dir, "nonexistent"))).toBe("p001");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("increments from max existing ID", () => {
    const dir = mkdtempSync(join(tmpdir(), "novel-id-gen3-"));
    try {
      const projectsDir = join(dir, "projects");
      mkdirSync(projectsDir, { recursive: true });
      mkdirSync(join(projectsDir, "p001"));
      mkdirSync(join(projectsDir, "p003"));
      expect(generateProjectId(dir)).toBe("p004");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createProject", () => {
  test("creates project with correct structure", async () => {
    const project = await createProject("测试项目", tempDir);

    expect(project.id).toBe("p001");
    expect(project.name).toBe("测试项目");
    expect(project.createdAt).toBeTruthy();
    expect(project.dataDir).toBe(resolve(getProjectDataDir("p001", tempDir)));

    const projectDir = getProjectDataDir("p001", tempDir);
    expect(existsSync(join(projectDir, "project.json"))).toBe(true);
    expect(existsSync(join(projectDir, ".novel"))).toBe(true);
    expect(existsSync(join(projectDir, ".sessions"))).toBe(true);

    for (const filename of Object.keys(TEMPLATES)) {
      expect(existsSync(join(projectDir, ".novel", filename))).toBe(true);
    }
    for (const subdir of SUBDIRS) {
      expect(existsSync(join(projectDir, ".novel", subdir))).toBe(true);
    }
  });

  test("writes valid project.json", async () => {
    await createProject("JSON测试", tempDir);
    const projectDir = getProjectDataDir("p002", tempDir);
    const raw = readFileSync(join(projectDir, "project.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.id).toBe("p002");
    expect(parsed.name).toBe("JSON测试");
    expect(parsed.dataDir).toBeTruthy();
  });
});

describe("getProject", () => {
  test("returns undefined for nonexistent project", async () => {
    const result = await getProject("p999", tempDir);
    expect(result).toBeUndefined();
  });

  test("returns existing project", async () => {
    const created = await createProject("获取测试", tempDir);
    const fetched = await getProject(created.id, tempDir);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe(created.name);
  });
});

describe("listProjects", () => {
  test("returns empty array when no projects", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "novel-list-empty-"));
    try {
      const projects = await listProjects(emptyDir);
      expect(projects).toEqual([]);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test("lists all projects", async () => {
    const listDir = mkdtempSync(join(tmpdir(), "novel-list-"));
    try {
      await createProject("项目A", listDir);
      await createProject("项目B", listDir);
      const projects = await listProjects(listDir);
      expect(projects).toHaveLength(2);
      expect(projects.map((p) => p.name).sort()).toEqual(["项目A", "项目B"]);
    } finally {
      rmSync(listDir, { recursive: true, force: true });
    }
  });
});

describe("deleteProject", () => {
  test("returns false for nonexistent project", () => {
    expect(deleteProject("p999", tempDir)).toBe(false);
  });

  test("removes project directory", async () => {
    const delDir = mkdtempSync(join(tmpdir(), "novel-del-"));
    try {
      const project = await createProject("待删除", delDir);
      const projectDir = getProjectDataDir(project.id, delDir);
      expect(existsSync(projectDir)).toBe(true);

      const result = deleteProject(project.id, delDir);
      expect(result).toBe(true);
      expect(existsSync(projectDir)).toBe(false);
    } finally {
      rmSync(delDir, { recursive: true, force: true });
    }
  });
});

describe("getProjectDataDir", () => {
  test("returns correct path", () => {
    const dir = getProjectDataDir("p001", "/data");
    expect(dir).toBe("/data/projects/p001");
  });
});
