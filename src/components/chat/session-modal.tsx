"use client";

import { useState, useEffect } from "react";
import { AgentLabel, type AgentKey } from "@/components/chat/agent-label";

interface ExecutionLogSummary {
  id: string;
  agentName: string;
  toolCallId?: string;
  input: string;
  output?: string;
  timestamp: number;
  duration?: number;
  toolCalls?: string[];
  tokenUsage?: { inputTokens?: number; outputTokens?: number };
}

interface SessionModalProps {
  threadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AGENT_KEY_MAP: Record<string, AgentKey> = {
  Actor: "actor",
  Scribe: "scribe",
  Archivist: "archivist",
  GM: "gm",
};

export function SessionModal({ threadId, open, onOpenChange }: SessionModalProps) {
  const [logs, setLogs] = useState<ExecutionLogSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetch(`/api/sessions?threadId=${threadId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setLogs(data.logs);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLogs([]);
      setExpandedId(null);
    }
  }, [open, threadId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Subagent 执行日志</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无执行日志</p>
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-md border p-3">
                <button
                  className="flex w-full items-center gap-2 text-left"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <AgentLabel agent={AGENT_KEY_MAP[log.agentName] ?? "gm"} />
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.timestamp).toLocaleTimeString()}
                    {log.duration ? ` · ${log.duration}ms` : ""}
                  </span>
                </button>
                {expandedId === log.id && (
                  <div className="mt-2 space-y-2 border-t pt-2 text-sm">
                    {log.input && (
                      <div>
                        <span className="font-medium">输入:</span>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {log.input}
                        </p>
                      </div>
                    )}
                    {log.output && (
                      <div>
                        <span className="font-medium">输出:</span>
                        <p className="mt-1 whitespace-pre-wrap">{log.output}</p>
                      </div>
                    )}
                    {log.toolCalls && log.toolCalls.length > 0 && (
                      <div>
                        <span className="font-medium">工具调用:</span>
                        <p className="mt-1 text-muted-foreground">
                          {log.toolCalls.join(", ")}
                        </p>
                      </div>
                    )}
                    {log.tokenUsage && (
                      <div className="text-xs text-muted-foreground">
                        Tokens: {log.tokenUsage.inputTokens ?? 0} in /{" "}
                        {log.tokenUsage.outputTokens ?? 0} out
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
