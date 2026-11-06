// parity:diff.turn-changes:data parity:db.local-storage:data
// What one chat turn changed (the files between its start and end checkpoints),
// kept per turn so the chips under a finished turn don't re-run git.
//
// As in Conductor 0.87.6 (index-BGEQ8YjU.js near byte 3130166; see
// evidence/diff/turn-changes.md): entries live in the local-storage subsystem
// `turn-changes-cache` (TURN_CHANGES_CACHE in lib/local-storage: a
// `subsystemStore`, 5 MiB for the whole subsystem, the
// least recently updated entries evicted to make room), keyed by the JSON
// array [sessionId, turnId], each holding only the file list; storage errors
// are logged, never thrown. Requests for the same turn share one in-flight
// load. Only finished turns are loaded: a running turn has no end checkpoint.
// Pure (storage and fetcher are injected) so turnChangesCache.test.ts covers it.

import { turnChangesId } from "../../lib/local-storage/subsystems.ts";
import type { FileChange, FileStatus } from "./types.ts";

export interface TurnRef {
  /** The parts of the turn's checkpoint ids (`turnCheckpointRef` in features/chat/checkpoints.ts). */
  sessionId: string;
  turnId: string;
}

/** Entry id: the JSON array [sessionId, turnId] (`turnChangesId` in lib/local-storage). */
export const turnCacheId = (ref: TurnRef) => turnChangesId(ref);

/** The `turn-changes-cache` subsystem's entries (lib/local-storage's client, bound in useTurnChanges.ts). */
export interface TurnChangesStorage {
  getEntry(id: string): Promise<unknown>;
  setEntry(id: string, value: unknown): Promise<void>;
}

const STATUSES: ReadonlySet<string> = new Set<FileStatus>(["added", "modified", "deleted", "renamed", "copied", "type_changed", "untracked"]);

function isFileChange(v: unknown): v is FileChange {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.path === "string" &&
    (f.old_path === null || typeof f.old_path === "string") &&
    typeof f.status === "string" &&
    STATUSES.has(f.status) &&
    typeof f.binary === "boolean" &&
    typeof f.additions === "number" &&
    typeof f.deletions === "number"
  );
}

type Log = (message: string, error: unknown) => void;

/** The cached list, or undefined when there is none, it does not parse, or storage failed. */
export async function readCachedTurnChanges(storage: Pick<TurnChangesStorage, "getEntry">, ref: TurnRef, log: Log = console.error): Promise<FileChange[] | undefined> {
  try {
    const value = await storage.getEntry(turnCacheId(ref));
    return Array.isArray(value) && value.every(isFileChange) ? value : undefined;
  } catch (e) {
    log("Failed to read turn changes from local storage", e);
    return undefined;
  }
}

/** Store the list; false when storage refused it (too large for the subsystem, or failed). */
export async function writeCachedTurnChanges(storage: Pick<TurnChangesStorage, "setEntry">, ref: TurnRef, files: FileChange[], log: Log = console.error): Promise<boolean> {
  try {
    await storage.setEntry(turnCacheId(ref), files);
    return true;
  } catch (e) {
    log("Failed to write turn changes to local storage", e);
    return false;
  }
}

export type TurnChangesFetcher = (ref: TurnRef, worktree: string) => Promise<FileChange[]>;

export interface TurnChangesStore {
  /** A list already in memory (recorded or loaded this run), without loading. */
  peek(ref: TurnRef): FileChange[] | undefined;
  /** A list the backend sent with the turn's end (`reason_prompt`'s `turnChanges`). */
  record(ref: TurnRef, files: FileChange[]): void;
  /** Memory, then storage, then the fetcher (skipped when `worktree` is null, giving undefined).
   *  Concurrent calls share one request; a failed fetch is not cached. */
  load(ref: TurnRef, worktree: string | null): Promise<FileChange[] | undefined>;
  /** Called whenever a list is recorded or loaded. */
  subscribe(fn: () => void): () => void;
}

export function createTurnChangesStore(storage: TurnChangesStorage, fetcher: TurnChangesFetcher, log: Log = console.error): TurnChangesStore {
  const memory = new Map<string, FileChange[]>();
  const inflight = new Map<string, Promise<FileChange[] | undefined>>();
  const listeners = new Set<() => void>();
  const remember = (ref: TurnRef, files: FileChange[]) => {
    memory.set(turnCacheId(ref), files);
    for (const fn of listeners) fn();
  };

  const fill = async (ref: TurnRef, worktree: string | null): Promise<FileChange[] | undefined> => {
    const stored = await readCachedTurnChanges(storage, ref, log);
    if (stored) {
      remember(ref, stored);
      return stored;
    }
    if (worktree === null) return undefined;
    const files = await fetcher(ref, worktree);
    await writeCachedTurnChanges(storage, ref, files, log);
    remember(ref, files);
    return files;
  };

  return {
    peek: (ref) => memory.get(turnCacheId(ref)),
    record(ref, files) {
      remember(ref, files);
      void writeCachedTurnChanges(storage, ref, files, log);
    },
    load(ref, worktree) {
      const id = turnCacheId(ref);
      const known = memory.get(id);
      if (known) return Promise.resolve(known);
      const pending = inflight.get(id);
      if (pending) return pending;
      const request = fill(ref, worktree).finally(() => inflight.delete(id));
      inflight.set(id, request);
      return request;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Our builds before the move kept entries in the webview's localStorage under this prefix. */
export const LEGACY_TURN_CACHE_PREFIX = "openconductor.turn-changes-cache:";

/** Remove those entries (a cache, so nothing is carried over); returns how many went. */
export function dropLegacyTurnCache(storage: Pick<Storage, "length" | "key" | "removeItem">): number {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(LEGACY_TURN_CACHE_PREFIX)) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
  return keys.length;
}

/** Under a finished turn: all files when there are at most 3, else the first 2 and a button. */
export const TURN_CHIPS_SHOWN = 3;
/** Each "+N more" click reveals this many. */
export const TURN_CHIPS_STEP = 3;

export interface ChipLayout {
  /** On the footer row: every file when there are at most 3, else the first 2. */
  first: FileChange[];
  /** Revealed by "+N more" clicks; they wrap onto their own line. */
  revealed: FileChange[];
  hidden: FileChange[];
  /** The "+N more" button's tooltip and aria-label ("Show 3 more changed files"), or null when every file is shown. */
  more: string | null;
  /** Lines added and removed in the hidden files. */
  hiddenTotals: { additions: number; deletions: number };
}

/** Which chips show after `expanded` clicks on "show more". */
export function chipLayout(files: FileChange[], expanded: number): ChipLayout {
  const firstCount = files.length <= TURN_CHIPS_SHOWN ? files.length : TURN_CHIPS_SHOWN - 1;
  const count = Math.min(files.length, firstCount + expanded * TURN_CHIPS_STEP);
  const first = files.slice(0, firstCount);
  const revealed = files.slice(firstCount, count);
  const hidden = files.slice(count);
  const next = Math.min(TURN_CHIPS_STEP, hidden.length);
  const hiddenTotals = hidden.reduce((t, f) => ({ additions: t.additions + f.additions, deletions: t.deletions + f.deletions }), { additions: 0, deletions: 0 });
  return { first, revealed, hidden, more: next === 0 ? null : `Show ${next} more changed ${next === 1 ? "file" : "files"}`, hiddenTotals };
}
