import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/project/manager";

export async function GET() {
  try {
    console.log("[API /projects] Listing projects");
    const projects = await listProjects();
    return NextResponse.json({ success: true, projects });
  } catch (error) {
    console.error("[API /projects] Error listing projects:", error);
    const message = error instanceof Error ? error.message : "Failed to list projects";
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  const { name } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { success: false, message: "Project name is required" },
      { status: 400 },
    );
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return NextResponse.json(
      { success: false, message: "Project name cannot be empty" },
      { status: 400 },
    );
  }

  try {
    console.log("[API /projects] Creating project:", trimmed);
    const project = await createProject(trimmed);
    return NextResponse.json({ success: true, project }, { status: 201 });
  } catch (error) {
    console.error("[API /projects] Error creating project:", error);
    const message = error instanceof Error ? error.message : "Failed to create project";
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}
