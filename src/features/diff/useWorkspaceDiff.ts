// parity:diff.changes-list:ui parity:diff.viewed:ui parity:diff.navigation:ui parity:diff.turn-changes:ui
// One workspace's diff state, shared by the changes list in the right panel
// and the "All changes" tab in the main area: the loaded files, view options,
// viewed marks, the selected file and the file waiting for discard. A chat
// turn can be selected instead of the scope option: then only what that turn
// changed is shown (its start versus end checkpoint); there only the context
// menu offers discard, against the "All changes" base (target.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keyedCache } from "../../lib/keyedCache.ts";
import { discardFileChanges, loadWorkspaceDiff, WHOLE_FILE_CONTEXT } from "./api.ts";
import { useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { nextUnread, step } from "./nav.ts";
import { changeRows } from "./changesTree.ts";
import { filterChangedFiles } from "./changesFilter.ts";
import { useChangesPresentation } from "./useChangesPresentation.ts";
import { discardScope, type DiffTarget, type DiscardSource } from "./target.ts";
import type { TurnRef } from "./turnChangesCache.ts";
import { newFileText } from "./copyFile.ts";
import { DEFAULT_VIEW_OPTIONS, type DiffScope, type DiffViewOptions, type FileDiff } from "./types.ts";
import { isViewed, loadViewed, pruneViewed, saveViewed, toggleViewed, viewedCount, type ViewedMap } from "./viewed.ts";

export type DiffLoad = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; files: FileDiff[] };

const OPTIONS_KEY = "openconductor.diff.options";

// The last list loaded per worktree, target, options and turn. A workspace the user
// comes back to shows it at once and reloads behind it; only a list never loaded shows
// "Loading changes…" (Conductor's `useFilesChanged`: isLoading only while no data).
const loaded = keyedCache<FileDiff[]>(64);
const loadKey = (worktree: string | null, target: DiffTarget, opts: DiffViewOptions, turn: TurnRef | null) =>
  JSON.stringify([worktree, target.branch, target.remote, opts, turn?.sessionId ?? null, turn?.turnId ?? null]);
const fromCache = (key: string): DiffLoad => {
  const files = loaded.get(key);
  return files ? { state: "ready", files } : { state: "loading" };
};

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
  /** The workspace's target branch (and remote) that "All changes" is compared against. */
  target: DiffTarget;
  /** Called with the loaded files and the scope they were loaded for. */
  onLoaded?: (files: FileDiff[], scope: DiffScope) => void;
  /** Called when a file is picked from the list or by keyboard (opens the diff tab). */
  onOpen?: () => void;
}

export function useWorkspaceDiff({ workspaceId, worktree, target: { branch, remote }, onLoaded, onOpen }: WorkspaceDiffArgs) {
  // Rebuilt from primitives so the effects below key on its value, not its identity.
  const target = useMemo<DiffTarget>(() => ({ branch, remote }), [branch, remote]);
  const [opts, setOpts] = useState<DiffViewOptions>(initialOptions);
  const [viewed, setViewedMap] = useState<ViewedMap>(() => loadViewed(localStorage, workspaceId));
  const { presentation } = useChangesPresentation(workspaceId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // The file waiting for the discard confirmation and the scope it will be restored from.
  const [pending, setPending] = useState<{ file: FileDiff; scope: DiffScope } | null>(null);
  // The selected chat turn; not saved, unlike `opts`.
  const [turn, setTurn] = useState<TurnRef | null>(null);

  const update = (patch: Partial<DiffViewOptions>) => {
    const next = { ...opts, ...patch };
    localStorage.setItem(OPTIONS_KEY, JSON.stringify({ ...next, scope: typeof next.scope === "object" ? "all" : next.scope }));
    setOpts(next);
    if (patch.scope) setTurn(null);
  };

  // The list belongs to the key it was loaded for. On a new key (another workspace,
  // scope or turn) the render shows that key's cached list, or "loading" when there is
  // none, in the same frame, never the previous key's list.
  const key = loadKey(worktree, target, opts, turn);
  const [state, setState] = useState<{ key: string; load: DiffLoad }>(() => ({ key, load: fromCache(key) }));
  const load = useMemo(() => (state.key === key ? state.load : fromCache(key)), [state, key]);
  const keyRef = useRef(key);
  keyRef.current = key;
  const loadNow = useCallback(
    (quiet: boolean) => {
      return loadWorkspaceDiff(worktree, target, opts, { turn }).then(
        (files) => {
          const previous = loaded.get(key);
          const next = previous && JSON.stringify(previous) === JSON.stringify(files) ? previous : files;
          loaded.set(key, next);
          if (keyRef.current === key) setState({ key, load: { state: "ready", files: next } });
        },
        (e: unknown) => {
          if (quiet) return;
          loaded.delete(key);
          if (keyRef.current === key) setState({ key, load: { state: "error", message: String(e) } });
        },
      );
    },
    [key, worktree, target, opts, turn],
  );
  // Loads again behind what is shown; a list never loaded shows "Loading changes…" meanwhile.
  const refresh = useCallback(() => { void loadNow(false); }, [loadNow]);
  useEffect(refresh, [refresh]);
  // After a save from the diff viewer: reload without the loading state, so the open editor stays mounted.
  const reloadQuietly = useCallback(() => { void loadNow(true); }, [loadNow]);
  useEffect(() => {
    if (!worktree || turn) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        void loadNow(true).finally(() => { if (!stopped) schedule(); });
      }, 2000);
    };
    schedule();
    return () => { stopped = true; clearTimeout(timer); };
  }, [worktree, turn, loadNow]);
  useEffect(() => {
    setViewedMap(loadViewed(localStorage, workspaceId));
    setSelectedPath(null);
    setTurn(null);
    setOpts((current) => typeof current.scope === "object" ? { ...current, scope: "all" } : current);
  }, [workspaceId]);

  const files = useMemo(() => (load.state === "ready" ? load.files : []), [load]);
  const navigationFiles = useMemo(() => changeRows(
    filterChangedFiles(files, presentation.filePathFilter), presentation.diffFileListMode, new Set(), (file) => isViewed(viewed, file),
  ).flatMap((row) => row.kind === "file" ? [row.file] : []), [files, viewed, presentation.filePathFilter, presentation.diffFileListMode]);
  const [uncommitted, setUncommitted] = useState<{ worktree: string | null; paths: Set<string> }>({ worktree: null, paths: new Set() });
  useEffect(() => {
    if (load.state !== "ready") return;
    if (!turn && opts.scope === "uncommitted") {
      setUncommitted({ worktree, paths: new Set(load.files.map((f) => f.path)) });
      return;
    }
    let active = true;
    loadWorkspaceDiff(worktree, target, { ...opts, scope: "uncommitted", layout: "unified" }, { contextLines: 0 }).then(
      (changed) => { if (active) setUncommitted({ worktree, paths: new Set(changed.map((f) => f.path)) }); },
      () => { if (active) setUncommitted({ worktree, paths: new Set() }); },
    );
    return () => { active = false; };
  }, [load, worktree, target, opts, turn]);
  const uncommittedPaths = uncommitted.worktree === worktree ? uncommitted.paths : new Set<string>();
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
  const stepFile = (path: string | null, direction: 1 | -1) => {
    const index = navigationFiles.findIndex((file) => file.path === path);
    if (index < 0) return;
    openPath(navigationFiles[step(index, navigationFiles.length, direction)].path);
  };
  /** Switch to one turn's changes and open `path` there (a file chip under the turn). */
  const openTurnFile = (ref: TurnRef, path: string) => {
    if (turn?.sessionId !== ref.sessionId || turn?.turnId !== ref.turnId) setTurn(ref);
    setSelectedPath(path);
    onOpen?.();
  };

  const toggleFileViewed = (file: FileDiff) => {
    const index = files.findIndex((f) => f.path === file.path);
    if (index < 0) return;
    const selectedFile = files[index];
    const wasViewed = isViewed(viewed, selectedFile);
    setViewed(toggleViewed(viewed, selectedFile));
    if (wasViewed) return;
    const navigationIndex = navigationFiles.findIndex((f) => f.path === selectedFile.path);
    const unviewed = navigationFiles.filter((f) => !isViewed(viewed, f));
    const laterUnviewed = navigationFiles.slice(navigationIndex + 1).some((f) => !isViewed(viewed, f));
    stepFile(selectedFile.path, !laterUnviewed && unviewed.length > 1 ? -1 : 1);
  };

  // Keys come from the registry (diff.nextFile = ArrowDown, diff.previousFile = ArrowUp,
  // diff.toggleViewed = Ctrl+V), so user overrides apply and bare arrows stay out of text fields.
  useKeybindings({
    "diff.nextFile": () => stepFile(selectedPath, 1),
    "diff.previousFile": () => stepFile(selectedPath, -1),
    "diff.toggleViewed": () => current >= 0 && toggleFileViewed(files[current]),
  });

  // The file alone with whole-file context: Pierre builds the full old and new
  // files from it when an "N unmodified lines" row is expanded.
  const loadFull = (f: FileDiff) =>
    loadWorkspaceDiff(worktree, target, opts, { path: f.path, contextLines: WHOLE_FILE_CONTEXT, turn }).then(([full]) => {
      if (!full) throw new Error(`${f.path} has no changes any more.`);
      return full;
    });
  // The whole file as it is now, for the header's copy button: never the -w
  // diff, whose context lines are not the file's text.
  const loadText = (f: FileDiff) =>
    loadWorkspaceDiff(worktree, target, { ...opts, ignoreWhitespace: false }, { path: f.path, contextLines: WHOLE_FILE_CONTEXT, turn }).then(([full]) => {
      if (!full) throw new Error(`${f.path} has no changes any more.`);
      return newFileText(full);
    });

  // parity:diff.discard:ui
  // Revert icons (list row, file header) use the view's scope and are hidden in
  // the per-turn view; the context menu always uses "All changes" (target.ts).
  const canDiscard = discardScope("view", opts.scope, turn !== null) !== null;
  /** Ask to discard `f` (null closes the dialog); `from` decides the base it is restored from. */
  const askDiscard = (f: FileDiff | null, from: DiscardSource = "view") => {
    const scope = f && discardScope(from, opts.scope, turn !== null);
    setPending(f && scope ? { file: f, scope } : null);
  };
  const discard = (f: FileDiff) => {
    const scope = pending?.file.path === f.path ? pending.scope : discardScope("view", opts.scope, turn !== null);
    if (!scope) return Promise.reject(new Error("Discard is not available in the turn view."));
    return discardFileChanges(worktree, target, scope, f).then(refresh);
  };

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
    target,
    totals,
    uncommittedPaths,
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
    toggleViewed: toggleFileViewed,
    viewedCount: viewedCount(viewed, files),
    /** Next file not marked viewed after the selected one, or -1. */
    unread,
    loadFull,
    loadText,
    /** The file waiting for the discard confirmation. */
    discarding: pending?.file ?? null,
    askDiscard,
    discard,
    canDiscard,
  };
}

export type WorkspaceDiff = ReturnType<typeof useWorkspaceDiff>;
