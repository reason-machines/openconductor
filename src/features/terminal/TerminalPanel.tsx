import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import "@xterm/xterm/css/xterm.css";
import { canOpenTerminal } from "./tabs";
import { useAppPrefs } from "../../settings/appPrefs";
import { attachTab, clearTab, closeTab, getTabs, openTab, restoreWorkspaceTabs, selectTab, subscribeTabs } from "./session";
import { FindBar, useTerminalFind } from "./FindBar";
import { tabLabel } from "./shellIntegration";

interface Props {
  workspaceId: string;
  /** Working directory for new tabs; empty when unknown. */
  cwd: string;
  /** Typed into each new tab ("Command to auto-run when creating a new terminal tab"). */
  initialCommand?: string;
}

function TerminalHost({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const find = useTerminalFind(id);
  useEffect(() => (ref.current ? attachTab(id, ref.current) : undefined), [id]);
  // data-terminal tells the shortcut dispatcher that focus is in a terminal;
  // the find bar sits outside it so typing there is ordinary text input.
  return (
    <div className="term-body">
      <FindBar find={find} />
      <div className="term-mount" data-terminal ref={ref} />
    </div>
  );
}

export function TerminalPanel({ workspaceId, cwd, initialCommand }: Props) {
  const state = useSyncExternalStore(subscribeTabs, () => getTabs(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoOpened = useRef(new Set<string>());

  async function newTab() {
    if (!cwd) {
      setError("Terminal working directory is missing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openTab(workspaceId, cwd, initialCommand);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // The first time a workspace's panel is shown, reopen the tabs it had last
  // launch, or give it one terminal.
  useEffect(() => {
    if (autoOpened.current.has(workspaceId)) return;
    autoOpened.current.add(workspaceId);
    void restoreWorkspaceTabs(workspaceId, cwd, initialCommand).then((has) => {
      if (!has) void newTab();
    });
  }, [workspaceId]);

  const active = state.tabs.find((t) => t.id === state.activeId) ?? null;
  const tabFreakMode = useAppPrefs().experimental_tab_freak_mode;

  return (
    <section className="terminal-panel" aria-label="Terminal panel">
      <div className="term-tabs" role="tablist">
        {state.tabs.map((t) => (
          <div key={t.id} role="tab" aria-selected={t.id === state.activeId} className={`term-tab${t.id === state.activeId ? " active" : ""}`} onClick={() => selectTab(workspaceId, t.id)}>
            <span className={`term-dot ${t.status}`} />
            <span>{tabLabel(t.title, t.runningProgram)}</span>
            <button className="term-x" aria-label="Close terminal" title="Close terminal" onClick={(e) => (e.stopPropagation(), closeTab(workspaceId, t.id))}>
              ×
            </button>
          </div>
        ))}
        <button className="term-icon" aria-label="New terminal tab" title="New terminal tab" disabled={busy || !canOpenTerminal(state, tabFreakMode)} onClick={() => void newTab()}>
          +
        </button>
        <span className="term-spacer" />
        {active && (
          <button className="term-icon" title="Clear terminal scrollback" aria-label="Clear terminal scrollback" onClick={() => clearTab(active.id)}>
            ⌫
          </button>
        )}
      </div>
      {error && <div className="term-error">{error}</div>}
      {active ? <TerminalHost key={active.id} id={active.id} /> : !error && <div className="term-empty muted">No terminal open.</div>}
    </section>
  );
}
