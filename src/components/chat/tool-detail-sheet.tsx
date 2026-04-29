"use client";

import { getToolMeta } from "@/components/chat/tool-meta";
import {
  formatToolOutput,
  type FormattedOutput,
} from "@/components/chat/format-tool-output";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export type DynamicToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

interface ToolDetailContentProps {
  toolName: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  state?: DynamicToolState;
}

export function ToolDetailContent({
  toolName,
  input,
  output,
  error,
  state,
}: ToolDetailContentProps) {
  const meta = getToolMeta(toolName);
  const formatted: FormattedOutput | null = output
    ? formatToolOutput(toolName, output)
    : null;
  const isError =
    state === "output-error" || formatted?.kind === "error";
  const errorMessage = isError ? error : undefined;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <span>{meta.icon}</span>
          <span>{meta.label}</span>
        </SheetTitle>
        <SheetDescription>工具调用详情</SheetDescription>
      </SheetHeader>
      <ScrollArea className="min-h-0 flex-1 -mx-4 px-4 pt-2">
        {input && Object.keys(input).length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              调用参数
            </h3>
            <div className="space-y-1.5">
              {Object.entries(input).map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    {key}
                  </span>
                  <div className="mt-0.5">
                    {typeof value === "string" && value.length > 100 ? (
                      <pre className="max-h-48 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap">
                        {value}
                      </pre>
                    ) : typeof value === "object" && value !== null ? (
                      <pre className="max-h-48 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-foreground">{String(value)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {formatted && formatted.kind !== "error" && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              执行结果
            </h3>
            {formatted.kind === "agent-result" && (
              <>
                {formatted.metadata &&
                  Object.keys(formatted.metadata).length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(formatted.metadata).map(
                        ([k, v]) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {k}: {v}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                <pre className="max-h-96 overflow-y-auto rounded-md bg-muted/50 p-2.5 text-xs whitespace-pre-wrap text-foreground leading-relaxed">
                  {formatted.content}
                </pre>
              </>
            )}
            {formatted.kind === "code" && (
              <pre className="max-h-96 overflow-y-auto rounded-md bg-muted/50 p-2.5 text-xs whitespace-pre-wrap text-foreground leading-relaxed">
                {formatted.content}
              </pre>
            )}
            {formatted.kind === "file-list" && formatted.items && (
              <ul className="space-y-0.5">
                {formatted.items.map((file, i) => (
                  <li
                    key={i}
                    className="text-xs text-foreground flex items-center gap-1.5"
                  >
                    <span className="text-muted-foreground">📄</span>
                    {file}
                  </li>
                ))}
              </ul>
            )}
            {formatted.kind === "success" && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <span>✓</span>
                {formatted.content}
              </div>
            )}
            {formatted.kind === "text" && (
              <pre className="max-h-96 overflow-y-auto rounded-md bg-muted/50 p-2.5 text-xs whitespace-pre-wrap text-foreground leading-relaxed">
                {formatted.content}
              </pre>
            )}
          </div>
        )}

        {isError &&
          (formatted?.kind === "error"
            ? formatted.content
            : errorMessage) && (
            <div className="mt-4 rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive font-medium">错误</p>
              <p className="mt-1 text-xs text-destructive/80">
                {formatted?.kind === "error"
                  ? formatted.content
                  : (errorMessage ?? "未知错误")}
              </p>
            </div>
          )}

        {(state === "input-streaming" || state === "input-available") && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="size-2 shrink-0 rounded-full animate-pulse"
              style={{ backgroundColor: meta.color }}
            />
            {state === "input-streaming" ? "思考中..." : "执行中..."}
          </div>
        )}
      </ScrollArea>
    </>
  );
}

interface ToolDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolName: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  state?: DynamicToolState;
}

export function ToolDetailSheet({
  open,
  onOpenChange,
  toolName,
  input,
  output,
  error,
  state,
}: ToolDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-hidden w-[400px] sm:max-w-[400px]">
        <ToolDetailContent
          toolName={toolName}
          input={input}
          output={output}
          error={error}
          state={state}
        />
      </SheetContent>
    </Sheet>
  );
}
