import { NextRequest, NextResponse } from "next/server";
import { getProject, deleteProject } from "@/project/manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    console.log("[API /projects/:id] Getting project:", id);
    const project = await getProject(id);

    if (!project) {
      return NextResponse.json(
        { success: false, message: `Project not found: ${id}` },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error("[API /projects/:id] Error getting project:", error);
    const message = error instanceof Error ? error.message : "Failed to get project";
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    console.log("[API /projects/:id] Deleting project:", id);
    const deleted = deleteProject(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, message: `Project not found: ${id}` },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, message: `Project ${id} deleted` });
  } catch (error) {
    console.error("[API /projects/:id] Error deleting project:", error);
    const message = error instanceof Error ? error.message : "Failed to delete project";
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}
