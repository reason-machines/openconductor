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
import {
  EMPTY_VIEW,
  SPOTLIGHT_EMPTY_TEXT,
  SPOTLIGHT_SETTING_DESCRIPTION,
  SPOTLIGHT_SETTING_TITLE,
  SPOTLIGHT_TASK_ID,
  applyEvent,
  runTasks,
  shownTask,
  spotlightButton,
  toggleBlocked,
  viewFromStatus,
  type SpotlightTesting,
  type SpotlightView,
} from "../spotlight/testing";

interface Props {
  repo: Repo;
  workspace: Workspace;
  /** Which strip tab this body is for (the strip draws the tabs). */
  tab: "run" | "setup";
  /** Reports the setup state, for the dot on the strip's Setup tab. */
  onSetupState?: (state: SetupStatus["state"]) => void;
  /** The Run tab's empty state: "Add run script" opens the repository's Scripts settings. */
  onAddRunScript: () => void;
}

/** Conductor's Run tab text with no run script (copy catalog). */
export const RUN_EMPTY_TEXT = "Run tests or a development server to test changes in this workspace";
/** Conductor's Setup tab text before setup has run (copy catalog). */
const SETUP_EMPTY_TEXT = "Setup script output will appear here after running setup.";

const errorText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

/**
 * The Run and Setup tab bodies of the right panel's strip: start/stop the
 * repository's run scripts and watch setup.
 * With the repository's spotlight_testing setting on, the Run task picker also
 * offers Spotlight, which syncs this workspace into the repository root.
 */
export function ScriptsPanel({ repo, workspace, tab, onSetupState, onAddRunScript }: Props) {
  const ref = useMemo(() => workspaceRef(repo, workspace), [repo, workspace]);
  const wsId = workspace.id;
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
  const shown = shownTask({
    picked,
    spotlightEnabled: spotEnabled,
    activeScriptId: activeRun(runs)?.scriptId ?? null,
    spotlightMine: spotMine,
    defaultScriptId: defaultScript(config)?.id ?? null,
  });
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

  useEffect(() => {
    onSetupState?.(setup.state);
  }, [onSetupState, setup.state]);

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

  // Conductor's Run tab with no run script: a dashed box offering to add one.
  const noRunScript = (config !== null || !ref) && tasks.length === 0 && !showSpotlight && runs.length === 0;

  if (tab === "run" && noRunScript) {
    return (
      <section className="scripts" aria-label="Run">
        {error && <div className="scripts-error">{error}</div>}
        <div className="scripts-empty">
          <div className="scripts-empty-box">
            <p>{RUN_EMPTY_TEXT}</p>
            <button type="button" className="scripts-empty-btn" onClick={onAddRunScript}>
              Add run script
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="scripts" aria-label={tab === "run" ? "Run" : "Setup"}>
      {error && <div className="scripts-error">{error}</div>}
      {tab === "run" ? (
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
            <div className="scripts-actions">
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
            </div>
          </div>
          {showSpotlight ? (
            <pre ref={outRef} className="scripts-output">
              {spotLogMine && spotView.log.length > 0
                ? spotView.log.join("\n")
                : spotButton.hint ?? SPOTLIGHT_EMPTY_TEXT}
            </pre>
          ) : (
            <pre ref={outRef} className="scripts-output">{runOut ? stripAnsi(runOut) : button.hint && !shown ? button.hint : "Output from the run script appears here."}</pre>
          )}
        </>
      ) : (
        <>
          <div className="scripts-meta">
            <span>{SETUP_TEXT[setup.state]}</span>
            {setup.last?.logPath && <code title="Setup log file">{setup.last.logPath}</code>}
            <div className="scripts-actions">
              <button
                className={`btn btn-small ${setupRunning ? "btn-stop" : ""}`}
                disabled={!ref || !config?.setup}
                title={config?.setup ?? "No setup script is configured"}
                onClick={() => act(() => (setupRunning ? api.cancelSetup(wsId) : api.startSetup(ref!)))}
              >
                {setupRunning ? "Stop setup" : setup.state === "idle" ? "Run setup" : "Rerun setup"}
              </button>
            </div>
          </div>
          {setup.log ? (
            <pre ref={outRef} className="scripts-output">{stripAnsi(setup.log)}</pre>
          ) : (
            // The Run tab's dashed card, so both tabs' empty states look alike (#509).
            <div className="scripts-empty">
              <div className="scripts-empty-box">
                <p>{config?.setup ? SETUP_EMPTY_TEXT : "No setup script is configured for this repository."}</p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
