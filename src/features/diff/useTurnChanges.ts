// parity:diff.turn-changes:ui
// The app-wide turn-changes store, kept in the `turn-changes-cache`
// local-storage subsystem (see turnChangesCache.ts), and a hook that reads
// one finished turn's changed files from it.
import { useEffect, useState } from "react";
import { inTauri } from "../../backend";
import { localStorageClient, TURN_CHANGES_CACHE } from "../../lib/local-storage/index.ts";
import { loadTurnChanges } from "./api.ts";
import { createTurnChangesStore, dropLegacyTurnCache, turnCacheId, type TurnChangesStorage, type TurnRef } from "./turnChangesCache.ts";
import type { FileChange } from "./types.ts";

const { name: subsystem, sizeLimit } = TURN_CHANGES_CACHE;

/** Conductor's cacheTurnChanges writes with entryStorage "subsystemStore", the only kind our store has. */
const storage: TurnChangesStorage = {
  getEntry: (id) => localStorageClient().getEntry({ subsystem, id }),
  async setEntry(id, value) {
    const r = await localStorageClient().setEntry({ subsystem, sizeLimit, id, content: value });
    if (!r.success) throw new Error(`Failed to persist local storage entry ${subsystem}:${id}: ${r.reason}`);
  },
};

export const turnChanges = createTurnChangesStore(storage, loadTurnChanges);

// Earlier builds cached turns in the webview's localStorage; free that space once.
try {
  dropLegacyTurnCache(localStorage);
} catch (e) {
  console.error("Failed to clear the old turn changes cache", e);
}

/** Files the turn changed; undefined while loading or when it has no checkpoints. */
export function useTurnChanges(turn: TurnRef, worktree: string | null): FileChange[] | undefined {
  const key = turnCacheId(turn);
  const [files, setFiles] = useState(() => turnChanges.peek(turn));
  useEffect(() => {
    let live = true;
    const sync = () => live && setFiles(turnChanges.peek(turn));
    const off = turnChanges.subscribe(sync);
    sync();
    // Without a worktree only the cache is read. A turn from before
    // checkpoints existed, or one whose checkpoint was skipped, has no
    // changes view: the error just leaves it empty. The browser preview has
    // no worktree and answers with sample data.
    if (!turnChanges.peek(turn)) turnChanges.load(turn, worktree ?? (inTauri() ? null : "")).catch(() => undefined);
    return () => {
      live = false;
      off();
    };
  }, [key, worktree]); // `key` stands for `turn`, whose object identity changes every render.
  return files;
}
