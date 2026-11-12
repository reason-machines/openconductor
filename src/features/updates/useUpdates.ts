import { useEffect, useRef } from "react";
import { inTauri } from "../../backend.ts";
import { getSettings } from "../../settings/api.ts";
import { boolPref } from "../../settings/prefs.ts";
import { restartPersistence, type PersistenceReceipt } from "../../lib/persistence/restartPersistence.ts";
import type { Repo } from "../../state/types.ts";
import type { StoreStartup } from "../../state/store.ts";
import type { useToasts } from "../../components/Toast.tsx";
import { checkForUpdate, restartApp, type AppUpdate } from "./api.ts";
import { createIdleRestart, type RestartNotice } from "./restartWhenIdle.ts";
import { useIdleReadiness } from "./useIdleReadiness.ts";

export function useUpdates({ repos, startup, notify }: {
  repos: readonly Repo[];
  startup: StoreStartup;
  notify: ReturnType<typeof useToasts>["show"];
}): void {
  const readiness = useIdleReadiness(repos, startup);
  const latest = useRef({ readiness, notify });
  latest.current = { readiness, notify };
  useEffect(() => {
    if (!inTauri()) return;
    let disposed = false;
    let polling = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observations = new Set<Promise<void>>();
    let pollTask: Promise<void> = Promise.resolve();
    const updates = new Map<string, { update: AppUpdate; attempts: number; downloaded: boolean; noticed: boolean }>();
    const persistence = restartPersistence();
    let receipt: PersistenceReceipt | undefined;
    const coordinator = createIdleRestart({
      readiness: () => latest.current.readiness.read(),
      refresh: () => latest.current.readiness.refresh?.() ?? Promise.resolve(),
      async flush() { receipt = await persistence.drain(); },
      persistenceCurrent: () => receipt !== undefined && persistence.isCurrent(receipt),
      async restart() {
        if (!receipt || !persistence.isCurrent(receipt)) throw new Error("Persistence changed before restart");
        await restartApp();
      },
      notify(notice: RestartNotice) {
        if (disposed) return;
        if (notice === "update-ready" || notice === "auto-when-idle") {
          latest.current.notify("info", "New update available", {
            sticky: true,
            ...(notice === "auto-when-idle" ? { description: "Will automatically restart when all agents are idle" } : {}),
            onDismiss: coordinator.cancel,
          });
        } else latest.current.notify("error", notice === "install-failed" ? "Update install failed" : notice === "flush-failed" ? "Could not save changes before restart" : "Restart failed");
      },
    });
    const observe = () => {
      const task = coordinator.observe();
      observations.add(task);
      void task.finally(() => observations.delete(task));
      return task;
    };
    const release = readiness.subscribe(() => { void observe(); });
    const schedule = () => {
      if (!disposed) timer = setTimeout(() => { pollTask = poll(); },  document.visibilityState === "visible" ? 60000 : 300000);
    };
    async function poll(): Promise<void> {
      if (disposed || polling) return;
      polling = true;
      let stage: "check" | "download" | "preference" = "check";
      try {
        const found = await checkForUpdate();
        if (!found) { await observe(); return; }
        if (disposed) { await found.close(); return; }
        let cached = updates.get(found.version);
        if (cached) { if (cached.update !== found) await found.close(); }
        else { cached = { update: found, attempts: 0, downloaded: false, noticed: false }; updates.set(found.version, cached); }
        if (!cached.downloaded && cached.attempts < 3) {
          stage = "download";
          cached.attempts++;
          await cached.update.download();
          cached.downloaded = true;
        }
        if (disposed) return;
        if (cached.downloaded && !cached.noticed) {
          stage = "preference";
          const enabled = boolPref(await getSettings(), "auto_restart_on_update_when_idle");
          if (disposed) return;
          cached.noticed = await coordinator.downloaded(cached.update, enabled);
        }
        await observe();
      } catch (error) {
        if (!disposed) {
          if (stage === "check") console.warn("updates: check failed", error);
          else latest.current.notify("error", stage === "download" ? "Update download failed" : "Could not read the restart preference");
        }
      } finally { polling = false; schedule(); }
    }
    pollTask = poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      release();
      coordinator.dispose();
      void Promise.allSettled([pollTask, ...observations]).then(async () => {
        for (const cached of updates.values()) await cached.update.close().catch((error) => console.warn("updates: resource cleanup failed", error));
      });
    };
  }, [readiness]);
}
