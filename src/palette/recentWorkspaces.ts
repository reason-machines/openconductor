// Recent workspaces for the command palette, persisted across restarts.
//
// Conductor keeps `recentWorkspaceIds` in its persisted UI store (zustand
// `persist`, localStorage key `workspace-tab-state-v2`, index chunk ~3,120,888
// to ~3,125,306): `recordViewedWorkspace(id)` moves the id to the front, leaves
// the list as is when it is already first, and keeps at most 5
// (`XOt = 5`). The palette shows it under "Recent workspaces".
// We store the list under the same key and shape, `{ state: { ... }, version }`,
// keeping any other fields already there.

export const RECENT_STORAGE_KEY = "workspace-tab-state-v2";
export const RECENT_LIMIT = 5;

/** Most recent first, without duplicates, at most {@link RECENT_LIMIT}. */
export function recordViewedWorkspace(ids: readonly string[], id: string): readonly string[] {
  if (ids[0] === id) return ids;
  return [id, ...ids.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readStore(storage: Storage | undefined): { state?: Record<string, unknown>; version?: number } {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(RECENT_STORAGE_KEY) ?? "null");
    return typeof parsed === "object" && parsed !== null ? (parsed as { state?: Record<string, unknown> }) : {};
  } catch {
    return {};
  }
}

/** The stored list; anything malformed reads as empty. */
export function loadRecentWorkspaceIds(storage: Storage | undefined = defaultStorage()): string[] {
  const ids = readStore(storage).state?.recentWorkspaceIds;
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x): x is string => typeof x === "string"))].slice(0, RECENT_LIMIT);
}

export function saveRecentWorkspaceIds(ids: readonly string[], storage: Storage | undefined = defaultStorage()): void {
  if (!storage) return;
  const stored = readStore(storage);
  const state = typeof stored.state === "object" && stored.state !== null ? stored.state : {};
  try {
    storage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify({ ...stored, state: { ...state, recentWorkspaceIds: ids.slice(0, RECENT_LIMIT) }, version: stored.version ?? 0 }),
    );
  } catch {
    /* storage full or unavailable: the list lasts for this session only */
  }
}
