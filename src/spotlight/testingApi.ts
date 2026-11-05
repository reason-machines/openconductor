// Bridge to the Spotlight testing commands (src-tauri/src/spotlight_commands.rs).
// Outside Tauri (vite dev, screenshots) an in-memory stand-in plays a session
// with a few syncs so the Run panel can be exercised end to end.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import { stopRun } from "../scripts/api";
import type { SpotlightEvent, SpotlightStatus, SpotlightTesting, SpotlightTestingChange } from "./testing.ts";

type Listener = (e: SpotlightEvent) => void;

export async function onSpotlightEvent(listener: Listener): Promise<() => void> {
  if (!inTauri()) {
    browser.listeners.add(listener);
    return () => browser.listeners.delete(listener);
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<SpotlightEvent>("spotlight://event", (e) => listener(e.payload));
}

/**
 * Stops the run scripts of every workspace of the repository, then starts
 * Spotlight. Resolves to false when this workspace was already spotlighted there.
 */
export async function startSpotlight(repoId: string, workspaceId: string, workspacePath: string, repoRoot: string): Promise<boolean> {
  if (!inTauri()) {
    // The scripts stand-in has no repositories; stop this workspace's runs.
    await stopRun(workspaceId, null);
    return browser.start(workspaceId, repoRoot);
  }
  return invoke<boolean>("spotlight_start", { repoId, workspaceId, workspacePath, repoRoot });
}

export async function stopSpotlight(repoRoot: string): Promise<boolean> {
  if (!inTauri()) return browser.stop(repoRoot);
  return invoke<boolean>("spotlight_stop", { repoRoot });
}

export async function spotlightStatus(repoRoot: string): Promise<SpotlightStatus> {
  if (!inTauri()) {
    const workspaceId = browser.sessions.get(repoRoot) ?? null;
    return { active: workspaceId !== null, workspaceId };
  }
  return invoke<SpotlightStatus>("spotlight_status", { repoRoot });
}

export async function spotlightTesting(repoId: string): Promise<SpotlightTesting> {
  if (!inTauri()) return browser.setting(repoId);
  return invoke<SpotlightTesting>("spotlight_testing_get", { repoId });
}

/** Write the setting, then the backend stops the repository's runs and Spotlight. */
export async function setSpotlightTesting(repoId: string, repoRoot: string, enabled: boolean): Promise<SpotlightTestingChange> {
  if (!inTauri()) return browser.set(repoId, repoRoot, enabled);
  return invoke<SpotlightTestingChange>("spotlight_testing_set", { repoId, enabled });
}

// ---- browser stand-in -------------------------------------------------------

const browser = {
  listeners: new Set<Listener>(),
  enabled: new Map<string, boolean>(),
  sessions: new Map<string, string>(),
  timers: new Map<string, ReturnType<typeof setTimeout>[]>(),

  emit(e: SpotlightEvent) {
    for (const l of browser.listeners) l(e);
  },
  setting(repoId: string): SpotlightTesting {
    const enabled = browser.enabled.get(repoId) ?? false;
    return { enabled, layer: enabled ? "repo_local" : null, managed: false };
  },
  start(workspaceId: string, repoRoot: string): boolean {
    if (browser.sessions.get(repoRoot) === workspaceId) return false;
    browser.stop(repoRoot);
    browser.sessions.set(repoRoot, workspaceId);
    const s = { repoRoot, workspaceId };
    browser.emit({ type: "started", leftoverRestoreError: null, ...s });
    const at = (ms: number, e: SpotlightEvent) => setTimeout(() => browser.sessions.get(repoRoot) === workspaceId && browser.emit(e), ms);
    browser.timers.set(repoRoot, [
      at(150, { type: "syncing", ...s }),
      at(500, { type: "synced", ...s }),
      at(1400, { type: "syncing", ...s }),
      at(1700, { type: "synced", ...s }),
    ]);
    return true;
  },
  stop(repoRoot: string): boolean {
    const workspaceId = browser.sessions.get(repoRoot);
    if (!workspaceId) return false;
    for (const t of browser.timers.get(repoRoot) ?? []) clearTimeout(t);
    browser.timers.delete(repoRoot);
    browser.sessions.delete(repoRoot);
    browser.emit({ type: "stopped", repoRoot, workspaceId, restoreError: null });
    return true;
  },
  set(repoId: string, repoRoot: string, enabled: boolean): SpotlightTestingChange {
    browser.enabled.set(repoId, enabled);
    const spotlightStopped = browser.stop(repoRoot);
    return { setting: browser.setting(repoId), stoppedWorkspaces: [], spotlightStopped };
  },
};
