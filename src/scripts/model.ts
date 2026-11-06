// Pure state for the workspace Run button and the Run / Setup output panel.
// Shapes mirror the Tauri commands in src-tauri/src/scripts.rs (crates/scripts).

export type RunState = "starting" | "waiting_for_setup" | "running" | "stopping" | "stopped";
export type SetupState = "idle" | "running" | "completed" | "failed" | "cancelled";
export type Location = "local" | "cloud";

export interface RunScript {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd: string | null;
  default: boolean;
  icon: string;
  hide: boolean;
  availableIn: Location[];
  layer: string;
}

export interface ScriptsConfig {
  setup: string | null;
  setupLayer: string | null;
  archive: string | null;
  archiveLayer?: string | null;
  runMode: "concurrent" | "nonconcurrent";
  autoRunAfterSetup: boolean;
  run: RunScript[];
  managedKeys: string[];
  warnings: string[];
}

export interface RunStatus {
  workspaceId: string;
  scriptId: string;
  state: RunState;
  /** [exit code, signal] of the last run, once it ended. */
  exit: [number | null, number | null] | null;
}

export interface SetupOutcome {
  workspaceId: string;
  state: SetupState;
  exitCode: number | null;
  logPath: string;
  log: string;
}

export interface SetupStatus {
  state: SetupState;
  log: string | null;
  last: SetupOutcome | null;
}

export type ScriptEvent =
  | { type: "output"; workspaceId: string; kind: "setup" | "run"; scriptId: string; chunk: string }
  | ({ type: "setupFinished" } & SetupOutcome);

/** Argument the backend needs to find a workspace's scripts. */
export interface WorkspaceRef {
  workspaceId: string;
  repositoryId: string;
  repoRoot: string;
  workspacePath: string;
  workspaceName: string;
  defaultBranch: string;
  targetBranch: string | null;
}

export function workspaceRef(
  repo: { id: string; path: string; defaultBranch: string },
  ws: { id: string; name: string; path?: string },
): WorkspaceRef | null {
  if (!ws.path || !repo.path) return null;
  return {
    workspaceId: ws.id,
    repositoryId: repo.id,
    repoRoot: repo.path,
    workspacePath: ws.path,
    workspaceName: ws.name,
    defaultBranch: repo.defaultBranch,
    targetBranch: null,
  };
}

/** Scripts shown in the picker: local ones that are not hidden. */
export function visibleScripts(config: ScriptsConfig | null): RunScript[] {
  return (config?.run ?? []).filter((s) => s.availableIn.includes("local") && !s.hide);
}

/** What a plain Run starts: the first default script, else the first one. */
export function defaultScript(config: ScriptsConfig | null): RunScript | null {
  const local = (config?.run ?? []).filter((s) => s.availableIn.includes("local"));
  return local.find((s) => s.default) ?? local[0] ?? null;
}

const BUSY: RunState[] = ["starting", "waiting_for_setup", "running", "stopping"];

/** The script currently active in a workspace, if any. */
export function activeRun(statuses: RunStatus[]): RunStatus | null {
  return statuses.find((s) => BUSY.includes(s.state)) ?? null;
}

export interface RunButton {
  action: "run" | "stop" | "none";
  label: string;
  disabled: boolean;
  hint?: string;
}

export function runButton(config: ScriptsConfig | null, statuses: RunStatus[], hasPath: boolean): RunButton {
  const active = activeRun(statuses);
  if (active) {
    const label = active.state === "waiting_for_setup" ? "Waiting for setup" : active.state === "stopping" ? "Stopping" : "Stop";
    return { action: "stop", label, disabled: active.state === "stopping" };
  }
  if (!hasPath) return { action: "none", label: "Run", disabled: true, hint: "This workspace has no worktree yet." };
  const script = defaultScript(config);
  if (!script) return { action: "none", label: "Run", disabled: true, hint: "Add a run script in the repository's .conductor/settings.toml." };
  return { action: "run", label: "Run", disabled: false, hint: script.command };
}

export const SETUP_TEXT: Record<SetupState, string> = {
  idle: "Setup has not run",
  running: "Setup is running",
  completed: "Setup succeeded",
  failed: "Setup failed",
  cancelled: "Setup was stopped",
};

/** Exit summary for a finished run: "exited 0", "exited 2", "stopped". */
export function exitText(status: RunStatus | undefined): string | null {
  if (!status || status.state !== "stopped" || !status.exit) return null;
  const [code, signal] = status.exit;
  return code !== null ? `exited ${code}` : signal !== null ? "stopped" : null;
}

/** Output kept per panel in memory; older text is dropped first. */
export const OUTPUT_LIMIT = 200_000;

export function appendOutput(buffer: string, chunk: string, limit = OUTPUT_LIMIT): string {
  const next = buffer + chunk;
  return next.length <= limit ? next : next.slice(next.length - limit);
}

/** Remove ANSI escape sequences so plain-text output stays readable. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g, "");
}
