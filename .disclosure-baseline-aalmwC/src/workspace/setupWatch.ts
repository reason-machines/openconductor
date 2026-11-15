// Setup scripts the create flow started. The dialog closes as soon as setup is
// running, so this keeps "Running setup script..." on that workspace until the
// backend's `setupFinished` arrives on scripts://event, and turns a failure
// into the toast. Setup state itself stays in the backend (setup_script_status)
// and the workspace's Setup tab; this only remembers which ids to watch.
import type { ScriptEvent } from "../scripts/model.ts";

export const SETUP_FAILED_TOAST = "Setup script failed. Check the setup tab for logs.";

export interface WatchStep {
  watching: ReadonlySet<string>;
  toast: string | null;
}

/** Folds one scripts event into the watched set. Only ids the create flow started are touched. */
export function reduceWatch(watching: ReadonlySet<string>, e: ScriptEvent): WatchStep {
  if (e.type !== "setupFinished" || !watching.has(e.workspaceId)) return { watching, toast: null };
  const next = new Set(watching);
  next.delete(e.workspaceId);
  return { watching: next, toast: e.state === "failed" ? SETUP_FAILED_TOAST : null };
}

let watching: ReadonlySet<string> = new Set();
const subscribers = new Set<() => void>();

function set(next: ReadonlySet<string>) {
  if (next === watching) return;
  watching = next;
  for (const s of subscribers) s();
}

/** Call before `startSetup`, so a setup that finishes instantly is still seen. */
export function watchSetup(workspaceId: string) {
  set(new Set(watching).add(workspaceId));
}

/** Call when `startSetup` reports nothing started, or it threw. */
export function unwatchSetup(workspaceId: string) {
  if (!watching.has(workspaceId)) return;
  const next = new Set(watching);
  next.delete(workspaceId);
  set(next);
}

/** Feeds an event through the watcher; returns the toast to show, if any. */
export function handleScriptEvent(e: ScriptEvent): string | null {
  const step = reduceWatch(watching, e);
  set(step.watching);
  return step.toast;
}

export function subscribeWatch(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function isWatching(workspaceId: string): boolean {
  return watching.has(workspaceId);
}
