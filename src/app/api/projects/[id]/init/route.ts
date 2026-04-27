import { NextRequest, NextResponse } from "next/server";
import { getProject, getProjectDataDir } from "@/project/manager";
import { resetStory } from "@/store/story-files";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    console.log("[API /projects/:id/init] Initializing project:", id);
    const project = await getProject(id);

    if (!project) {
      return NextResponse.json(
        { success: false, message: `Project not found: ${id}` },
        { status: 404 },
      );
    }

    const dataDir = getProjectDataDir(id);
    const novelDir = `${dataDir}/.novel`;
    const result = await resetStory(novelDir);

    return NextResponse.json({ success: true, message: result });
  } catch (error) {
    console.error("[API /projects/:id/init] Error initializing project:", error);
    const message = error instanceof Error ? error.message : "Failed to initialize project";
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}
