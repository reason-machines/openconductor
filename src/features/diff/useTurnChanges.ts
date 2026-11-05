// parity:diff.turn-changes:ui
// The app-wide turn-changes store, kept in the `turn-changes-cache`
// local-storage subsystem (see turnChangesCache.ts), and a hook that reads
// one finished turn's changed files from it.
import { useEffect, useState } from "react";
import { inTauri } from "../../backend";
import { subsystemEntries } from "../terminal/localStorage.ts";
import { loadTurnChanges } from "./api.ts";
import { createTurnChangesStore, dropLegacyTurnCache, turnCacheId, TURN_CHANGES_SIZE_LIMIT, TURN_CHANGES_SUBSYSTEM, type TurnRef } from "./turnChangesCache.ts";
import type { FileChange } from "./types.ts";

export const turnChanges = createTurnChangesStore(subsystemEntries(TURN_CHANGES_SUBSYSTEM, TURN_CHANGES_SIZE_LIMIT), loadTurnChanges);

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
