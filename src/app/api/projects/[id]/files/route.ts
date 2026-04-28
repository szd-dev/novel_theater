import { statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/project/manager";
import { readNovelFile, writeNovelFile, deleteNovelFile, globNovelFiles } from "@/store/story-files";
import { computeFileHash } from "@/lib/file-hash";
import { getProjectDir } from "@/lib/project-path";
import { isSafePath, isAllowedFilePath, isDirectivesPath, isValidCharacterFile, isValidSceneFile } from "@/lib/validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    console.log(`[API /projects/:id/files] GET request, id=${id}`);

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { success: false, message: `Project not found: ${id}` },
        { status: 404 },
      );
    }

    const storyDir = join(project.dataDir, getProjectDir());

    const url = new URL(req.url);
    const pattern = url.searchParams.get("pattern");
    const path = url.searchParams.get("path");

    // List mode: ?pattern=characters
    if (pattern) {
      const files = await globNovelFiles(storyDir, pattern);
      return NextResponse.json({ success: true, files });
    }

    // Read mode: ?path=world.md
    if (path) {
      if (!isSafePath(path)) {
        return NextResponse.json(
          { success: false, message: `Unsafe path: ${path}` },
          { status: 400 },
        );
      }

      const content = await readNovelFile(storyDir, path);
      if (content === null) {
        return NextResponse.json(
          { success: false, message: `File not found: ${path}` },
          { status: 404 },
        );
      }

      const hash = computeFileHash(content);
      const fullPath = join(storyDir, path);
      let lastModified = 0;
      try {
        lastModified = statSync(fullPath).mtimeMs;
      } catch {
        // File may have been deleted between read and stat
      }

      return NextResponse.json({
        success: true,
        data: { content, hash, lastModified },
      });
    }

    return NextResponse.json(
      { success: false, message: "Must provide either 'pattern' or 'path' query parameter" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[API /projects/:id/files] Error in GET:", error);
    const message = error instanceof Error ? error.message : "Failed to get files";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    console.log(`[API /projects/:id/files] PUT request, id=${id}`);

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { success: false, message: `Project not found: ${id}` },
        { status: 404 },
      );
    }

    const storyDir = join(project.dataDir, getProjectDir());

    const body = await req.json();
    const { path, content, hash, isDirectives } = body as { path?: string; content?: string; hash?: string; isDirectives?: boolean };

    if (!path || typeof path !== "string") {
      return NextResponse.json(
        { success: false, message: "Missing or invalid 'path' in request body" },
        { status: 400 },
      );
    }

    if (content === undefined || typeof content !== "string") {
      return NextResponse.json(
        { success: false, message: "Missing or invalid 'content' in request body" },
        { status: 400 },
      );
    }

    if (!isSafePath(path)) {
      return NextResponse.json(
        { success: false, message: `Unsafe path: ${path}` },
        { status: 400 },
      );
    }

    if (!isAllowedFilePath(path)) {
      return NextResponse.json(
        { success: false, message: `Disallowed file path: ${path}` },
        { status: 400 },
      );
    }

    if (isDirectivesPath(path) && !isDirectives) {
      return NextResponse.json(
        { success: false, message: "作者指令文件请通过专用接口编辑" },
        { status: 403 },
      );
    }

    // Optimistic locking: if hash provided, verify it matches current file
    if (hash !== undefined) {
      const currentContent = await readNovelFile(storyDir, path);
      if (currentContent !== null) {
        const currentHash = computeFileHash(currentContent);
        if (currentHash !== hash) {
          return NextResponse.json(
            {
              success: false,
              message: "文件已被修改，请刷新后重试",
              currentContent,
              currentHash,
            },
            { status: 409 },
          );
        }
      }
    }

    if (!isDirectivesPath(path) && path.startsWith("characters/")) {
      if (!isValidCharacterFile(content)) {
        return NextResponse.json(
          { success: false, message: "角色文件格式无效：需要 # 标题行和 > L0 引用行" },
          { status: 400 },
        );
      }
    }

    if (!isDirectivesPath(path) && path.startsWith("scenes/")) {
      if (!isValidSceneFile(content)) {
        return NextResponse.json(
          { success: false, message: "场景文件格式无效：需要 ## 地点、## 时间、## 在场角色、## 经过 段落" },
          { status: 400 },
        );
      }
    }

    await writeNovelFile(storyDir, path, content);
    const newHash = computeFileHash(content);

    return NextResponse.json({ success: true, hash: newHash });
  } catch (error) {
    console.error("[API /projects/:id/files] Error in PUT:", error);
    const message = error instanceof Error ? error.message : "Failed to write file";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    console.log(`[API /projects/:id/files] DELETE request, id=${id}`);

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { success: false, message: `Project not found: ${id}` },
        { status: 404 },
      );
    }

    const storyDir = join(project.dataDir, getProjectDir());

    const url = new URL(req.url);
    const path = url.searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { success: false, message: "Missing 'path' query parameter" },
        { status: 400 },
      );
    }

    if (!isSafePath(path)) {
      return NextResponse.json(
        { success: false, message: `Unsafe path: ${path}` },
        { status: 400 },
      );
    }

    if (!isAllowedFilePath(path)) {
      return NextResponse.json(
        { success: false, message: `Disallowed file path: ${path}` },
        { status: 400 },
      );
    }

    const deleted = await deleteNovelFile(storyDir, path);
    if (!deleted) {
      return NextResponse.json(
        { success: false, message: `File not found or cannot be deleted: ${path}` },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /projects/:id/files] Error in DELETE:", error);
    const message = error instanceof Error ? error.message : "Failed to delete file";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
