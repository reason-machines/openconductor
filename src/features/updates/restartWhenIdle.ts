export type IdleReadiness =
  | { kind: "unknown" }
  | { kind: "ready"; sessionStatuses: readonly string[]; workspaceStates: readonly string[]; setupRunning: boolean };
export interface DownloadedUpdate { version: string; install(): Promise<void> }
export type RestartNotice = "update-ready" | "auto-when-idle" | "install-failed" | "flush-failed" | "restart-failed";
export interface RestartBoundary {
  readiness(): IdleReadiness;
  refresh?(): Promise<void>;
  flush(): Promise<void>;
  persistenceCurrent?(): boolean;
  restart(): Promise<void>;
  notify(notice: RestartNotice): void;
}

export function isIdle(state: IdleReadiness): boolean {
  return state.kind === "ready" && !state.setupRunning
    && state.workspaceStates.every((value) => ["unstarted", "ready", "archived", "failed", "deleted"].includes(value))
    && state.sessionStatuses.every((value) => value === "idle" || value === "error");
}

type Phase = "offered" | "armed" | "installing" | "installed" | "draining" | "restarting" | "finished" | "failed";

export function createIdleRestart(boundary: RestartBoundary) {
  let disposed = false;
  let cancelled = false;
  let current: { update: DownloadedUpdate; phase: Phase } | undefined;
  const seen = new Set<string>();
  let running = false;
  async function ready(): Promise<boolean> {
    if (disposed || cancelled) return false;
    await boundary.refresh?.();
    return !disposed && !cancelled && isIdle(boundary.readiness());
  }
  return {
    async downloaded(update: DownloadedUpdate, autoRestart: boolean): Promise<boolean> {
      if (disposed || seen.has(update.version) || running) return false;
      seen.add(update.version);
      cancelled = false;
      current = { update, phase: autoRestart ? "armed" : "offered" };
      boundary.notify(autoRestart ? "auto-when-idle" : "update-ready");
      return true;
    },
    async observe(): Promise<void> {
      const attempt = current;
      if (disposed || cancelled || running || !attempt || (attempt.phase !== "armed" && attempt.phase !== "installed")) return;
      running = true;
      let stage: "install" | "flush" | "restart" = "install";
      try {
        if (!await ready()) return;
        if (attempt.phase === "armed") {
          attempt.phase = "installing";
          await attempt.update.install();
          if (disposed || cancelled) return;
          attempt.phase = "installed";
          if (!await ready()) return;
        }
        stage = "flush";
        attempt.phase = "draining";
        await boundary.flush();
        if (disposed || cancelled) return;
        attempt.phase = "installed";
        if (!await ready() || boundary.persistenceCurrent && !boundary.persistenceCurrent()) return;
        stage = "restart";
        attempt.phase = "restarting";
        await boundary.restart();
        attempt.phase = "finished";
      } catch {
        attempt.phase = "failed";
        if (!disposed) boundary.notify(stage === "install" ? "install-failed" : stage === "flush" ? "flush-failed" : "restart-failed");
      } finally { running = false; }
    },
    cancel(): void { cancelled = true; },
    dispose(): void { disposed = true; },
  };
}
