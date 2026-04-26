export interface ExecutionLog {
  id: string;
  agentName: string;      // "Actor", "Scribe", "Archivist"
  toolCallId?: string;     // The tool call ID from the parent agent
  input: string;           // Summary of the input
  output?: string;         // Summary/output text from the agent
  toolCalls?: string[];    // Tool calls made by this agent
  timestamp: number;       // Date.now() at start
  duration?: number;       // ms from start to completion
  tokenUsage?: {           // Token usage if available
    inputTokens?: number;
    outputTokens?: number;
  };
}
