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

export const AGENT_KEY_MAP: Record<string, AgentKey> = {
  Actor: "actor",
  Scribe: "scribe",
  Archivist: "archivist",
  GM: "gm",
};

export const TOOL_STEP_MAP: Record<string, number> = {
  call_actor: 1,
  call_scribe: 2,
  call_archivist: 3,
};

export const AGENT_TOOLS = new Set(["call_actor", "call_scribe", "call_archivist"]);

export const TOOL_META_MAP: Record<string, ToolMeta> = {
  call_actor: {
    toolName: "call_actor",
    agentKey: "actor",
    label: "演员",
    color: "#EC4899",
    icon: "🎭",
    headlineParam: "character",
    category: "agent",
  },
  call_scribe: {
    toolName: "call_scribe",
    agentKey: "scribe",
    label: "书记",
    color: "#F59E0B",
    icon: "📝",
    headlineParam: "sceneContext",
    category: "agent",
  },
  call_archivist: {
    toolName: "call_archivist",
    agentKey: "archivist",
    label: "场记",
    color: "#10B981",
    icon: "📋",
    headlineParam: "narrativeSummary",
    category: "agent",
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
  edit_file: {
    toolName: "edit_file",
    agentKey: "gm",
    label: "编辑",
    color: "#6B7280",
    icon: "🔧",
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
  list_characters: {
    toolName: "list_characters",
    agentKey: "gm",
    label: "列出角色",
    color: "#6B7280",
    icon: "👥",
    category: "character",
  },
  clear_interaction_log: {
    toolName: "clear_interaction_log",
    agentKey: "gm",
    label: "清除记录",
    color: "#8B5CF6",
    icon: "🗑️",
    category: "system",
  },
  reset_story: {
    toolName: "reset_story",
    agentKey: "gm",
    label: "重置故事",
    color: "#EF4444",
    icon: "⚠️",
    category: "system",
  },
};

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
  const str = String(value);
  return str.length > 30 ? str.slice(0, 30) + "…" : str;
}

export function toolNameToAgentKey(toolName: string): AgentKey {
  const meta = TOOL_META_MAP[toolName];
  return meta?.agentKey ?? "gm";
}
