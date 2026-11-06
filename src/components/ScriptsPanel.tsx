import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Repo, Workspace } from "../state/types";
import * as api from "../scripts/api";
import {
  SETUP_TEXT,
  activeRun,
  appendOutput,
  defaultScript,
  exitText,
  runButton,
  stripAnsi,
  visibleScripts,
  workspaceRef,
  type RunStatus,
  type ScriptsConfig,
  type SetupStatus,
} from "../scripts/model";
import * as spotlight from "../spotlight/testingApi";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import {
  EMPTY_VIEW,
  SPOTLIGHT_EMPTY_TEXT,
  SPOTLIGHT_SETTING_DESCRIPTION,
  SPOTLIGHT_SETTING_TITLE,
  SPOTLIGHT_TASK_ID,
  applyEvent,
  runTasks,
  spotlightButton,
  toggleBlocked,
  viewFromStatus,
  type SpotlightTesting,
  type SpotlightView,
} from "../spotlight/testing";

interface Props {
  repo: Repo;
  workspace: Workspace;
  /** Bumped by ⌘J or a big terminal: selects the Terminal tab. */
  terminalRequest?: number;
}

type ScriptsTab = "setup" | "run" | "terminal";

/** The empty state both the Run and Setup tabs show: one card, same look. */
function EmptyCard({ children }: { children: string }) {
  return <div className="scripts-empty">{children}</div>;
}

const errorText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

/**
 * Run and Setup tabs: start/stop the repository's run scripts and watch setup.
 * With the repository's spotlight_testing setting on, the Run task picker also
 * offers Spotlight, which syncs this workspace into the repository root.
 */
export function ScriptsPanel({ repo, workspace, terminalRequest = 0 }: Props) {
  const ref = useMemo(() => workspaceRef(repo, workspace), [repo, workspace]);
  const wsId = workspace.id;
  const [tab, setTab] = useState<ScriptsTab>("run");
  useEffect(() => {
    if (terminalRequest > 0) setTab("terminal");
  }, [terminalRequest]);
  const [config, setConfig] = useState<ScriptsConfig | null>(null);
  const [runs, setRuns] = useState<RunStatus[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [runOut, setRunOut] = useState("");
  const [setup, setSetup] = useState<SetupStatus>({ state: "idle", log: null, last: null });
  const [error, setError] = useState<string | null>(null);
  const [spotSetting, setSpotSetting] = useState<SpotlightTesting | null>(null);
  const [spotView, setSpotView] = useState<SpotlightView>(EMPTY_VIEW);
  const [spotPending, setSpotPending] = useState<"starting" | "stopping" | null>(null);
  const outRef = useRef<HTMLPreElement>(null);

  const repoRoot = repo.path;
  const spotEnabled = spotSetting?.enabled === true;
  const spotMine = spotView.workspaceId === wsId;
  const spotLogMine = spotView.logWorkspaceId === wsId;
  const spotPicked = picked === SPOTLIGHT_TASK_ID && spotEnabled;
  const shown = spotPicked
    ? SPOTLIGHT_TASK_ID
    : (picked !== SPOTLIGHT_TASK_ID ? picked : null) ?? activeRun(runs)?.scriptId ?? (spotMine ? SPOTLIGHT_TASK_ID : null) ?? defaultScript(config)?.id ?? null;
  const showSpotlight = shown === SPOTLIGHT_TASK_ID;

  const refresh = useCallback(async () => {
    const [status, setupState] = await Promise.all([api.runStatus(wsId), api.setupStatus(wsId)]);
    setRuns(status.runs);
    setSetup(setupState);
  }, [wsId]);

  useEffect(() => {
    setConfig(null);
    setPicked(null);
    setError(null);
    if (ref) api.scriptsConfig(ref).then(setConfig, (e) => setError(errorText(e)));
    refresh().catch(() => {});
  }, [ref, refresh]);

  const refreshSpotlight = useCallback(async () => {
    if (!repoRoot) return;
    const [setting, status] = await Promise.all([spotlight.spotlightTesting(repo.id), spotlight.spotlightStatus(repoRoot)]);
    setSpotSetting(setting);
    setSpotView((v) => (v.workspaceId === status.workspaceId ? v : viewFromStatus(status)));
  }, [repo.id, repoRoot]);

  useEffect(() => {
    setSpotSetting(null);
    setSpotView(EMPTY_VIEW);
    refreshSpotlight().catch(() => {});
  }, [refreshSpotlight]);

  useEffect(() => {
    // Subscribing is async: a cleanup that runs first (a quick remount)
    // must still unsubscribe, or each event is applied twice.
    let off: (() => void) | undefined;
    let disposed = false;
    spotlight
      .onSpotlightEvent((e) => {
        if (e.repoRoot === repoRoot) setSpotView((v) => applyEvent(v, e, new Date()));
      })
      .then((f) => (disposed ? f() : (off = f)));
    return () => {
      disposed = true;
      off?.();
    };
  }, [repoRoot]);

  useEffect(() => {
    if (!shown) return setRunOut("");
    api.runOutput(wsId, shown).then((o) => setRunOut(o ?? ""), () => {});
  }, [wsId, shown, runs]);

  useEffect(() => {
    let off: (() => void) | undefined;
    api
      .onScriptEvent((e) => {
        if (e.workspaceId !== wsId) return;
        if (e.type === "output" && e.kind === "run" && e.scriptId === shown) setRunOut((b) => appendOutput(b, e.chunk));
        if (e.type === "output" && e.kind === "setup") setSetup((s) => ({ ...s, state: "running", log: appendOutput(s.log ?? "", e.chunk) }));
        if (e.type === "setupFinished") refresh().catch(() => {});
      })
      .then((f) => (off = f));
    return () => off?.();
  }, [wsId, shown, refresh]);

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
  }, [runOut, setup.log, spotView.log, tab]);

  async function act(f: () => Promise<unknown>) {
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(errorText(e));
    }
    await refresh().catch(() => {});
  }

  // One run-panel process per workspace, as in the reference: starting a
  // script ends this workspace's Spotlight session, and starting Spotlight
  // stops the run scripts of every workspace of the repository (backend).
  async function startScript() {
    if (spotMine) await spotlight.stopSpotlight(repoRoot);
    await api.startRun(ref!, shown);
  }

  async function toggleSpotlightRun() {
    setError(null);
    // Stay on the Spotlight task so its log stays readable after a stop.
    setPicked(SPOTLIGHT_TASK_ID);
    setSpotPending(spotMine ? "stopping" : "starting");
    try {
      if (spotMine) await spotlight.stopSpotlight(repoRoot);
      else await spotlight.startSpotlight(repo.id, wsId, ref!.workspacePath, repoRoot);
    } catch (e) {
      setError(errorText(e));
    }
    setSpotPending(null);
    await Promise.all([refresh(), refreshSpotlight()]).catch(() => {});
  }

  async function setSpotlightTesting(enabled: boolean) {
    setError(null);
    try {
      const change = await spotlight.setSpotlightTesting(repo.id, repoRoot, enabled);
      setSpotSetting(change.setting);
      if (!change.setting.enabled && picked === SPOTLIGHT_TASK_ID) setPicked(null);
      if (change.setting.enabled) setPicked(SPOTLIGHT_TASK_ID);
    } catch (e) {
      setError(errorText(e));
    }
    await Promise.all([refresh(), refreshSpotlight()]).catch(() => {});
  }

  const button = runButton(config, runs, ref !== null);
  const spotButton = spotlightButton(spotView, wsId, ref !== null, spotPending);
  const scripts = visibleScripts(config);
  const tasks = runTasks(scripts, spotEnabled);
  const toggleHint = toggleBlocked(spotSetting, Boolean(repoRoot));
  const busy = showSpotlight ? spotButton.action === "stop" : button.action === "stop";
  const shownStatus = runs.find((r) => r.scriptId === shown);
  const setupRunning = setup.state === "running";

  return (
    <section className="scripts" aria-label="Scripts">
      <div className="tabs scripts-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "setup"} className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>
          Setup <span className={`setup-dot ${setup.state}`} aria-label={SETUP_TEXT[setup.state]} />
        </button>
        <button role="tab" aria-selected={tab === "run"} className={tab === "run" ? "active" : ""} onClick={() => setTab("run")}>
          Run
        </button>
        <button role="tab" aria-selected={tab === "terminal"} className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}>
          Terminal
        </button>
        <div className="scripts-actions">
          {tab === "terminal" ? null : tab === "run" ? (
            <>
              {tasks.length > 1 && (
                <select aria-label="Run script" value={shown ?? ""} onChange={(e) => setPicked(e.target.value)} disabled={busy}>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
              {showSpotlight ? (
                <button
                  className={`btn btn-small ${spotButton.action === "stop" ? "btn-stop" : "btn-primary"}`}
                  title={spotButton.hint}
                  disabled={spotButton.disabled}
                  onClick={() => toggleSpotlightRun()}
                >
                  {spotButton.action === "stop" ? "■" : "▶"} {spotButton.label}
                </button>
              ) : (
                <button
                  className={`btn btn-small ${button.action === "stop" ? "btn-stop" : "btn-primary"}`}
                  title={button.hint}
                  disabled={button.disabled}
                  onClick={() => act(() => (button.action === "stop" ? api.stopRun(wsId, null) : startScript()))}
                >
                  {button.action === "stop" ? "■" : "▶"} {button.label}
                </button>
              )}
            </>
          ) : (
            <button
              className={`btn btn-small ${setupRunning ? "btn-stop" : ""}`}
              disabled={!ref || !config?.setup}
              title={config?.setup ?? "No setup script is configured"}
              onClick={() => act(() => (setupRunning ? api.cancelSetup(wsId) : api.startSetup(ref!)))}
            >
              {setupRunning ? "Stop setup" : setup.state === "idle" ? "Run setup" : "Rerun setup"}
            </button>
          )}
        </div>
      </div>
      {error && <div className="scripts-error">{error}</div>}
      {tab === "terminal" ? (
        <TerminalPanel workspaceId={wsId} cwd={repo.path} />
      ) : tab === "run" ? (
        <>
          <div className="scripts-meta">
            {showSpotlight ? (
              <span className={`spotlight-status${spotView.syncing ? " syncing" : ""}`}>
                {spotMine
                  ? spotView.status ?? "Running"
                  : spotView.workspaceId
                    ? "Syncing another workspace"
                    : spotLogMine && spotView.status
                      ? spotView.status
                      : "Spotlight is off"}
              </span>
            ) : shown ? (
              <code>{scripts.find((s) => s.id === shown)?.command ?? shown}</code>
            ) : (
              <span>No run script configured</span>
            )}
            {!showSpotlight && exitText(shownStatus) && <span className="muted">{exitText(shownStatus)}</span>}
            <label className="spotlight-toggle" title={toggleHint ?? SPOTLIGHT_SETTING_DESCRIPTION}>
              <input
                type="checkbox"
                checked={spotEnabled}
                disabled={toggleHint !== null}
                onChange={(e) => setSpotlightTesting(e.target.checked)}
              />
              {SPOTLIGHT_SETTING_TITLE}
            </label>
          </div>
          {showSpotlight ? (
            <pre ref={outRef} className="scripts-output">
              {spotLogMine && spotView.log.length > 0
                ? spotView.log.join("\n")
                : spotButton.hint ?? SPOTLIGHT_EMPTY_TEXT}
            </pre>
          ) : runOut ? (
            <pre ref={outRef} className="scripts-output">{stripAnsi(runOut)}</pre>
          ) : (
            <EmptyCard>{button.hint && !shown ? button.hint : "Output from the run script appears here."}</EmptyCard>
          )}
        </>
      ) : (
        <>
          <div className="scripts-meta">
            <span>{SETUP_TEXT[setup.state]}</span>
            {setup.last?.logPath && <code title="Setup log file">{setup.last.logPath}</code>}
          </div>
          {setup.log ? (
            <pre ref={outRef} className="scripts-output">{stripAnsi(setup.log)}</pre>
          ) : (
            <EmptyCard>{config?.setup ? "Setup output appears here after setup runs." : "No setup script is configured for this repository."}</EmptyCard>
          )}
        </>
      )}
    </section>
  );
}
