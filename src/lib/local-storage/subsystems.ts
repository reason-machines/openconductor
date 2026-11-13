// The local-storage subsystems Conductor keeps (all 12, including OpenCode model discovery) as
// `local-storage.subsystem.<name>.json` next to conductor.db, with the size
// limits, entry ids and persist names its frontend uses
// (evidence/persistence/local-storage/NOTES.md). All are unencrypted
// `subsystemStore` subsystems.

export type Subsystem = { readonly name: string; readonly sizeLimit: number };

const MiB = 1024 * 1024;
const KiB = 1024;

/** Storage-like adapter for keys that would otherwise go to window.localStorage. */
export const BROWSER_LOCAL_STORAGE: Subsystem = { name: "browser-local-storage", sizeLimit: 5 * MiB };
/** Claude context window per model id (a number). */
export const CLAUDE_CONTEXT_WINDOWS: Subsystem = { name: "claude-context-windows", sizeLimit: 64 * KiB };
/** Composer draft per session id: a string or `{ message, attachments }`. */
export const COMPOSER_DRAFTS: Subsystem = { name: "composer-drafts", sizeLimit: 5 * MiB };
/** New-workspace dispatcher state, one persisted entry. */
export const DISPATCHER_STATE: Subsystem = { name: "dispatcher-state", sizeLimit: 1 * MiB };
/** `{ effortLevel?, fastMode }` per model id; lastUpdatedAt is when it was last used. */
export const MODEL_PICKER_CONFIGS: Subsystem = { name: "model-picker-configs-v1", sizeLimit: 64 * KiB };
/** Composer completions (files, slash commands, skills) before a workspace exists. */
export const PRE_WORKSPACE_COMPLETIONS: Subsystem = { name: "pre-workspace-completions-v1", sizeLimit: 5 * MiB };
/** Per-route UI state, one persisted entry. */
export const ROUTE_USER_STATE: Subsystem = { name: "route-user-state", sizeLimit: 5 * MiB };
/** Run-script task history per workspace, one persisted entry. */
export const RUN_SCRIPT_HISTORY: Subsystem = { name: "run-script-history", sizeLimit: 5 * MiB };
/** Terminal panel tabs, one persisted entry. */
export const TERMINAL: Subsystem = { name: "terminal", sizeLimit: 100 * MiB };
/** Discovered OpenCode models and their config options per [repoId, mainWorktreePath, opencodeExecutablePath]. */
export const OPENCODE_MODEL_DISCOVERY: Subsystem = { name: "opencode-model-discovery-v1", sizeLimit: 4 * MiB };
/** File changes of one agent turn. */
export const TURN_CHANGES_CACHE: Subsystem = { name: "turn-changes-cache", sizeLimit: 5 * MiB };

export const SUBSYSTEMS: readonly Subsystem[] = [
  BROWSER_LOCAL_STORAGE,
  CLAUDE_CONTEXT_WINDOWS,
  COMPOSER_DRAFTS,
  DISPATCHER_STATE,
  MODEL_PICKER_CONFIGS,
  OPENCODE_MODEL_DISCOVERY,
  PRE_WORKSPACE_COMPLETIONS,
  ROUTE_USER_STATE,
  RUN_SCRIPT_HISTORY,
  TERMINAL,
  TURN_CHANGES_CACHE,
];

/** Entry ids of the subsystems that hold one persisted store each. */
export const PERSIST_NAMES = {
  dispatcherState: "dispatcher-state-v1",
  routeUserState: "route-user-state-v1",
  runScriptHistory: "run-script-history-v1",
  terminalTabs: "terminal-panel-tabs-v1",
} as const;

/** At most this many task ids are kept per workspace in run-script history. */
export const RUN_SCRIPT_HISTORY_LIMIT = 20;
/** Pre-workspace completions are reused for this long. */
export const PRE_WORKSPACE_COMPLETIONS_TTL_MS = 5 * 60_000;

/** `turn-changes-cache` entry id. */
export function turnChangesId({ sessionId, turnId }: { sessionId: string; turnId: string }): string {
  return JSON.stringify([sessionId, turnId]);
}

/** `pre-workspace-completions-v1` entry id for a completion target key. */
export function preWorkspaceCompletionId(targetKey: string): string {
  return `completion:${targetKey}`;
}

/** Key of one route's state in `route-user-state`. */
export function routeStateKey({ routeId, scope = [] }: { routeId: string; scope?: readonly string[] }): string {
  return [routeId, ...scope].map(encodeURIComponent).join("/");
}

/** The subsystem's store file name under the app data folder. */
export function subsystemStoreFileName(name: string): string {
  return `local-storage.subsystem.${encodeURIComponent(name)}.json`;
}
