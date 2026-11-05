// parity:diff.turn-changes:data
// What one chat turn changed (the files between its start and end checkpoints),
// kept per turn so the chips under a finished turn don't re-run git.
//
// As in Conductor (evidence/diff/turn-changes.md): entries are keyed by the
// JSON array [sessionId, turnId], hold only the file list, are skipped above
// 5 MB, and storage errors are logged, never thrown. Requests for the same
// turn share one in-flight load. Only finished turns are loaded: a running
// turn has no end checkpoint yet.
// Pure (storage and fetcher are injected) so turnChangesCache.test.ts covers it.

import type { FileChange, FileStatus } from "./types.ts";

export interface TurnRef {
  /** The parts of the turn's checkpoint ids (`turnCheckpointRef` in features/chat/checkpoints.ts). */
  sessionId: string;
  turnId: string;
}

export const TURN_CHANGES_CACHE = "openconductor.turn-changes-cache";
/** Largest entry written, in UTF-16 code units of its JSON. */
export const TURN_CHANGES_ENTRY_LIMIT = 5 * 1024 * 1024;

export const turnCacheKey = (ref: TurnRef) => `${TURN_CHANGES_CACHE}:${JSON.stringify([ref.sessionId, ref.turnId])}`;

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

/** The cached list, or undefined when there is none or it does not parse. */
export function readCachedTurnChanges(storage: Pick<Storage, "getItem">, ref: TurnRef, log: Log = console.error): FileChange[] | undefined {
  try {
    const raw = storage.getItem(turnCacheKey(ref));
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every(isFileChange) ? value : undefined;
  } catch (e) {
    log("Failed to read turn changes from local storage", e);
    return undefined;
  }
}

/** Store the list; false when it was too large or storage refused it. */
export function writeCachedTurnChanges(storage: Pick<Storage, "setItem">, ref: TurnRef, files: FileChange[], log: Log = console.error): boolean {
  const raw = JSON.stringify(files);
  if (raw.length > TURN_CHANGES_ENTRY_LIMIT) return false;
  try {
    storage.setItem(turnCacheKey(ref), raw);
    return true;
  } catch (e) {
    log("Failed to write turn changes to local storage", e);
    return false;
  }
}

export type TurnChangesFetcher = (ref: TurnRef, worktree: string) => Promise<FileChange[]>;

export interface TurnChangesStore {
  /** Known list for a turn (memory, then storage), without loading. */
  peek(ref: TurnRef): FileChange[] | undefined;
  /** A list the backend sent with the turn's end (`reason_prompt`'s `turnChanges`). */
  record(ref: TurnRef, files: FileChange[]): void;
  /** Cached list, or load it once (concurrent calls share the request). */
  load(ref: TurnRef, worktree: string): Promise<FileChange[]>;
  /** Called whenever a list is recorded or loaded. */
  subscribe(fn: () => void): () => void;
}

export function createTurnChangesStore(storage: Pick<Storage, "getItem" | "setItem">, fetcher: TurnChangesFetcher, log: Log = console.error): TurnChangesStore {
  const memory = new Map<string, FileChange[]>();
  const inflight = new Map<string, Promise<FileChange[]>>();
  const listeners = new Set<() => void>();
  const remember = (ref: TurnRef, files: FileChange[]) => {
    memory.set(turnCacheKey(ref), files);
    for (const fn of listeners) fn();
  };

  const peek = (ref: TurnRef) => {
    const key = turnCacheKey(ref);
    const hit = memory.get(key) ?? readCachedTurnChanges(storage, ref, log);
    if (hit) memory.set(key, hit);
    return hit;
  };

  return {
    peek,
    record(ref, files) {
      writeCachedTurnChanges(storage, ref, files, log);
      remember(ref, files);
    },
    load(ref, worktree) {
      const cached = peek(ref);
      if (cached) return Promise.resolve(cached);
      const key = turnCacheKey(ref);
      const pending = inflight.get(key);
      if (pending) return pending;
      const request = fetcher(ref, worktree).then(
        (files) => {
          inflight.delete(key);
          writeCachedTurnChanges(storage, ref, files, log);
          remember(ref, files);
          return files;
        },
        (e: unknown) => {
          inflight.delete(key);
          throw e;
        },
      );
      inflight.set(key, request);
      return request;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Under a finished turn: all files when there are at most 3, else the first 2 and a button. */
export const TURN_CHIPS_SHOWN = 3;
/** Each "Show N more changed files" click reveals this many. */
export const TURN_CHIPS_STEP = 3;

export interface ChipLayout {
  shown: FileChange[];
  hidden: FileChange[];
  /** Label of the "show more" button, or null when every file is shown. */
  more: string | null;
  /** Lines added and removed in the hidden files. */
  hiddenTotals: { additions: number; deletions: number };
}

/** Which chips show after `expanded` clicks on "show more". */
export function chipLayout(files: FileChange[], expanded: number): ChipLayout {
  const first = files.length <= TURN_CHIPS_SHOWN ? files.length : TURN_CHIPS_SHOWN - 1;
  const count = Math.min(files.length, first + expanded * TURN_CHIPS_STEP);
  const shown = files.slice(0, count);
  const hidden = files.slice(count);
  const next = Math.min(TURN_CHIPS_STEP, hidden.length);
  const hiddenTotals = hidden.reduce((t, f) => ({ additions: t.additions + f.additions, deletions: t.deletions + f.deletions }), { additions: 0, deletions: 0 });
  return { shown, hidden, more: next === 0 ? null : `Show ${next} more changed ${next === 1 ? "file" : "files"}`, hiddenTotals };
}
