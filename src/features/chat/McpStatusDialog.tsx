import { useLayoutEffect, useRef, useState } from "react";
import { DialogFrame } from "../../components/DialogFrame.tsx";
import { codexMcpStatus } from "../../backend.ts";
import { requestMcpStatus, type LocalMcpServer, type McpStatusLoad, type McpStatusState } from "./localMcpStatus.ts";

interface Props {
  chatId: string;
  onClose: () => void;
  load?: McpStatusLoad;
}

export function McpStatusDialog({ chatId, onClose, load = codexMcpStatus }: Props) {
  const [result, setResult] = useState<{ chatId: string; state: McpStatusState }>({ chatId, state: { kind: "loading", rows: [] } });
  const cancel = useRef<() => void>(() => {});
  const state: McpStatusState = result.chatId === chatId ? result.state : { kind: "loading", rows: [] };
  function refresh(rows: LocalMcpServer[]) {
    cancel.current();
    cancel.current = requestMcpStatus(chatId, load, rows, (next) => setResult({ chatId, state: next }));
  }
  useLayoutEffect(() => {
    refresh([]);
    return () => cancel.current();
  }, [chatId, load]);
  function close() { cancel.current(); onClose(); }
  const message = state.kind === "error" ? "Couldn't load MCP servers. Try refreshing."
    : state.kind === "loading" ? state.rows.length ? null : "Loading MCP servers…"
    : state.rows.length ? null : "No MCP servers configured.";
  return (
    <DialogFrame kind="dialog" titleId="mcp-status-title" descriptionId="mcp-status-description" onClose={close} className="mcp-status-dialog">
      <style>{styles}</style>
      <header className="project-dialog-header">
        <h2 id="mcp-status-title">MCP status</h2>
        <p id="mcp-status-description" style={{ margin: 0, color: "var(--muted)" }}>
          {state.kind === "ready" || state.rows.length ? "Server status reported by the running session." : "Refresh to check current server status."}
        </p>
      </header>
      <button type="button" className="mcp-status-close" aria-label="Close MCP status" onClick={close}>×</button>
      {state.rows.length > 0 ? <div className="mcp-status-rows">{state.rows.map((server, index) => <McpStatusRow key={`${index}:${server.name}`} server={server} />)}</div> : null}
      {message ? <div className="mcp-status-message" role={state.kind === "error" ? "alert" : "status"}>
        {state.kind === "loading" ? <span className="sb-ws-loader mcp-status-loader" aria-hidden /> : null}
        <span>{message}</span>
      </div> : null}
      <footer className="mcp-status-footer">
        <button type="button" className="btn btn-ghost" onClick={() => refresh(state.rows)} disabled={state.kind === "loading"} title={state.kind === "error" ? state.message : undefined}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" /></svg>
          Refresh status
        </button>
      </footer>
    </DialogFrame>
  );
}

function McpStatusRow({ server }: { server: LocalMcpServer }) {
  const needsHelp = server.status !== "connected";
  return <div className="mcp-status-row" data-status={server.status} title={needsHelp ? "Update this server in Settings → MCP" : undefined}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {server.status !== "failed" ? <circle cx="12" cy="12" r="9" /> : null}
      {server.status === "connected" ? <path d="m8 12 3 3 5-6" /> : server.status === "failed" ? <path d="m9 9 6 6m0-6-6 6" /> : <path d="M12 7v6m0 3v1" />}
    </svg>
    <span className="mcp-status-name">{server.name}</span>
    {needsHelp ? <span className="mcp-status-suffix">{server.status === "failed" ? "(error)" : "(needs auth)"}</span> : null}
  </div>;
}

const styles = `
.modal.project-dialog.mcp-status-dialog { width:448px; position:relative; }
.mcp-status-close { position:absolute; right:16px; top:12px; color:var(--muted); background:none; border:0; font-size:20px; }
.mcp-status-rows { display:flex; flex-direction:column; gap:8px; padding:8px 0; }
.mcp-status-row { display:flex; align-items:center; gap:4px; padding:2px 8px; min-width:0; border:1px solid var(--border); border-radius:6px; background:var(--bg); font-family:var(--font-mono); font-size:12px; line-height:16px; letter-spacing:.05em; text-transform:uppercase; transition:background .15s; }
.mcp-status-row:hover { background:var(--hover); }
.mcp-status-row svg { flex:none; color:var(--success); }
.mcp-status-row[data-status="failed"] svg { color:var(--destructive); }
.mcp-status-row[data-status="needs-auth"] svg { color:var(--warning); }
.mcp-status-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mcp-status-suffix { font-size:10px; opacity:.75; white-space:nowrap; }
.mcp-status-message { display:flex; align-items:center; gap:8px; padding:16px 6px; color:var(--muted); }
.mcp-status-message[role="alert"] { color:var(--destructive); }
.mcp-status-loader { width:12px; height:12px; border:1.5px solid currentColor; border-right-color:transparent; border-radius:50%; }
.mcp-status-footer { border-top:1px solid var(--border); padding-top:8px; display:flex; justify-content:space-between; }
.mcp-status-footer .btn { display:inline-flex; align-items:center; gap:4px; font-size:12px; }
`;
