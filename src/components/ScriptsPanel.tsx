import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { keyedCache } from "../lib/keyedCache";
import type { Repo, Workspace } from "../state/types";
import * as api from "../scripts/api";
import {
  SETUP_TEXT,
  activeRun,
  appendOutput,
  defaultScript,
  runButton,
  visibleScripts,
  workspaceRef,
  type RunState,
  type RunStatus,
  type ScriptsConfig,
  type SetupStatus,
} from "../scripts/model";
import * as spotlight from "../spotlight/testingApi";
import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { openUrl } from "../backend";
import { useRepoSettings } from "../settings/useRepoSettings";
import { detectLocalhostUrl, previewEnvFrom, previewOptions, type PreviewEnv, type PreviewOption } from "../scripts/preview";
import { PreviewOpenButton } from "./PreviewOpenButton";
import { RunSplitButton } from "./RunSplitButton";
import { ScriptOutput } from "./ScriptOutput";
import { ShortcutHint } from "./ui/Tooltip";
import { RunIcon } from "../settings/rows/runIcons";
import { runBody, runHeader } from "../scripts/runTab";
import {
  EMPTY_VIEW,
  SPOTLIGHT_EMPTY_TEXT,
  SPOTLIGHT_TASK_ID,
  applyEvent,
  runTasks,
  shownTask,
  spotlightButton,
  viewFromStatus,
  type SpotlightTesting,
  type SpotlightView,
} from "../spotlight/testing";

interface Props {
  repo: Repo;
  workspace: Workspace;
  /** Which strip tab this body is for (the strip draws the tabs). */
  tab: "run" | "setup";
  /** The strip's Run tab is the selected one (open or collapsed), as Conductor's `it === Rx.RUN`. */
  active: boolean;
  /** The strip's tab-row slot (its right end) for the run split button and, on Run, the Open button. */
  actionsSlot?: HTMLElement | null;
  /** Reports the setup state, for the dot on the strip's Setup tab. */
  onSetupState?: (state: SetupStatus["state"]) => void;
  /** Run's "Add run script" and Setup's "Add manually": open the repository's Scripts settings. */
  onAddRunScript: () => void;
  /** Setup's "Ask agent": asks the workspace's chat to write the setup script; absent without a chat. */
  onAskAgent?: () => void;
  /** Opens the strip on its Run tab (⌘R does before it starts or stops). */
  onShowRun: () => void;
}

/** Conductor's Run tab text with no run script (copy catalog). */
export const RUN_EMPTY_TEXT = "Run tests or a development server to test changes in this workspace";
/** Conductor's Setup tab (`nro`) before setup has run, with a setup script configured. */
export const SETUP_IDLE_TITLE = "No setup script output";
const SETUP_EMPTY_TEXT = "Setup script output will appear here after running setup.";
/** Conductor's Setup tab with no setup script: a dashed card offering to add one. */
export const SETUP_ADD_TITLE = "Add setup script";
const SETUP_ADD_TEXT = "Run commands when a workspace is created to install dependencies or set up the environment";

/** Conductor's `UUe` labels (`JEs`): the Setup tab's one button, idle and pending. */
const SETUP_BUTTON = {
  run: { idle: "Run setup", pending: "Running..." },
  rerun: { idle: "Rerun setup", pending: "Running..." },
  stop: { idle: "Stop setup", pending: "Stopping..." },
} as const;
type SetupButtonMode = keyof typeof SETUP_BUTTON;

const errorText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

// Each workspace's scripts config and each repository's spotlight setting, last read:
// switching back to a workspace shows its Run tab as it was at once, not the
// "No run script configured" view for the frames until the config loads again
// (lib/keyedCache.ts).
const configs = keyedCache<ScriptsConfig>(64);
const spotSettings = keyedCache<SpotlightTesting>(64);

/**
 * The Run and Setup tab bodies of the right panel's strip: start/stop the
 * repository's run scripts and watch setup.
 * With the repository's spotlight_testing setting on, the Run task picker also
 * offers Spotlight, which syncs this workspace into the repository root.
 */
export function ScriptsPanel({ repo, workspace, tab, active, actionsSlot, onSetupState, onAddRunScript, onAskAgent, onShowRun }: Props) {
  const ref = useMemo(() => workspaceRef(repo, workspace), [repo, workspace]);
  const wsId = workspace.id;
  const configKey = JSON.stringify(ref);
  const [configState, setConfigState] = useState<{ key: string; config: ScriptsConfig | null }>(() => ({ key: configKey, config: configs.get(configKey) ?? null }));
  // null until this workspace's config is known (from the cache or the backend).
  const config = configState.key === configKey ? configState.config : (configs.get(configKey) ?? null);
  const [runs, setRuns] = useState<RunStatus[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [runOut, setRunOut] = useState("");
  const [setup, setSetup] = useState<SetupStatus>({ state: "idle", log: null, last: null });
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [setupPending, setSetupPending] = useState<"run" | "stop" | null>(null);
  const [spotState, setSpotState] = useState<{ repoId: string; setting: SpotlightTesting | null }>(() => ({ repoId: repo.id, setting: spotSettings.get(repo.id) ?? null }));
  const spotSetting = spotState.repoId === repo.id ? spotState.setting : (spotSettings.get(repo.id) ?? null);
  const [spotView, setSpotView] = useState<SpotlightView>(EMPTY_VIEW);
  const [spotPending, setSpotPending] = useState<"starting" | "stopping" | null>(null);
  const repoSettings = useRepoSettings(repo.path || undefined, workspace.path);
  const [previewEnv, setPreviewEnv] = useState<PreviewEnv>({});
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);

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
    setPicked(null);
    setError(null);
    setConfigError(null);
    if (ref)
      api.scriptsConfig(ref).then(
        (c) => {
          configs.set(configKey, c);
          setConfigState({ key: configKey, config: c });
        },
        (e) => {
          setError(errorText(e));
          setConfigError(errorText(e));
        },
      );
    refresh().catch(() => {});
  }, [ref, configKey, refresh]);

  const refreshSpotlight = useCallback(async () => {
    if (!repoRoot) return;
    const [setting, status] = await Promise.all([spotlight.spotlightTesting(repo.id), spotlight.spotlightStatus(repoRoot)]);
    spotSettings.set(repo.id, setting);
    setSpotState({ repoId: repo.id, setting });
    setSpotView((v) => (v.workspaceId === status.workspaceId ? v : viewFromStatus(status)));
  }, [repo.id, repoRoot]);

  useEffect(() => {
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
        if (e.type === "setupFinished" || e.type === "runStarted" || e.type === "runFinished") refresh().catch(() => {});
      })
      .then((f) => (off = f));
    return () => off?.();
  }, [wsId, shown, refresh]);

  useEffect(() => {
    onSetupState?.(setup.state);
  }, [onSetupState, setup.state]);

  useEffect(() => {
    setPreviewEnv({});
    if (ref) api.previewEnv(ref).then((pairs) => setPreviewEnv(previewEnvFrom(pairs)), () => {});
  }, [ref]);

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
  async function startScript(scriptId: Parameters<typeof api.startRun>[1]) {
    if (spotMine) await spotlight.stopSpotlight(repoRoot);
    await api.startRun(ref!, scriptId);
  }

  async function toggleSpotlightRun(action: "start" | "stop") {
    setError(null);
    // Stay on the Spotlight task so its log stays readable after a stop.
    setPicked(SPOTLIGHT_TASK_ID);
    setSpotPending(action === "stop" ? "stopping" : "starting");
    try {
      if (action === "stop") await spotlight.stopSpotlight(repoRoot);
      else await spotlight.startSpotlight(repo.id, wsId, ref!.workspacePath, repoRoot);
    } catch (e) {
      setError(errorText(e));
    }
    setSpotPending(null);
    await Promise.all([refresh(), refreshSpotlight()]).catch(() => {});
  }

  const button = runButton(config, runs, ref !== null);
  const spotButton = spotlightButton(spotView, wsId, ref !== null, spotPending);
  const scripts = visibleScripts(config);
  const tasks = runTasks(scripts, spotEnabled);
  const busy = showSpotlight ? spotButton.action === "stop" : button.action === "stop";
  const shownStatus = runs.find((r) => r.scriptId === shown);
  const setupRunning = setup.state === "running";

  // Conductor's run-tab URL (`ea`): found in the run output while the task runs, kept until it stops.
  const runBusy = !showSpotlight && busy;
  useEffect(() => {
    if (!runBusy) setDetectedUrl(null);
  }, [runBusy, shown, wsId]);
  useEffect(() => {
    if (runBusy && detectedUrl === null) setDetectedUrl(detectLocalhostUrl(runOut));
  }, [runBusy, detectedUrl, runOut]);
  // The Open button (`id`): while the run task runs, with a preview URL or one found in its output.
  const previews = runBusy ? previewOptions(repoSettings?.previewUrls?.value, detectedUrl, previewEnv) : [];
  // In-app browser preview is an experimental setting in Conductor, off by default; with it off
  // (`lr`, `vs`) the URL opens in the default browser.
  const openPreview = (option: PreviewOption) => {
    openUrl(option.resolvedUrl).catch((e) => console.error("Failed to open URL:", e));
  };

  // The Run tab's ▶/■ button: stop what runs, else start the task shown.
  const toggleRun = () => {
    if (showSpotlight) {
      if (!spotButton.disabled) void toggleSpotlightRun(spotMine ? "stop" : "start");
    } else if (!button.disabled) void act(() => (button.action === "stop" ? api.stopRun(wsId, null) : startScript(shown)));
  };
  // workspace.toggleRun (⌘R), as Conductor's terminal panel binds it (renderApp-D_fmY7hW.js
  // offset ~7,141,947): with a run task and the workspace ready, show the Run tab, then stop
  // the running task or start the shown one. Without a run task it does nothing.
  useKeybindings({
    "workspace.toggleRun": () => {
      if (tasks.length === 0 || !ref || config === null) return;
      onShowRun();
      toggleRun();
    },
    // terminal.openLocalhost (⌘⇧B), Conductor's terminal panel handler (~7,141,744): on the Run tab,
    // open the first preview URL; otherwise pass the key on.
    "terminal.openLocalhost": () => {
      if (!active || previews.length === 0) return false;
      openPreview(previews[0]);
      return true;
    },
  });

  // Conductor's Setup tab (`nro`, local workspace): the log once setup has run, with Stop or
  // Rerun in its corner; before that, "No setup script output" and Run setup, or with no setup
  // script the dashed "Add setup script" card (Ask agent / Add manually).
  async function setupAction(mode: "run" | "stop") {
    if (setupPending || !ref) return;
    setSetupPending(mode);
    await act(() => (mode === "stop" ? api.cancelSetup(wsId) : api.startSetup(ref)));
    setSetupPending(null);
  }
  const setupButton = (mode: SetupButtonMode, corner: boolean) => {
    const pending = mode === "stop" ? setupPending === "stop" : setupPending === "run";
    return (
      <button
        type="button"
        className={`scripts-setup-btn${corner ? " is-corner" : ""}`}
        disabled={pending}
        onClick={() => void setupAction(mode === "stop" ? "stop" : "run")}
      >
        {pending ? <WorkingDots /> : <SetupButtonIcon mode={mode} />}
        {pending ? SETUP_BUTTON[mode].pending : SETUP_BUTTON[mode].idle}
      </button>
    );
  };
  function setupBody() {
    if (setup.state !== "idle" || setup.log) {
      return (
        <div className="scripts-setup-log" aria-label={SETUP_TEXT[setup.state]}>
          {error && <div className="scripts-error">{error}</div>}
          <ScriptOutput key={`setup:${wsId}`} output={setup.log ?? ""} />
          {setupButton(setupRunning || setupPending === "stop" ? "stop" : "rerun", true)}
        </div>
      );
    }
    if (!config?.setup) {
      if (ref && config === null && !configError) {
        return (
          <div className="scripts-setup-center" aria-busy="true">
            <WorkingDots />
          </div>
        );
      }
      if (configError && config === null) {
        return (
          <div className="scripts-setup-center">
            <p className="scripts-setup-title">Couldn't load setup script settings</p>
          </div>
        );
      }
      return (
        <div className="scripts-setup-add">
          <div className="scripts-setup-add-box">
            <h3>{SETUP_ADD_TITLE}</h3>
            <div className="scripts-setup-add-actions">
              <button type="button" className="scripts-setup-ask" disabled={!onAskAgent} onClick={(e) => { e.stopPropagation(); onAskAgent?.(); }}>
                Ask agent
              </button>
              <button type="button" className="scripts-setup-manual" onClick={(e) => { e.stopPropagation(); onAddRunScript(); }}>
                Add manually
              </button>
            </div>
            <span>{SETUP_ADD_TEXT}</span>
          </div>
        </div>
      );
    }
    return (
      <div className="scripts-setup-center is-idle">
        {error && <div className="scripts-error">{error}</div>}
        <p className="scripts-setup-title">{SETUP_IDLE_TITLE}</p>
        <p className="scripts-setup-hint">{SETUP_EMPTY_TEXT}</p>
        {setupButton("run", false)}
      </div>
    );
  }

  // Conductor's Run tab with no run script: a dashed box offering to add one.
  const noRunScript = (config !== null || !ref) && tasks.length === 0 && !showSpotlight && runs.length === 0;

  // A workspace seen for the first time: nothing until its config is known, rather than
  // the "No run script configured" view for the frames before the dashed box replaces it.
  if (tab === "run" && ref && config === null && !error && runs.length === 0) {
    return <section className="scripts" aria-label="Run" aria-busy="true" />;
  }

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

  // The shown task as Conductor's run button and body read it (src/scripts/runTab.ts).
  const shownTaskInfo = tasks.find((t) => t.id === shown) ?? null;
  const shownScript = scripts.find((s) => s.id === shown);
  const taskState: RunState | null = showSpotlight
    ? spotPending ?? (spotMine ? "running" : null)
    : shownStatus && shownStatus.state !== "stopped"
      ? shownStatus.state
      : null;
  const header = runHeader(shownTaskInfo, taskState);
  const hasOutput = showSpotlight ? spotLogMine && spotView.log.length > 0 : runOut.length > 0;
  const body = runBody(shownTaskInfo, taskState, showSpotlight ? spotMine : shownStatus !== undefined, hasOutput);
  const headerDisabled = showSpotlight ? spotButton.disabled : button.disabled;

  function runTabBody() {
    if (body.kind === "pending") {
      return (
        <div className="scripts-run-pending">
          <WorkingDots />
          <p>{body.text}</p>
        </div>
      );
    }
    if (body.kind === "idle") {
      return (
        <div className="scripts-run-idle">
          <RunIcon name={shownScript?.icon ?? "play"} size={48} />
          <div className="scripts-run-idle-actions">
            <button type="button" className="scripts-setup-btn" disabled={headerDisabled} title={showSpotlight ? spotButton.hint : button.hint} onClick={toggleRun}>
              {body.button}
              <ShortcutHint commandId="workspace.toggleRun" />
            </button>
            <p>{body.hint}</p>
          </div>
        </div>
      );
    }
    return showSpotlight ? (
      <ScriptOutput key={`spotlight:${wsId}`} output={spotLogMine && spotView.log.length > 0 ? spotView.log.join("\n") : spotButton.hint ?? SPOTLIGHT_EMPTY_TEXT} />
    ) : (
      <ScriptOutput key={`run:${wsId}:${shown}`} output={runOut} />
    );
  }

  return (
    <section className="scripts" aria-label={tab === "run" ? "Run" : "Setup"}>
      {actionsSlot &&
        ref &&
        createPortal(
          <>
            {active && previews.length > 0 && <PreviewOpenButton options={previews} onOpen={openPreview} />}
            {tasks.length > 0 && (
              <RunSplitButton
                header={header}
                task={shownTaskInfo}
                tasks={tasks.map((t) => ({ ...t, icon: scripts.find((s) => s.id === t.id)?.icon }))}
                icon={shownScript?.icon}
                disabled={headerDisabled}
                onToggle={toggleRun}
                onPick={(id) => {
                  setPicked(id);
                  onShowRun();
                  if (id === SPOTLIGHT_TASK_ID) void toggleSpotlightRun("start");
                  else void act(() => startScript(id));
                }}
                onConfigure={onAddRunScript}
              />
            )}
          </>,
          actionsSlot,
        )}
      {error && tab === "run" && <div className="scripts-error">{error}</div>}
      {tab === "run" ? runTabBody() : setupBody()}
    </section>
  );
}

/** Conductor's working indicator (`ri type="working"`): three dots that pulse in turn. */
function WorkingDots() {
  return (
    <svg className="sb-ws-loader scripts-working" width={12} height={12} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  );
}

/** Lucide play / refresh-cw / square, the icons of Conductor's `JEs` (12 px). */
function SetupButtonIcon({ mode }: { mode: SetupButtonMode }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {mode === "run" ? (
        <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
      ) : mode === "rerun" ? (
        <>
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </>
      ) : (
        <rect width="18" height="18" x="3" y="3" rx="2" />
      )}
    </svg>
  );
}
