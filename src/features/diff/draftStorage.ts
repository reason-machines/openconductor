// parity:diff.edit-in-viewer — persist in-editor drafts to localStorage so they survive a Tauri
// WebView restart.  Conductor keeps drafts in a persisted store; we approximate that with
// localStorage, which the Tauri WebView exposes per origin.  All calls are wrapped in
// try/catch so private-browsing restrictions, quota errors and Node test environments are
// silently tolerated.

/** localStorage key prefix for editor drafts. */
export const DRAFT_LS_PREFIX = "oc:draft:";

/** Abstraction over the storage backend, injectable for tests. */
export interface DraftStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Number of stored entries. */
  readonly length: number;
  /** Return the nth key, or null. */
  key(index: number): string | null;
}

function safeStore(): DraftStore | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Load all persisted draft entries into a Map, keyed by their internal draft key. */
export function loadPersistedDrafts(store: DraftStore | null = safeStore()): Map<string, string> {
  const map = new Map<string, string>();
  if (!store) return map;
  try {
    for (let i = 0; i < store.length; i++) {
      const lsKey = store.key(i);
      if (lsKey?.startsWith(DRAFT_LS_PREFIX)) {
        const value = store.getItem(lsKey);
        if (value !== null) map.set(lsKey.slice(DRAFT_LS_PREFIX.length), value);
      }
    }
  } catch {
    // Silently tolerate enumeration errors (e.g. permission errors in tests).
  }
  return map;
}

/**
 * Write `draft` for `draftKey` to the store, or remove the entry when `draft` is undefined.
 * Never throws.
 */
export function syncDraftToStorage(draftKey: string, draft: string | undefined, store: DraftStore | null = safeStore()): void {
  if (!store) return;
  try {
    if (draft !== undefined) store.setItem(DRAFT_LS_PREFIX + draftKey, draft);
    else store.removeItem(DRAFT_LS_PREFIX + draftKey);
  } catch {
    // Quota errors, private browsing — ignore.
  }
}
