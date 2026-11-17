import type { SessionStatus } from "../../../../src/features/chat/queue.ts";
import type { Workspace } from "../../../../src/state/types.ts";

export type IdleReadiness =
  | { kind: "unknown" }
  | {
      kind: "ready";
      sessionStatuses: readonly SessionStatus[];
      workspaceStates: readonly NonNullable<Workspace["state"]>[];
      setupRunning: boolean;
    };

export interface DownloadedUpdate {
  version: string;
  install(): Promise<void>;
}

export type RestartNotice = "update-ready" | "auto-when-idle" | "install-failed" | "flush-failed" | "restart-failed";

export interface RestartBoundary {
  readiness(): IdleReadiness;
  flush(): Promise<void>;
  restart(): Promise<void>;
  notify(notice: RestartNotice): void;
}

export interface IdleRestartCoordinator {
  downloaded(update: DownloadedUpdate, autoRestart: boolean): Promise<void>;
  observe(): Promise<void>;
  dispose(): void;
}

export declare function createIdleRestart(boundary: RestartBoundary): IdleRestartCoordinator;
