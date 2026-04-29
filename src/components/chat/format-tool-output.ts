import { TOOL_META_MAP, AGENT_TOOLS } from "@/components/chat/tool-meta";

export interface FormattedOutput {
  kind: "text" | "code" | "file-list" | "success" | "error" | "agent-result";
  content: string;
  metadata?: Record<string, string>;
  items?: string[]; // entries for file-list kind
  language?: string; // syntax hint for code kind (e.g., "markdown", "json")
}

export interface ParsedToolOutput {
  ok: boolean;
  data?: string;
  error?: string;
}

export function parseToolOutput(raw: string | undefined): ParsedToolOutput | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "ok" in parsed) {
      return parsed as ParsedToolOutput;
    }
  } catch {
    return null;
  }
  return null;
}

export function extractDisplayData(toolName: string, parsed: ParsedToolOutput): string | undefined {
  if (!parsed.ok || !parsed.data) return undefined;
  if (!AGENT_TOOLS.has(toolName)) return parsed.data;
  try {
    const inner = JSON.parse(parsed.data);
    if (inner && typeof inner === "object" && "output" in inner) {
      return String(inner.output);
    }
  } catch {
    return parsed.data;
  }
  return parsed.data;
}


export function formatToolOutput(toolName: string, rawOutput: string): FormattedOutput {
  const meta = TOOL_META_MAP[toolName];
  const category = meta?.category ?? "system";
  const parsed = parseToolOutput(rawOutput);

  if (!parsed || !parsed.ok) {
    return {
      kind: "error",
      content: parsed?.error ?? "未知错误",
    };
  }

  switch (category) {
    case "agent":
      return formatAgentOutput(toolName, parsed);
    case "file":
      return formatFileOutput(toolName, parsed);
    case "character":
      return formatCharacterOutput(toolName, parsed);
    case "system":
      return formatSystemOutput(toolName, parsed);
    default:
      return { kind: "text", content: parsed.data ?? "" };
  }
}

function formatAgentOutput(toolName: string, parsed: ParsedToolOutput): FormattedOutput {
  if (toolName === "enact_sequence") {
    return formatEnactSequenceOutput(parsed);
  }

  const displayData = extractDisplayData(toolName, parsed);
  const metadata: Record<string, string> = {};

  try {
    const inner = JSON.parse(parsed.data ?? "");
    if (inner.sessionId) metadata["会话"] = inner.sessionId;
    if (inner.isNewSession !== undefined) metadata["新会话"] = inner.isNewSession ? "是" : "否";
  } catch {}

  return {
    kind: "agent-result",
    content: displayData ?? parsed.data ?? "",
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function formatFileOutput(toolName: string, parsed: ParsedToolOutput): FormattedOutput {
  if (toolName === "read_file") {
    return {
      kind: "code",
      content: parsed.data ?? "",
      language: "markdown", // .novel files are markdown
    };
  }

  if (toolName === "glob_files") {
    const files = (parsed.data ?? "").split("\n").filter(Boolean);
    return {
      kind: "file-list",
      content: parsed.data ?? "",
      items: files,
    };
  }

  if (toolName === "write_file" || toolName === "edit_file") {
    return {
      kind: "success",
      content: "文件操作成功",
    };
  }

  return { kind: "text", content: parsed.data ?? "" };
}

function formatCharacterOutput(toolName: string, parsed: ParsedToolOutput): FormattedOutput {
  if (toolName === "resolve_character") {
    return {
      kind: "success",
      content: parsed.data ?? "角色解析成功",
    };
  }

  if (toolName === "list_characters") {
    const files = (parsed.data ?? "").split("\n").filter(Boolean);
    return {
      kind: "file-list",
      content: parsed.data ?? "",
      items: files,
    };
  }

  return { kind: "text", content: parsed.data ?? "" };
}

function formatEnactSequenceOutput(parsed: ParsedToolOutput): FormattedOutput {
  const metadata: Record<string, string> = {};
  let steps: Array<{ character: string; status: string; error?: string }> = [];

  try {
    const inner = JSON.parse(parsed.data ?? "");
    steps = inner.steps ?? [];
    if (inner.message) metadata["摘要"] = inner.message;
  } catch {}

  const content = steps
    .map((s, i) => {
      const icon = s.status === "success" ? "✅" : "❌";
      const err = s.error ? ` — ${s.error}` : "";
      return `${i + 1}. ${icon} ${s.character}${err}`;
    })
    .join("\n");

  return {
    kind: "agent-result",
    content,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function formatSystemOutput(_toolName: string, parsed: ParsedToolOutput): FormattedOutput {
  return {
    kind: "success",
    content: parsed.data ?? "操作完成",
  };
}
