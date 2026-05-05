export type AgentKey = "gm" | "actor" | "scribe" | "archivist";

export interface ToolMeta {
  toolName: string;
  agentKey: AgentKey;
  label: string;
  color: string;
  icon: string;
  headlineParam?: string;
  category: "agent" | "file" | "character" | "system";
}

export const AGENT_COLORS = {
  gm: "#8B5CF6",
  actor: "#EC4899",
  scribe: "#F59E0B",
  archivist: "#10B981",
} as const;

export const AGENT_NAMES = {
  gm: "GM",
  actor: "演员",
  scribe: "书记",
  archivist: "场记",
} as const;

export const TOOL_STEP_MAP: Record<string, number> = {
  submit_schedule: 0,
  Actor: 1,
  Scribe: 2,
  "archivist-characters": 3,
  "archivist-scene": 3,
  "archivist-world": 3,
  "archivist-plot": 3,
  "archivist-timeline": 3,
  "archivist-debts": 3,
};

export const TOOL_META_MAP: Record<string, ToolMeta> = {
  submit_schedule: {
    toolName: "submit_schedule",
    agentKey: "gm",
    label: "排程",
    color: "#8B5CF6",
    icon: "📅",
    headlineParam: "schedule",
    category: "system",
  },
  read_file: {
    toolName: "read_file",
    agentKey: "gm",
    label: "读取",
    color: "#6B7280",
    icon: "📄",
    headlineParam: "path",
    category: "file",
  },
  write_file: {
    toolName: "write_file",
    agentKey: "gm",
    label: "写入",
    color: "#6B7280",
    icon: "✏️",
    headlineParam: "path",
    category: "file",
  },
  glob_files: {
    toolName: "glob_files",
    agentKey: "gm",
    label: "查找",
    color: "#6B7280",
    icon: "🔍",
    headlineParam: "pattern",
    category: "file",
  },
  resolve_character: {
    toolName: "resolve_character",
    agentKey: "gm",
    label: "解析角色",
    color: "#6B7280",
    icon: "👤",
    headlineParam: "name",
    category: "character",
  },
  Actor: {
    toolName: "Actor",
    agentKey: "actor",
    label: "演员",
    color: "#EC4899",
    icon: "🎭",
    category: "agent",
  },
  Scribe: {
    toolName: "Scribe",
    agentKey: "scribe",
    label: "书记",
    color: "#F59E0B",
    icon: "📝",
    category: "agent",
  },
  "archivist-characters": {
    toolName: "archivist-characters",
    agentKey: "archivist",
    label: "角色",
    color: "#10B981",
    icon: "👤",
    category: "agent",
  },
  "archivist-scene": {
    toolName: "archivist-scene",
    agentKey: "archivist",
    label: "场景",
    color: "#10B981",
    icon: "🎬",
    category: "agent",
  },
  "archivist-world": {
    toolName: "archivist-world",
    agentKey: "archivist",
    label: "世界",
    color: "#10B981",
    icon: "🌍",
    category: "agent",
  },
  "archivist-plot": {
    toolName: "archivist-plot",
    agentKey: "archivist",
    label: "剧情",
    color: "#10B981",
    icon: "📖",
    category: "agent",
  },
  "archivist-timeline": {
    toolName: "archivist-timeline",
    agentKey: "archivist",
    label: "时间线",
    color: "#10B981",
    icon: "⏳",
    category: "agent",
  },
  "archivist-debts": {
    toolName: "archivist-debts",
    agentKey: "archivist",
    label: "伏笔",
    color: "#10B981",
    icon: "🔗",
    category: "agent",
  },
};

export const AGENT_TOOLS = new Set(
  Object.values(TOOL_META_MAP)
    .filter(m => m.category === "agent")
    .map(m => m.toolName),
);

const DEFAULT_META: ToolMeta = {
  toolName: "unknown",
  agentKey: "gm",
  label: "工具",
  color: "#6B7280",
  icon: "🔧",
  category: "system",
};

export function getToolMeta(toolName: string): ToolMeta {
  return TOOL_META_MAP[toolName] ?? DEFAULT_META;
}

export function getHeadlineValue(toolName: string, input: Record<string, unknown>): string {
  const meta = TOOL_META_MAP[toolName];
  if (!meta?.headlineParam) return "";
  const value = input[meta.headlineParam];
  if (value === undefined || value === null) return "";

  if (meta.headlineParam === "schedule" && Array.isArray(value)) {
    const names = value
      .map((s: { character?: string }) => s.character ?? "")
      .filter(Boolean);
    const joined = names.join("→");
    return joined.length > 30 ? joined.slice(0, 30) + "…" : joined;
  }

  const str = String(value);
  return str.length > 30 ? str.slice(0, 30) + "…" : str;
}

export function toolNameToAgentKey(toolName: string): AgentKey {
  const meta = TOOL_META_MAP[toolName];
  return meta?.agentKey ?? "gm";
}
