export interface LocalMcpTool {
  name: string;
  description?: string;
  annotations?: { readOnly?: boolean; destructive?: boolean; openWorld?: boolean };
}

export interface LocalMcpServer {
  name: string;
  status: "connected" | "failed" | "needs-auth";
  tools: LocalMcpTool[];
}

export type McpStatusLoad = (chatId: string) => Promise<LocalMcpServer[]>;
export type McpStatusState =
  | { kind: "loading"; rows: LocalMcpServer[] }
  | { kind: "ready"; rows: LocalMcpServer[] }
  | { kind: "error"; rows: LocalMcpServer[]; message: string };

export const MCP_STATUS_TIMEOUT_MS = 16_000;

export function requestMcpStatus(chatId: string, load: McpStatusLoad, previous: LocalMcpServer[], update: (state: McpStatusState) => void, timeoutMs = MCP_STATUS_TIMEOUT_MS): () => void {
  let live = true;
  const finish = (state: McpStatusState) => {
    if (!live) return;
    live = false;
    clearTimeout(timer);
    update(state);
  };
  const timer = setTimeout(() => finish({ kind: "error", rows: previous, message: "MCP status timed out." }), timeoutMs);
  update({ kind: "loading", rows: previous });
  void Promise.resolve().then(() => live ? load(chatId) : null).then(
    (rows) => { if (rows !== null) finish({ kind: "ready", rows }); },
    (error: unknown) => finish({ kind: "error", rows: previous, message: error instanceof Error ? error.message : String(error) }),
  );
  return () => { live = false; clearTimeout(timer); };
}
