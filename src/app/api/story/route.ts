import { NextRequest, NextResponse } from "next/server";
import { resetStory } from "@/store/story-files";
import { resolveProjectPath } from "@/lib/project-path";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "无效的请求体" },
      { status: 400 },
    );
  }

  const { action } = body;
  const dir = resolveProjectPath();

  switch (action) {
    case "reset": {
      const result = await resetStory(dir);
      const success = !result.includes("失败");
      return NextResponse.json(
        { success, message: result },
        { status: success ? 200 : 500 },
      );
    }

    default:
      return NextResponse.json(
        { success: false, message: `未知操作: ${action}` },
        { status: 400 },
      );
  }
}
