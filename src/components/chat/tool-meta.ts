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
  submit_schedule: 0,
  call_actor: 1,
  enact_sequence: 1,
  call_scribe: 2,
  call_archivist: 3,
  call_archivist_characters: 3,
  call_archivist_scene: 3,
  call_archivist_world: 3,
  call_archivist_plot: 3,
  call_archivist_timeline: 3,
  call_archivist_debts: 3,
};

export const AGENT_TOOLS = new Set(["call_actor", "call_scribe", "call_archivist", "call_archivist_characters", "call_archivist_scene", "call_archivist_world", "call_archivist_plot", "call_archivist_timeline", "call_archivist_debts", "enact_sequence", "submit_schedule"]);

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
  submit_schedule: {
    toolName: "submit_schedule",
    agentKey: "gm",
    label: "排程",
    color: "#8B5CF6",
    icon: "📅",
    headlineParam: "schedule",
    category: "system",
  },
  call_archivist_characters: {
    toolName: "call_archivist_characters",
    agentKey: "archivist",
    label: "角色",
    color: "#10B981",
    icon: "👤",
    headlineParam: "narrativeSummary",
    category: "agent",
  },
  call_archivist_scene: {
    toolName: "call_archivist_scene",
    agentKey: "archivist",
    label: "场景",
    color: "#10B981",
    icon: "🎬",
    headlineParam: "narrativeSummary",
    category: "agent",
  },
  call_archivist_world: {
    toolName: "call_archivist_world",
    agentKey: "archivist",
    label: "世界",
    color: "#10B981",
    icon: "🌍",
    headlineParam: "narrativeSummary",
    category: "agent",
  },
  call_archivist_plot: {
    toolName: "call_archivist_plot",
    agentKey: "archivist",
    label: "剧情",
    color: "#10B981",
    icon: "📖",
    headlineParam: "narrativeSummary",
    category: "agent",
  },
  call_archivist_timeline: {
    toolName: "call_archivist_timeline",
    agentKey: "archivist",
    label: "时间线",
    color: "#10B981",
    icon: "⏳",
    headlineParam: "narrativeSummary",
    category: "agent",
  },
  call_archivist_debts: {
    toolName: "call_archivist_debts",
    agentKey: "archivist",
    label: "伏笔",
    color: "#10B981",
    icon: "🔗",
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
  enact_sequence: {
    toolName: "enact_sequence",
    agentKey: "actor",
    label: "序列演绎",
    color: "#EC4899",
    icon: "🎬",
    headlineParam: "schedule",
    category: "agent",
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

  // Special handling for schedule array: extract character names
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
