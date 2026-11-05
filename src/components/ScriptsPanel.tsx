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

interface Props {
  repo: Repo;
  workspace: Workspace;
}

const errorText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

/** Run and Setup tabs: start/stop the repository's run scripts and watch setup. */
export function ScriptsPanel({ repo, workspace }: Props) {
  const ref = useMemo(() => workspaceRef(repo, workspace), [repo, workspace]);
  const wsId = workspace.id;
  const [tab, setTab] = useState<"run" | "setup">("run");
  const [config, setConfig] = useState<ScriptsConfig | null>(null);
  const [runs, setRuns] = useState<RunStatus[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [runOut, setRunOut] = useState("");
  const [setup, setSetup] = useState<SetupStatus>({ state: "idle", log: null, last: null });
  const [error, setError] = useState<string | null>(null);
  const outRef = useRef<HTMLPreElement>(null);

  const shown = picked ?? activeRun(runs)?.scriptId ?? defaultScript(config)?.id ?? null;

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
  }, [runOut, setup.log, tab]);

  async function act(f: () => Promise<unknown>) {
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(errorText(e));
    }
    await refresh().catch(() => {});
  }

  const button = runButton(config, runs, ref !== null);
  const scripts = visibleScripts(config);
  const shownStatus = runs.find((r) => r.scriptId === shown);
  const setupRunning = setup.state === "running";

  return (
    <section className="scripts" aria-label="Scripts">
      <div className="tabs scripts-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "run"} className={tab === "run" ? "active" : ""} onClick={() => setTab("run")}>
          Run
        </button>
        <button role="tab" aria-selected={tab === "setup"} className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>
          Setup <span className={`setup-dot ${setup.state}`} aria-label={SETUP_TEXT[setup.state]} />
        </button>
        <div className="scripts-actions">
          {tab === "run" ? (
            <>
              {scripts.length > 1 && (
                <select aria-label="Run script" value={shown ?? ""} onChange={(e) => setPicked(e.target.value)} disabled={button.action === "stop"}>
                  {scripts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              <button
                className={`btn btn-small ${button.action === "stop" ? "btn-stop" : "btn-primary"}`}
                title={button.hint}
                disabled={button.disabled}
                onClick={() => act(() => (button.action === "stop" ? api.stopRun(wsId, null) : api.startRun(ref!, shown)))}
              >
                {button.action === "stop" ? "■" : "▶"} {button.label}
              </button>
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
      {tab === "run" ? (
        <>
          <div className="scripts-meta">
            {shown ? <code>{scripts.find((s) => s.id === shown)?.command ?? shown}</code> : <span>No run script configured</span>}
            {exitText(shownStatus) && <span className="muted">{exitText(shownStatus)}</span>}
          </div>
          <pre ref={outRef} className="scripts-output">{runOut ? stripAnsi(runOut) : button.hint && !shown ? button.hint : "Output from the run script appears here."}</pre>
        </>
      ) : (
        <>
          <div className="scripts-meta">
            <span>{SETUP_TEXT[setup.state]}</span>
            {setup.last?.logPath && <code title="Setup log file">{setup.last.logPath}</code>}
          </div>
          <pre ref={outRef} className="scripts-output">{setup.log ? stripAnsi(setup.log) : config?.setup ? "Setup output appears here after setup runs." : "No setup script is configured for this repository."}</pre>
        </>
      )}
    </section>
  );
}
