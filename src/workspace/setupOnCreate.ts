// Turns the setup-script events of one new workspace (`scripts://event`, see
// src-tauri/src/scripts.rs) into Create-workspace progress events. Conductor's
// create flow shows "Detecting setup script...", "Running setup script..." and
// "Setup script failed" (evidence/create-workspace/README.md, Progress row)
// and keeps the transcript at `workspaces.setup_log_path`
// (evidence/run-scripts/NOTES.md). Pure, so it runs under `node --test`.
import type { CreateEvent } from "./createFlow.ts";
import type { ScriptEvent, WorkspaceRef } from "../scripts/model.ts";

/** Repository as `add_repository` returns it (`RepositoryDto`). */
export interface BackendRepo {
  id: string;
  root: string;
  defaultBranch: string;
}

/** Workspace part of `CreatedWorkspaceDto`. */
export interface CreatedWorkspace {
  id: string;
  directoryName: string;
  path: string;
  branchName: string;
}

/** The `WorkspaceRef` the setup commands take for a freshly created workspace. */
export function setupRef(repo: BackendRepo, ws: CreatedWorkspace): WorkspaceRef {
  return {
    workspaceId: ws.id,
    repositoryId: repo.id,
    repoRoot: repo.root,
    workspacePath: ws.path,
    workspaceName: ws.directoryName,
    defaultBranch: repo.defaultBranch,
    targetBranch: null,
  };
}

export interface SetupFeed {
  /** Progress events for one backend event; other workspaces and run output yield none. */
  push(event: ScriptEvent): CreateEvent[];
  /** Log file of the last finished setup run, once one finished. */
  logPath(): string | null;
}

/**
 * Splits setup output into lines (a chunk may end mid-line) and maps the
 * finish event to `setup_exited`. A cancelled or interrupted run has no exit
 * code and is reported as failed.
 */
export function setupFeed(workspaceId: string): SetupFeed {
  let partial = "";
  let log: string | null = null;
  return {
    push(e) {
      if (e.workspaceId !== workspaceId) return [];
      if (e.type === "output") {
        if (e.kind !== "setup") return [];
        const parts = (partial + e.chunk).split(/\r?\n/);
        partial = parts.pop() ?? "";
        return parts.map((line) => ({ type: "setup_output", line }));
      }
      log = e.logPath || null;
      const out: CreateEvent[] = partial ? [{ type: "setup_output", line: partial }] : [];
      partial = "";
      const exitCode = e.state === "completed" ? 0 : e.exitCode === 0 ? null : e.exitCode;
      out.push({ type: "setup_exited", exitCode });
      return out;
    },
    logPath: () => log,
  };
}
