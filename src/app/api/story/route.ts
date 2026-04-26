import { NextRequest, NextResponse } from "next/server";
import { initStory, archiveStory, resetStory } from "@/store/story-files";

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

  const { action, name } = body;
  const dir = process.cwd();

  switch (action) {
    case "init": {
      const result = await initStory(dir);
      return NextResponse.json({ success: true, message: result });
    }

    case "archive": {
      if (!name || typeof name !== "string") {
        return NextResponse.json(
          { success: false, message: "归档名不能为空" },
          { status: 400 },
        );
      }
      const trimmed = name.trim();
      if (
        trimmed.includes("/") ||
        trimmed.includes("\\") ||
        trimmed.includes("..") ||
        trimmed.length > 200
      ) {
        return NextResponse.json(
          { success: false, message: "归档名包含非法字符或过长" },
          { status: 400 },
        );
      }
      const result = await archiveStory(dir, name);
      const success =
        !result.includes("失败") &&
        !result.includes("不能") &&
        !result.includes("已存在");
      return NextResponse.json(
        { success, message: result },
        { status: success ? 200 : 400 },
      );
    }

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
