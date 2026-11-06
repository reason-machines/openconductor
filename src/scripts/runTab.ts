// The Run tab of the terminal panel, as Conductor 0.87.6 draws it for a local workspace
// (renderApp-D_fmY7hW.js `nro` @7,127,035, read with REA as untrusted data):
//  - the strip's right end holds a split button whenever a run task exists (`n0`): an outline
//    xs button with the task's icon ("Run <label>", ⌘R) and a chevron ("Select task") listing
//    the tasks and Configure; while the task runs, one "Stop <label>" button instead;
//  - the body shows the task's output once it has run (`Ve`), "Starting..." / "Setting up..." /
//    "Stopping..." while pending, and otherwise a large faint icon, an outline "Start <label> ⌘R"
//    and "Test your changes here." (Spotlight: "Start spotlight", "Sync your changes to the
//    repository root.").
import type { RunState } from "./model";

/** Conductor's `yVn`: the label of the default run task (`vDt` "run", capitalised). */
export const DEFAULT_RUN_LABEL = "Run";
export const RUN_IDLE_HINT = "Test your changes here.";
export const SPOTLIGHT_IDLE_HINT = "Sync your changes to the repository root.";
export const SPOTLIGHT_START = "Start spotlight";

export interface RunTabTask {
  id: string;
  label: string;
  kind: "script" | "spotlight";
}

export type RunBody =
  | { kind: "idle"; button: string; hint: string }
  | { kind: "pending"; text: "Starting..." | "Setting up..." | "Stopping..." }
  | { kind: "output" };

export interface RunHeader {
  /** The task runs (or is starting or stopping): one Stop button, no chevron. */
  busy: boolean;
  /** Shown instead of the Stop label while the run is not yet (or no longer) up. */
  pending: "Starting..." | "Setting up..." | "Stopping..." | null;
  /** Visible label once the panel is wide enough (`Dn`): the task's label. */
  label: string;
  /** The main button's name and tooltip: `Vn` when idle, `_n` when busy. */
  name: string;
}

/** `Wt`: the shown task's label, Spotlight for the spotlight task. */
export function taskLabel(task: RunTabTask | null): string {
  if (!task) return DEFAULT_RUN_LABEL;
  return task.kind === "spotlight" ? "Spotlight" : task.label;
}

const PENDING: Partial<Record<RunState, RunHeader["pending"]>> = {
  starting: "Starting...",
  waiting_for_setup: "Setting up...",
  stopping: "Stopping...",
};

/**
 * The strip header's run button for the shown task. `state` is the task's process state
 * (null when it never ran or has stopped).
 */
export function runHeader(task: RunTabTask | null, state: RunState | null): RunHeader {
  const label = taskLabel(task);
  const busy = state === "starting" || state === "waiting_for_setup" || state === "running" || state === "stopping";
  if (busy) return { busy, pending: PENDING[state] ?? null, label, name: state === "stopping" ? "Stopping..." : `Stop ${label}` };
  const name = !task ? "Configure run scripts" : task.kind === "spotlight" ? SPOTLIGHT_START : `Run ${task.label}`;
  return { busy, pending: null, label, name };
}

/**
 * The Run tab's body for the shown task: its output once it has some or once it has run, the
 * pending line while it starts, waits for setup or stops before any output, else the idle view.
 */
export function runBody(task: RunTabTask | null, state: RunState | null, hasRun: boolean, hasOutput: boolean): RunBody {
  const pending = state ? PENDING[state] : undefined;
  if (pending && !hasOutput) return { kind: "pending", text: pending };
  if (hasRun || hasOutput) return { kind: "output" };
  if (task?.kind === "spotlight") return { kind: "idle", button: SPOTLIGHT_START, hint: SPOTLIGHT_IDLE_HINT };
  return { kind: "idle", button: task ? `Start ${task.label}` : "Run workspace", hint: RUN_IDLE_HINT };
}
