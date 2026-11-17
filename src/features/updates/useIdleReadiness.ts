import { invoke } from "@tauri-apps/api/core";
import type { DbWorkspaceRow } from "../../state/persisted.ts";
import { useEffect, useRef } from "react";
import { appPrefsReady } from "../../settings/appPrefs.ts";
import { chatStatuses, chatStatusesReady, subscribeChatStatuses } from "../chat/chatRuntime.ts";
import { onScriptEvent, setupStatus } from "../../scripts/api.ts";
import type { Repo } from "../../state/types.ts";
import type { StoreStartup } from "../../state/store.ts";
import type { IdleReadiness } from "./restartWhenIdle.ts";

export function useIdleReadiness(repos: readonly Repo[], startup: StoreStartup) {
  const latest = useRef({ repos, startup });
  latest.current = { repos, startup };
  const instance = useRef<ReturnType<typeof makeReadiness>>();
  if (!instance.current) instance.current = makeReadiness(() => latest.current);
  const readiness = instance.current;
  useEffect(() => {
    let disposed = false;
    let releaseScript: (() => void) | undefined;
    const releaseStatuses = subscribeChatStatuses(readiness.changed);
    void onScriptEvent((event) => {
      if (event.type === "setupFinished" || event.type === "output" && event.kind === "setup") readiness.invalidate();
    }).then((release) => { if (disposed) release(); else { releaseScript = release; readiness.connected(); } }, () => readiness.invalidate());
    return () => { disposed = true; releaseStatuses(); releaseScript?.(); readiness.disconnected(); };
  }, [readiness]);
  return readiness;
}

function makeReadiness(latest: () => { repos: readonly Repo[]; startup: StoreStartup }) {
  let connected = false;
  let generation = 0;
  let snapshot: { repos: readonly Repo[]; generation: number; setupRunning: boolean; workspaceStates: string[] } | undefined;
  const listeners = new Set<() => void>();
  const changed = () => { for (const listener of listeners) listener(); };
  const invalidate = () => { generation++; snapshot = undefined; changed(); };
  return {
    changed, invalidate,
    connected() { connected = true; invalidate(); },
    disconnected() { connected = false; invalidate(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async refresh(): Promise<void> {
      const current = latest();
      const started = generation;
      snapshot = undefined;
      if (!connected || current.startup !== "ready" || !chatStatusesReady() || !appPrefsReady()) return;
      try {
        const repoIds = new Set(current.repos.filter((repo) => repo.path !== "").map((repo) => repo.id));
        const rows = await invoke<DbWorkspaceRow[]>("db_list_workspaces");
        if (!Array.isArray(rows)) return;
        const knownStates = new Set(["unstarted", "initializing", "setting_up", "ready", "archiving", "archived", "failed", "deleted"]);
        if (rows.some((row) => !row || typeof row.id !== "string" || typeof row.repositoryId !== "string" || !knownStates.has(row.state))) return;
        const workspaces = rows.filter((row) => repoIds.has(row.repositoryId) && row.state !== "archived" && row.state !== "deleted");
        const statuses = await Promise.all(workspaces.map((workspace) => setupStatus(workspace.id)));
        const setupStates = new Set(["idle", "running", "completed", "failed", "cancelled"]);
        if (statuses.some((status) => !status || !setupStates.has(status.state))) return;
        if (started !== generation || latest().repos !== current.repos || !connected) return;
        snapshot = { repos: current.repos, generation: started, setupRunning: statuses.some((status) => status.state === "running"), workspaceStates: workspaces.map((workspace) => workspace.state) };
      } catch { snapshot = undefined; }
    },
    read(): IdleReadiness {
      const current = latest();
      if (!connected || current.startup !== "ready" || !chatStatusesReady() || !appPrefsReady() || !snapshot || snapshot.repos !== current.repos || snapshot.generation !== generation) return { kind: "unknown" };
      return {
        kind: "ready",
        sessionStatuses: [...chatStatuses().values()],
        workspaceStates: snapshot.workspaceStates,
        setupRunning: snapshot.setupRunning,
      };
    },
  };
}
