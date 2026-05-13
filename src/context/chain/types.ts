import type { ArchivistResponsibility } from "@/agents/archivist/types";

/** 上下文消息（将作为一条 user message 注入到 session 中） */
export interface ContextMessage {
  /** 消息标签，用于调试和日志 */
  label: string;
  /** 消息内容 */
  content: string;
}

/** 上下文角色类型 */
export type ContextRole =
  | "gm"
  | "actor"
  | "scribe"
  | `archivist-${ArchivistResponsibility}`;

/** 处理器收到的请求上下文 */
export interface ContextRequest {
  /** .novel/ 目录路径 */
  storyDir: string;
  /** 当前角色类型 */
  role: ContextRole;
  /** run() 传来的 context 对象 */
  runContext: Record<string, unknown>;
  /** 已累积的消息（链中前序处理器产生的结果） */
  accumulatedMessages: ContextMessage[];

  // --- 角色特有的可选字段 ---

  /** Actor: 角色名称 */
  characterName?: string;
  /** Actor: 角色文件内容 */
  characterFile?: string;
  /** Scribe: 风格指南内容 */
  styleGuide?: string;
  /** Archivist: 职责类型 */
  responsibility?: ArchivistResponsibility;

  /** 共享缓存 — 跨 Handler 传递预计算结果，避免重复 I/O */
  _cache: Map<string, unknown>;
}

/** 处理器返回值 */
export interface ContextResult {
  /** 追加的消息 */
  messages: ContextMessage[];
}

/** 处理器接口（责任链节点） */
export interface ContextHandler {
  /** 设置下一个处理器，返回下一个以支持链式调用 */
  setNext(handler: ContextHandler): ContextHandler;
  /** 处理请求，产出上下文消息 */
  handle(request: ContextRequest): Promise<ContextResult>;
}