// Pure state for Spotlight testing in the Run panel. Shapes mirror
// src-tauri/src/spotlight_commands.rs and the `spotlight://event` payload
// (`SpotlightEvent` in src-tauri/src/spotlight/service.rs).
//
// Reference (Conductor's frontend, read on sven m5 max): when the repository's
// `spotlight_testing` setting is on, a "Spotlight" task is appended after the
// run scripts; it is never the default task. Its idle panel offers
// "Start spotlight" with "Sync your changes to the repository root.", and
// the button reads "Run Spotlight" / "Stop Spotlight" / "Stopping...".

import type { RunScript } from "../scripts/model.ts";

/** Task id of the Spotlight entry in the Run task list. */
export const SPOTLIGHT_TASK_ID = "spotlight";
export const SPOTLIGHT_LABEL = "Spotlight";
export const SPOTLIGHT_EMPTY_TEXT = "Sync your changes to the repository root.";
export const SPOTLIGHT_SETTING_TITLE = "Use spotlight testing";
export const SPOTLIGHT_SETTING_DESCRIPTION =
  "Replace Run with Spotlight for this repository so workspace changes are tested in the repository root.";
export const SPOTLIGHT_DOCS_URL = "https://www.conductor.build/docs/reference/scripts/spotlight-testing";

export type SettingsLayer = "defaults" | "user" | "repo_shared" | "repo_local" | "managed";

export interface SpotlightTesting {
  enabled: boolean;
  /** Layer that sets the value; null when no file sets it (off). */
  layer: SettingsLayer | null;
  /** The managed layer sets it, so the toggle is refused. */
  managed: boolean;
}

export interface SpotlightTestingChange {
  setting: SpotlightTesting;
  stoppedWorkspaces: string[];
  spotlightStopped: boolean;
}

export interface SpotlightStatus {
  active: boolean;
  workspaceId: string | null;
}

interface Session {
  repoRoot: string;
  workspaceId: string;
}

export type SpotlightEvent =
  | ({ type: "started"; leftoverRestoreError: string | null } & Session)
  | ({ type: "syncing" } & Session)
  | ({ type: "synced" } & Session)
  | ({ type: "skipped"; busy: boolean; message: string | null } & Session)
  | ({ type: "syncFailed"; message: string } & Session)
  | ({ type: "stopped"; restoreError: string | null } & Session);

/** One entry in the Run task picker. */
export interface RunTask {
  id: string;
  label: string;
  kind: "script" | "spotlight";
}

/** Run scripts first, then Spotlight when the setting is on (Conductor's order). */
export function runTasks(scripts: RunScript[], spotlightEnabled: boolean): RunTask[] {
  const tasks: RunTask[] = scripts.map((s) => ({ id: s.id, label: s.label, kind: "script" }));
  if (spotlightEnabled) tasks.push({ id: SPOTLIGHT_TASK_ID, label: SPOTLIGHT_LABEL, kind: "spotlight" });
  return tasks;
}

/** What the panel knows about the Spotlight session on one repository root. */
export interface SpotlightView {
  /** Workspace being synced into the root, or null when no session runs. */
  workspaceId: string | null;
  syncing: boolean;
  /** Short status for the meta line ("Synced 12:03:04"). */
  status: string | null;
  /** Lines shown in the output area, oldest first. */
  log: string[];
  /** Workspace the log and status belong to; kept after the session stops. */
  logWorkspaceId: string | null;
}

export const EMPTY_VIEW: SpotlightView = { workspaceId: null, syncing: false, status: null, log: [], logWorkspaceId: null };

/** Log lines kept per root; older lines are dropped first. */
export const LOG_LIMIT = 500;

const clock = (at: Date) => at.toTimeString().slice(0, 8);

/** The view as `spotlight_status` reports it, before any event arrives. */
export function viewFromStatus(status: SpotlightStatus): SpotlightView {
  return status.active && status.workspaceId
    ? { workspaceId: status.workspaceId, syncing: false, status: "Running", log: [], logWorkspaceId: status.workspaceId }
    : EMPTY_VIEW;
}

/** The status text and log line for one event. */
export function describe(event: SpotlightEvent): { status: string | null; line: string } {
  switch (event.type) {
    case "started":
      return {
        status: "Started",
        line: event.leftoverRestoreError
          ? `Spotlight started. An earlier session could not be undone, so the root kept its last synced state: ${event.leftoverRestoreError}`
          : `Spotlight started: syncing this workspace into ${event.repoRoot}`,
      };
    case "syncing":
      return { status: "Syncing", line: "Syncing changes to the repository root" };
    case "synced":
      return { status: "Synced", line: "Synced" };
    case "skipped":
      return event.busy
        ? { status: "Waiting", line: "Skipped: a merge, rebase, cherry-pick or revert is in progress in this workspace" }
        : { status: "Sync skipped", line: `Skipped: the workspace could not be saved${event.message ? `: ${event.message}` : ""}` };
    case "syncFailed":
      return { status: "Sync failed", line: `The workspace was saved but the repository root could not be updated: ${event.message}` };
    case "stopped":
      return event.restoreError
        ? { status: "Root not restored", line: `Spotlight stopped, but the repository root could not be put back (the next start retries): ${event.restoreError}` }
        : { status: null, line: "Spotlight stopped; the repository root is back as it was" };
  }
}

/**
 * Apply an event for this view's root. `stopped` keeps the log so the user
 * can read how the session ended; a later `started` begins a fresh log.
 */
export function applyEvent(view: SpotlightView, event: SpotlightEvent, at: Date, limit = LOG_LIMIT): SpotlightView {
  const { status, line } = describe(event);
  const stamped = `[${clock(at)}] ${line}`;
  const prior = event.type === "started" ? [] : view.log;
  const log = [...prior, stamped].slice(-limit);
  const timed = status && (event.type === "synced" || event.type === "started") ? `${status} ${clock(at)}` : status;
  const logWorkspaceId = event.workspaceId;
  if (event.type === "stopped") return { workspaceId: null, syncing: false, status: timed, log, logWorkspaceId };
  return { workspaceId: event.workspaceId, syncing: event.type === "syncing", status: timed, log, logWorkspaceId };
}

export interface SpotlightButton {
  action: "start" | "stop" | "none";
  label: string;
  disabled: boolean;
  hint?: string;
}

/**
 * The Run button while the Spotlight task is picked, for `workspaceId`.
 * A session for another workspace on the same root is replaced on start
 * (the backend ends it and restores the root first).
 */
export function spotlightButton(
  view: SpotlightView,
  workspaceId: string,
  hasPath: boolean,
  pending: "starting" | "stopping" | null,
): SpotlightButton {
  if (pending === "stopping") return { action: "stop", label: "Stopping...", disabled: true };
  if (pending === "starting") return { action: "start", label: "Starting...", disabled: true };
  if (view.workspaceId === workspaceId) return { action: "stop", label: `Stop ${SPOTLIGHT_LABEL}`, disabled: false };
  if (!hasPath) return { action: "none", label: `Run ${SPOTLIGHT_LABEL}`, disabled: true, hint: "This workspace has no worktree yet." };
  const hint = view.workspaceId
    ? "Spotlight is syncing another workspace into this repository root. Starting here ends that session first."
    : SPOTLIGHT_EMPTY_TEXT;
  return { action: "start", label: `Run ${SPOTLIGHT_LABEL}`, disabled: false, hint };
}

/** Why the toggle cannot change, or null when it can. */
export function toggleBlocked(setting: SpotlightTesting | null, hasRepoPath: boolean): string | null {
  if (!hasRepoPath) return "This repository has no local checkout yet.";
  if (!setting) return "Loading";
  if (setting.managed) return "Managed settings set spotlight testing for this repository.";
  return null;
}
