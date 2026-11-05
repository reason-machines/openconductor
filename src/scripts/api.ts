// Bridge to the scripts commands (src-tauri/src/scripts.rs). Outside Tauri
// (vite dev, screenshots) a small in-memory stand-in plays a setup and a run
// script so the panel can be exercised end to end.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import type { RunStatus, ScriptEvent, ScriptsConfig, SetupStatus, WorkspaceRef } from "./model.ts";

type Listener = (e: ScriptEvent) => void;

export async function onScriptEvent(listener: Listener): Promise<() => void> {
  if (!inTauri()) {
    browser.listeners.add(listener);
    return () => browser.listeners.delete(listener);
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<ScriptEvent>("scripts://event", (e) => listener(e.payload));
}

export async function scriptsConfig(workspace: WorkspaceRef): Promise<ScriptsConfig> {
  if (!inTauri()) return browser.config;
  return invoke<ScriptsConfig>("scripts_config", { workspace });
}

export async function setupStatus(workspaceId: string): Promise<SetupStatus> {
  if (!inTauri()) return browser.setupStatus(workspaceId);
  return invoke<SetupStatus>("setup_script_status", { workspaceId });
}

export async function startSetup(workspace: WorkspaceRef): Promise<boolean> {
  if (!inTauri()) return browser.startSetup(workspace.workspaceId);
  return invoke<boolean>("setup_script_start", { workspace });
}

export async function cancelSetup(workspaceId: string): Promise<void> {
  if (!inTauri()) return browser.cancelSetup(workspaceId);
  return invoke("setup_script_cancel", { workspaceId });
}

export async function runStatus(workspaceId: string): Promise<{ runs: RunStatus[]; history: string[] }> {
  if (!inTauri()) return { runs: browser.runs(workspaceId), history: [] };
  return invoke("run_script_status", { workspaceId });
}

export async function runOutput(workspaceId: string, scriptId: string): Promise<string | null> {
  if (!inTauri()) return browser.output.get(`${workspaceId}:${scriptId}`) ?? null;
  return invoke<string | null>("run_script_output", { workspaceId, scriptId });
}

export async function startRun(workspace: WorkspaceRef, scriptId: string | null): Promise<string> {
  if (!inTauri()) return browser.startRun(workspace.workspaceId, scriptId ?? "dev");
  return invoke<string>("run_script_start", { workspace, scriptId });
}

export async function stopRun(workspaceId: string, scriptId: string | null): Promise<boolean> {
  if (!inTauri()) return browser.stopRun(workspaceId);
  return invoke<boolean>("run_script_stop", { workspaceId, scriptId });
}

/** Settings › Experimental "Auto-run after setup" (user scope, off by default). */
export async function autoRunAfterSetup(): Promise<boolean> {
  if (!inTauri()) return browser.config.autoRunAfterSetup;
  return invoke<boolean>("auto_run_after_setup_get");
}

/** Turn "Auto-run after setup" on or off; resolves to the value read back. */
export async function setAutoRunAfterSetup(enabled: boolean): Promise<boolean> {
  if (!inTauri()) return (browser.config.autoRunAfterSetup = enabled);
  return invoke<boolean>("auto_run_after_setup_set", { enabled });
}

// ---- browser stand-in -------------------------------------------------------

const DEMO_SCRIPT = (id: string, label: string, command: string, isDefault: boolean, icon: string) => ({
  id, label, command, args: [], cwd: null, default: isDefault, icon, hide: false, availableIn: ["local" as const, "cloud" as const], layer: "repo_shared",
});

const browser = {
  listeners: new Set<Listener>(),
  config: {
    setup: "pnpm install",
    setupLayer: "repo_shared",
    archive: null,
    runMode: "concurrent",
    autoRunAfterSetup: false,
    run: [DEMO_SCRIPT("dev", "Dev", "pnpm dev --port $CONDUCTOR_PORT", true, "play"), DEMO_SCRIPT("test", "Test", "pnpm test --watch", false, "test-tube")],
    managedKeys: [],
    warnings: [],
  } as ScriptsConfig,
  setup: new Map<string, SetupStatus>(),
  states: new Map<string, RunStatus>(),
  output: new Map<string, string>(),
  timers: new Map<string, ReturnType<typeof setInterval>>(),
  emit(e: ScriptEvent) {
    for (const l of this.listeners) l(e);
  },
  setupStatus(id: string): SetupStatus {
    return this.setup.get(id) ?? { state: "idle", log: null, last: null };
  },
  startSetup(id: string): boolean {
    const lines = ["Lockfile is up to date, resolution step is skipped\n", "Packages: +412\n", "Progress: resolved 412, reused 412, downloaded 0, added 412, done\n", "Done in 2.1s\n"];
    let log = "";
    this.setup.set(id, { state: "running", log: "", last: null });
    lines.forEach((line, i) =>
      setTimeout(() => {
        log += line;
        this.setup.set(id, { state: "running", log, last: null });
        this.emit({ type: "output", workspaceId: id, kind: "setup", scriptId: "setup", chunk: line });
        if (i === lines.length - 1) {
          const last = { workspaceId: id, state: "completed" as const, exitCode: 0, logPath: `/tmp/conductor-setup-${id}.log`, log };
          this.setup.set(id, { state: "completed", log, last });
          this.emit({ type: "setupFinished", ...last });
          const dev = this.config.run.find((r) => r.default);
          if (this.config.autoRunAfterSetup && dev) this.startRun(id, dev.id);
        }
      }, 250 * (i + 1)),
    );
    return true;
  },
  cancelSetup(id: string) {
    const s = this.setupStatus(id);
    this.setup.set(id, { ...s, state: "cancelled" });
  },
  runs(id: string): RunStatus[] {
    return [...this.states.values()].filter((s) => s.workspaceId === id);
  },
  startRun(id: string, scriptId: string): string {
    this.stopRun(id);
    const key = `${id}:${scriptId}`;
    this.states.set(key, { workspaceId: id, scriptId, state: "running", exit: null });
    const lines = ["\n> app@0.1.0 dev\n", "> vite --port 55000\n\n", "  VITE v5.4.10  ready in 312 ms\n\n", "  ➜  Local:   http://localhost:55000/\n"];
    this.output.set(key, "");
    let i = 0;
    const timer = setInterval(() => {
      if (i >= lines.length) return clearInterval(timer);
      const chunk = lines[i++];
      this.output.set(key, (this.output.get(key) ?? "") + chunk);
      this.emit({ type: "output", workspaceId: id, kind: "run", scriptId, chunk });
    }, 200);
    this.timers.set(key, timer);
    return scriptId;
  },
  stopRun(id: string): boolean {
    let stopped = false;
    for (const [key, s] of this.states) {
      if (s.workspaceId !== id || s.state === "stopped") continue;
      clearInterval(this.timers.get(key));
      this.states.set(key, { ...s, state: "stopped", exit: [null, 15] });
      stopped = true;
    }
    return stopped;
  },
};
