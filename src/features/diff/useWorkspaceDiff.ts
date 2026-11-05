// parity:diff.changes-list:ui parity:diff.viewed:ui parity:diff.navigation:ui
// One workspace's diff state, shared by the changes list in the right panel
// and the "All changes" tab in the main area: the loaded files, view options,
// viewed marks, the selected file and the file waiting for discard.
import { useCallback, useEffect, useMemo, useState } from "react";
import { discardFileChanges, loadWorkspaceDiff, WHOLE_FILE_CONTEXT } from "./api.ts";
import { useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { nextUnread, step } from "./nav.ts";
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
  // Files whose unmodified lines were expanded: reloaded alone with full context.
  const [expanded, setExpanded] = useState<Record<string, FileDiff>>({});
  const [discarding, setDiscarding] = useState<FileDiff | null>(null);

  const update = (patch: Partial<DiffViewOptions>) => {
    const next = { ...opts, ...patch };
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    setOpts(next);
  };

  const refresh = useCallback(() => {
    setLoad({ state: "loading" });
    setExpanded({});
    loadWorkspaceDiff(worktree, baseBranch, opts).then(
      (files) => setLoad({ state: "ready", files }),
      (e: unknown) => setLoad({ state: "error", message: String(e) }),
    );
  }, [worktree, baseBranch, opts]);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    setViewedMap(loadViewed(localStorage, workspaceId));
    setSelectedPath(null);
  }, [workspaceId]);

  const files = useMemo(() => (load.state === "ready" ? load.files : []), [load]);
  const current = selectedPath === null ? -1 : files.findIndex((f) => f.path === selectedPath);
  const selected = current >= 0 ? (expanded[files[current].path] ?? files[current]) : null;

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

  // Keys come from the registry (diff.nextFile = ArrowDown, diff.previousFile = ArrowUp,
  // diff.toggleViewed = Ctrl+V), so user overrides apply and bare arrows stay out of text fields.
  useKeybindings({
    "diff.nextFile": () => open(step(current, files.length, 1)),
    "diff.previousFile": () => open(step(current, files.length, -1)),
    "diff.toggleViewed": () => current >= 0 && setViewed(toggleViewed(viewed, files[current])),
  });

  const expand = (f: FileDiff) =>
    loadWorkspaceDiff(worktree, baseBranch, opts, { path: f.path, contextLines: WHOLE_FILE_CONTEXT }).then(
      ([full]) => full && setExpanded((m) => ({ ...m, [f.path]: full })),
      () => undefined,
    );

  const discard = (f: FileDiff) => discardFileChanges(worktree, baseBranch, opts, f).then(refresh);

  const unread = nextUnread(current, files.length, (i) => isViewed(viewed, files[i]));
  const totals = files.reduce((t, f) => ({ a: t.a + f.additions, d: t.d + f.deletions }), { a: 0, d: 0 });

  return {
    opts,
    update,
    load,
    files,
    refresh,
    totals,
    /** Index of the selected file in `files`, or -1. */
    current,
    /** The selected file, with full context when its unmodified lines were expanded. */
    selected,
    isExpanded: (f: FileDiff) => f.path in expanded,
    open,
    openPath,
    isViewed: (f: FileDiff) => isViewed(viewed, f),
    toggleViewed: (f: FileDiff) => setViewed(toggleViewed(viewed, f)),
    viewedCount: viewedCount(viewed, files),
    /** Next file not marked viewed after the selected one, or -1. */
    unread,
    expand,
    discarding,
    askDiscard: setDiscarding,
    discard,
  };
}

export type WorkspaceDiff = ReturnType<typeof useWorkspaceDiff>;
