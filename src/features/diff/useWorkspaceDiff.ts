// parity:diff.changes-list:ui parity:diff.viewed:ui parity:diff.navigation:ui parity:diff.turn-changes:ui
// One workspace's diff state, shared by the changes list in the right panel
// and the "All changes" tab in the main area: the loaded files, view options,
// viewed marks, the selected file and the file waiting for discard. A chat
// turn can be selected instead of the scope option: then only what that turn
// changed is shown (its start versus end checkpoint), and discard is off.
import { useCallback, useEffect, useMemo, useState } from "react";
import { discardFileChanges, loadWorkspaceDiff, WHOLE_FILE_CONTEXT } from "./api.ts";
import { useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { nextUnread, step } from "./nav.ts";
import type { TurnRef } from "./turnChangesCache.ts";
import { DEFAULT_VIEW_OPTIONS, type DiffScope, type DiffViewOptions, type FileDiff } from "./types.ts";
import { isViewed, loadViewed, pruneViewed, saveViewed, toggleViewed, viewedCount, type ViewedMap } from "./viewed.ts";

export type DiffLoad = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; files: FileDiff[] };

const OPTIONS_KEY = "openconductor.diff.options";

function initialOptions(): DiffViewOptions {
  try {
    return { ...DEFAULT_VIEW_OPTIONS, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_VIEW_OPTIONS;
  }
}

export interface WorkspaceDiffArgs {
  workspaceId: string;
  /** Worktree folder; null while the workspace has none on disk. */
  worktree: string | null;
  /** Branch the workspace is compared against for "All changes". */
  baseBranch: string;
  /** Called with the loaded files and the scope they were loaded for. */
  onLoaded?: (files: FileDiff[], scope: DiffScope) => void;
  /** Called when a file is picked from the list or by keyboard (opens the diff tab). */
  onOpen?: () => void;
}

export function useWorkspaceDiff({ workspaceId, worktree, baseBranch, onLoaded, onOpen }: WorkspaceDiffArgs) {
  const [opts, setOpts] = useState<DiffViewOptions>(initialOptions);
  const [load, setLoad] = useState<DiffLoad>({ state: "loading" });
  const [viewed, setViewedMap] = useState<ViewedMap>(() => loadViewed(localStorage, workspaceId));
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<FileDiff | null>(null);
  // The selected chat turn; not saved, unlike `opts`.
  const [turn, setTurn] = useState<TurnRef | null>(null);

  const update = (patch: Partial<DiffViewOptions>) => {
    const next = { ...opts, ...patch };
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    setOpts(next);
    if (patch.scope) setTurn(null);
  };

  const refresh = useCallback(() => {
    setLoad({ state: "loading" });
    loadWorkspaceDiff(worktree, baseBranch, opts, { turn }).then(
      (files) => setLoad({ state: "ready", files }),
      (e: unknown) => setLoad({ state: "error", message: String(e) }),
    );
  }, [worktree, baseBranch, opts, turn]);

  useEffect(refresh, [refresh]);
  // After a save from the diff viewer: reload without the loading state, so the open editor stays mounted.
  const reloadQuietly = useCallback(() => {
    loadWorkspaceDiff(worktree, baseBranch, opts, { turn }).then(
      (files) => setLoad({ state: "ready", files }),
      () => {},
    );
  }, [worktree, baseBranch, opts, turn]);
  useEffect(() => {
    setViewedMap(loadViewed(localStorage, workspaceId));
    setSelectedPath(null);
    setTurn(null);
  }, [workspaceId]);

  const files = useMemo(() => (load.state === "ready" ? load.files : []), [load]);
  const current = selectedPath === null ? -1 : files.findIndex((f) => f.path === selectedPath);
  const selected = current >= 0 ? files[current] : null;

  useEffect(() => {
    if (load.state === "ready") onLoaded?.(load.files, opts.scope);
  }, [load, opts.scope, onLoaded]);

  const setViewed = (map: ViewedMap) => {
    const pruned = pruneViewed(map, files);
    saveViewed(localStorage, workspaceId, pruned);
    setViewedMap(pruned);
  };

  const open = useCallback(
    (i: number) => {
      if (i < 0 || i >= files.length) return;
      setSelectedPath(files[i].path);
      onOpen?.();
    },
    [files, onOpen],
  );
  const openPath = (path: string) => open(files.findIndex((f) => f.path === path));
  /** Switch to one turn's changes and open `path` there (a file chip under the turn). */
  const openTurnFile = (ref: TurnRef, path: string) => {
    if (turn?.sessionId !== ref.sessionId || turn?.turnId !== ref.turnId) setTurn(ref);
    setSelectedPath(path);
    onOpen?.();
  };

  // Keys come from the registry (diff.nextFile = ArrowDown, diff.previousFile = ArrowUp,
  // diff.toggleViewed = Ctrl+V), so user overrides apply and bare arrows stay out of text fields.
  useKeybindings({
    "diff.nextFile": () => open(step(current, files.length, 1)),
    "diff.previousFile": () => open(step(current, files.length, -1)),
    "diff.toggleViewed": () => current >= 0 && setViewed(toggleViewed(viewed, files[current])),
  });

  // The file alone with whole-file context: Pierre builds the full old and new
  // files from it when an "N unmodified lines" row is expanded.
  const loadFull = (f: FileDiff) =>
    loadWorkspaceDiff(worktree, baseBranch, opts, { path: f.path, contextLines: WHOLE_FILE_CONTEXT, turn }).then(([full]) => {
      if (!full) throw new Error(`${f.path} has no changes any more.`);
      return full;
    });

  const discard = (f: FileDiff) => discardFileChanges(worktree, baseBranch, opts, f).then(refresh);
  // Conductor has no discard in the per-turn view either.
  const canDiscard = turn === null;

  const unread = nextUnread(current, files.length, (i) => isViewed(viewed, files[i]));
  const totals = files.reduce((t, f) => ({ a: t.a + f.additions, d: t.d + f.deletions }), { a: 0, d: 0 });

  return {
    opts,
    update,
    load,
    files,
    refresh,
    reloadQuietly,
    /** Worktree folder the diff is read from (null while the workspace has none). */
    worktree,
    totals,
    /** Index of the selected file in `files`, or -1. */
    current,
    /** The selected file. */
    selected,
    open,
    openPath,
    /** The chat turn whose changes are shown, or null for `opts.scope`. */
    turn,
    openTurnFile,
    /** Back to `opts.scope`. */
    clearTurn: () => setTurn(null),
    isViewed: (f: FileDiff) => isViewed(viewed, f),
    toggleViewed: (f: FileDiff) => setViewed(toggleViewed(viewed, f)),
    viewedCount: viewedCount(viewed, files),
    /** Next file not marked viewed after the selected one, or -1. */
    unread,
    loadFull,
    discarding,
    askDiscard: setDiscarding,
    discard,
    canDiscard,
  };
}

export type WorkspaceDiff = ReturnType<typeof useWorkspaceDiff>;
