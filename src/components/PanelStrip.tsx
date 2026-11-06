// The strip under the right panel's file list, as in Conductor's workspace
// (REA reference capture workspace-chat, evidence/screens): a chevron that
// hides or shows it ("Hide terminal panel" / "Show terminal panel", also ⌘J),
// the Setup and Run tabs, one tab per terminal, and + ("New terminal").
// Terminals live here; there is no terminal panel under the workspace.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Repo, Workspace } from "../state/types";
import type { SetupState } from "../scripts/model";
import { ScriptsPanel } from "./ScriptsPanel";
import { TerminalHost } from "../features/terminal/TerminalPanel";
import { clearTab, closeTab, getTabs, openTab, restoreWorkspaceTabs, selectTab, subscribeTabs } from "../features/terminal/session";
import { canOpenTerminal } from "../features/terminal/tabs";
import { tabLabel } from "../features/terminal/shellIntegration";
import { useAppPrefs } from "../settings/appPrefs";
import { openRepoSettingsPage } from "../features/chat/ChatModelPicker";
import { ChevronDownIcon, ChevronRightIcon, EraserIcon, PlusIcon, XIcon } from "../features/files/panelIcons";

export type StripView = "setup" | "run" | "terminal";

interface Props {
  repo: Repo;
  workspace: Workspace;
  open: boolean;
  setOpen: (open: boolean) => void;
  view: StripView;
  setView: (view: StripView) => void;
  /** Working directory for new terminals; empty when unknown. */
  cwd: string;
}

export function PanelStrip({ repo, workspace, open, setOpen, view, setView, cwd }: Props) {
  const wsId = workspace.id;
  const terms = useSyncExternalStore(subscribeTabs, () => getTabs(wsId));
  const tabFreakMode = useAppPrefs().experimental_tab_freak_mode;
  const [setupState, setSetupState] = useState<SetupState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  // The tab row's right end, where the Run tab puts its Open button (Conductor's `ml-auto pl-2 gap-2` group).
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);

  // The workspace's terminals from the last launch come back as tabs (not shown until picked).
  useEffect(() => {
    setRestored(false);
    setError(null);
    let live = true;
    const done = () => live && setRestored(true);
    if (cwd) void restoreWorkspaceTabs(wsId, cwd).then(done, done);
    else done();
    return () => {
      live = false;
    };
  }, [wsId, cwd]);

  // Closing the last terminal while it is shown goes back to Run (not while a new one is starting).
  useEffect(() => {
    if (view === "terminal" && restored && !busy && terms.tabs.length === 0) setView("run");
  }, [view, restored, busy, terms.tabs.length, setView]);

  const show = (v: StripView) => {
    setView(v);
    setOpen(true);
  };

  async function newTerminal() {
    if (!cwd) return setError("Terminal working directory is missing.");
    setBusy(true);
    setError(null);
    // The new tab is listed (starting) before its shell answers: show it at once.
    show("terminal");
    try {
      await openTab(wsId, cwd);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const addRunScript = useCallback(() => openRepoSettingsPage(repo.id, "scripts"), [repo.id]);
  const onSetupState = useCallback((s: SetupState) => setSetupState(s), []);
  const showRun = useCallback(() => {
    setView("run");
    setOpen(true);
  }, [setView, setOpen]);
  const activeTerm = terms.tabs.find((t) => t.id === terms.activeId) ?? null;
  const showTerminal = open && view === "terminal" && activeTerm !== null;

  return (
    <section className={`ws-strip${open ? "" : " collapsed"}`} aria-label="Terminal panel" data-terminals-ready={restored || undefined} data-repo-id={repo.id}>
      <div className="ws-strip-tabs" role="tablist">
        <button
          type="button"
          className="rp-icon ws-strip-toggle"
          aria-label={open ? "Hide terminal panel" : "Show terminal panel"}
          title={open ? "Hide terminal panel" : "Show terminal panel"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
        <button type="button" role="tab" aria-selected={open && view === "setup"} className={`strip-tab${open && view === "setup" ? " active" : ""}`} onClick={() => show("setup")}>
          Setup
          {setupState !== "idle" && <span className={`setup-dot ${setupState}`} aria-label={setupState} />}
        </button>
        <button type="button" role="tab" aria-selected={open && view === "run"} className={`strip-tab${open && view === "run" ? " active" : ""}`} onClick={() => show("run")}>
          Run
        </button>
        {terms.tabs.map((t) => {
          const selected = open && view === "terminal" && t.id === terms.activeId;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={selected}
              className={`strip-tab term-tab${selected ? " active" : ""}`}
              data-current={t.id === terms.activeId || undefined}
              onClick={() => {
                selectTab(wsId, t.id);
                show("terminal");
              }}
            >
              <span className={`term-dot ${t.status}`} />
              <span>{tabLabel(t.title, t.runningProgram)}</span>
              <button
                type="button"
                className="term-x"
                aria-label="Close terminal"
                title="Close terminal"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(wsId, t.id);
                }}
              >
                <XIcon size={12} />
              </button>
            </div>
          );
        })}
        <button type="button" className="rp-icon" aria-label="New terminal" title="New terminal" disabled={busy || !canOpenTerminal(terms, tabFreakMode)} onClick={() => void newTerminal()}>
          <PlusIcon />
        </button>
        {view === "run" && <div className="ws-strip-actions" ref={setActionsEl} />}
        {/* Not in the reference capture (it has no terminal open); kept so scrollback can be cleared without ⌘K, which the command palette also takes. */}
        {showTerminal && (
          <button type="button" className="rp-icon ws-strip-end" aria-label="Clear terminal scrollback" title="Clear terminal scrollback" onClick={() => clearTab(activeTerm.id)}>
            <EraserIcon />
          </button>
        )}
      </div>
      {open && error && <div className="term-error">{error}</div>}
      {/* Kept mounted while hidden, so run output and the setup state keep coming in. */}
      <div className="ws-strip-body" hidden={!open || view === "terminal"}>
        <ScriptsPanel repo={repo} workspace={workspace} tab={view === "setup" ? "setup" : "run"} active={view === "run"} actionsSlot={view === "run" ? actionsEl : null} onSetupState={onSetupState} onAddRunScript={addRunScript} onShowRun={showRun} />
      </div>
      {showTerminal && (
        <section className="terminal-panel" aria-label="Terminal">
          <TerminalHost key={activeTerm.id} id={activeTerm.id} />
        </section>
      )}
    </section>
  );
}
