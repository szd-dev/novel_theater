import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/project/manager";
import { getProjectDir } from "@/lib/project-path";
import { listAllCharacters } from "@/context/character-resolver";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    console.log(`[API /projects/:id/characters] GET request, id=${id}`);

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { success: false, message: `Project not found: ${id}` },
        { status: 404 },
      );
    }

    const storyDir = join(project.dataDir, getProjectDir());
    const characters = await listAllCharacters(storyDir);

    return NextResponse.json({ success: true, characters });
  } catch (error) {
    console.error("[API /projects/:id/characters] Error in GET:", error);
    const message = error instanceof Error ? error.message : "Failed to get characters";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
