import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { attachTab, retryTab, spawnErrorOf, terminalOf } from "./session";
import "./spawnFailure.css";
import { FindBar, useTerminalFind } from "./FindBar";
import type { TerminalTab } from "./tabs";
import { TerminalIcon } from "../../components/Icons";

/** One PTY screen, mounted in either the right panel or a center workspace tab. */
export function TerminalHost({ id, status, sessionId, onAddToChat }: Pick<TerminalTab, "id" | "status"> & {
  sessionId?: string;
  onAddToChat?: (text: string) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState("");
  const find = useTerminalFind(id);
  useEffect(() => (ref.current ? attachTab(id, ref.current) : undefined), [id]);
  useEffect(() => {
    setSelectedText("");
    const terminal = terminalOf(id);
    const subscription = terminal?.onSelectionChange(() => setSelectedText(terminal.getSelection()));
    return () => subscription?.dispose();
  }, [id]);
  const selection = selectedText
    .replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/gu, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "").trim();
  // data-terminal tells the shortcut dispatcher that focus is in a terminal;
  // the find bar sits outside it so typing there is ordinary text input.
  return (
    <div className="term-body">
      <FindBar find={find} />
      {selection && sessionId && onAddToChat && (
        <div style={{ position: "absolute", inset: "0 0 auto", zIndex: 10, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--panel)", fontSize: 12 }}>
          <TerminalIcon size={12} />
          <span title={selection} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selection.replace(/\s+/g, " ")}</span>
          <button type="button" className="btn btn-small" onClick={(event) => {
            event.stopPropagation();
            if (onAddToChat(selection)) setSelectedText("");
          }}>Add to chat</button>
        </div>
      )}
      {status === "starting" && (
        <div className="term-startup" role="status">
          <TerminalIcon size={48} />
          <p>Starting terminal…</p>
        </div>
      )}
      {status === "spawn_error" && (
        <div className="term-spawn-error" role="alert">
          <span>Failed to start terminal: {spawnErrorOf(id)}</span>
          <button type="button" disabled={false} onClick={() => {
            void retryTab(id).catch(() => {});
          }}>Retry</button>
        </div>
      )}
      <div className="term-mount" data-terminal ref={ref} />
    </div>
  );
}
