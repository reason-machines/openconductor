// parity:diff.turn-changes:ui
// The app-wide turn-changes store (localStorage-backed, see turnChangesCache.ts)
// and a hook that reads one finished turn's changed files from it.
import { useEffect, useState } from "react";
import { inTauri } from "../../backend";
import { loadTurnChanges } from "./api.ts";
import { createTurnChangesStore, turnCacheKey, type TurnRef } from "./turnChangesCache.ts";
import type { FileChange } from "./types.ts";

export const turnChanges = createTurnChangesStore(localStorage, loadTurnChanges);

/** Files the turn changed; undefined while loading or when it has no checkpoints. */
export function useTurnChanges(turn: TurnRef, worktree: string | null): FileChange[] | undefined {
  const key = turnCacheKey(turn);
  const [files, setFiles] = useState(() => turnChanges.peek(turn));
  useEffect(() => {
    let live = true;
    const sync = () => live && setFiles(turnChanges.peek(turn));
    const off = turnChanges.subscribe(sync);
    sync();
    // A turn from before checkpoints existed, or one whose checkpoint was
    // skipped, has no changes view: the error just leaves it empty.
    // The browser preview has no worktree and answers with sample data.
    if (!turnChanges.peek(turn) && (worktree || !inTauri())) turnChanges.load(turn, worktree ?? "").catch(() => undefined);
    return () => {
      live = false;
      off();
    };
  }, [key, worktree]); // `key` stands for `turn`, whose object identity changes every render.
  return files;
}
