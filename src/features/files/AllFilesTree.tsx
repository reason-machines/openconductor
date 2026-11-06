// The right panel's All files tab (Conductor's tab strip: All files, Changes,
// Checks). Conductor opens a picked file in an in-app editor; OpenConductor
// has no in-app file viewer, so a file opens through Open in: the default app
// from the workspace header's Open button (Finder reveals it, a terminal opens
// its folder; src-tauri/src/open_in).
//
// The tab's toolbar (collapse all folders, filter, new file) sits in the
// panel's tab row; `useFilesToolbar` carries its clicks to the tree.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fuzzyFilterFiles, inTauri } from "../../backend";
import { FileGlyph } from "../chat/ToolRows";
import { recordOpenIn, useAppPrefs } from "../../settings/appPrefs";
import { defaultAppId, loadOpenInApps, openInApp, type OpenInApp } from "../openIn/apps";
import { absolutePath, allDirs, ancestors, buildTree, filterPaths, newFilePath, visibleRows, type TreeRow } from "./tree";
import { ChevronDownIcon, ChevronRightIcon, CollapseAllIcon, FilePlusIcon, FolderClosedIcon, FolderOpenIcon, SearchIcon } from "./panelIcons";
import "./allFiles.css";

type Notify = (kind: "info" | "error", message: string) => void;

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; paths: string[] };

export interface FilesToolbarState {
  filterOpen: boolean;
  /** Bumped by "Collapse folders". */
  collapseSeq: number;
  /** Bumped by "New file". */
  newFileSeq: number;
}

export interface FilesToolbar {
  state: FilesToolbarState;
  toggleFilter: () => void;
  closeFilter: () => void;
  collapse: () => void;
  newFile: () => void;
}

export function useFilesToolbar(): FilesToolbar {
  const [filterOpen, setFilterOpen] = useState(false);
  const [collapseSeq, setCollapseSeq] = useState(0);
  const [newFileSeq, setNewFileSeq] = useState(0);
  return {
    state: { filterOpen, collapseSeq, newFileSeq },
    toggleFilter: () => setFilterOpen((v) => !v),
    closeFilter: () => setFilterOpen(false),
    collapse: () => setCollapseSeq((n) => n + 1),
    newFile: () => setNewFileSeq((n) => n + 1),
  };
}

/** The All files tab's icons at the right end of the panel's tab row. */
export function FilesToolbarButtons({ toolbar }: { toolbar: FilesToolbar }) {
  return (
    <>
      <button type="button" className="rp-icon" aria-label="Collapse folders" title="Collapse folders" onClick={toolbar.collapse}>
        <CollapseAllIcon />
      </button>
      <button type="button" className={`rp-icon${toolbar.state.filterOpen ? " on" : ""}`} aria-label="Filter files" title="Filter files" aria-pressed={toolbar.state.filterOpen} onClick={toolbar.toggleFilter}>
        <SearchIcon />
      </button>
      <button type="button" className="rp-icon" aria-label="New file" title="New file" onClick={toolbar.newFile}>
        <FilePlusIcon />
      </button>
    </>
  );
}

/** Creates an empty file in the worktree through the diff viewer's save command (`diff_write_file`). */
async function createFile(worktree: string, path: string): Promise<void> {
  if (!inTauri()) throw new Error("Creating files needs the desktop app");
  await invoke("diff_write_file", { repo: worktree, request: { path, contents: "" } });
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function AllFilesTree({ worktree, notify, toolbar }: { worktree: string | null; notify?: Notify; toolbar: FilesToolbar }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [reloadSeq, setReloadSeq] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /** The folder last opened: where "New file" puts the file ("" is the root). */
  const [lastDir, setLastDir] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<{ folder: string; name: string; error: string | null } | null>(null);
  const [apps, setApps] = useState<OpenInApp[]>([]);
  const saved = useAppPrefs().default_open_in;
  const app = apps.find((a) => a.id === defaultAppId(apps, saved));
  const { filterOpen, collapseSeq, newFileSeq } = toolbar.state;

  useEffect(() => {
    let live = true;
    loadOpenInApps().then(
      (a) => live && setApps(a),
      () => live && setApps([]),
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!worktree) return;
    let live = true;
    setLoad((l) => (l.state === "ready" && reloadSeq > 0 ? l : { state: "loading" }));
    fuzzyFilterFiles(worktree, "", true).then(
      (m) => live && setLoad({ state: "ready", paths: m.map((x) => x.relative_path) }),
      (err) => live && setLoad({ state: "error", message: errorText(err) }),
    );
    return () => {
      live = false;
    };
  }, [worktree, reloadSeq]);

  // Toolbar: collapse every folder; a new file starts in the folder last opened.
  useEffect(() => {
    if (collapseSeq === 0) return;
    setExpanded(new Set());
    setLastDir("");
  }, [collapseSeq]);
  useEffect(() => {
    if (newFileSeq === 0) return;
    const folder = lastDir && expanded.has(lastDir) ? lastDir : "";
    setCreating({ folder, name: "", error: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newFileSeq]);
  useEffect(() => {
    if (!filterOpen) setQuery("");
  }, [filterOpen]);

  const paths = load.state === "ready" ? load.paths : null;
  const filtering = filterOpen && query.trim() !== "";
  const tree = useMemo(() => (paths ? buildTree(filtering ? filterPaths(paths, query) : paths) : null), [paths, filtering, query]);
  const rows = useMemo(() => (tree ? visibleRows(tree, filtering ? allDirs(tree) : expanded) : []), [tree, filtering, expanded]);

  const toggle = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else {
      next.add(path);
      setLastDir(path);
    }
    setExpanded(next);
  };

  const open = async (rel: string) => {
    if (!worktree || !app) return notify?.("error", "No app to open files in");
    void recordOpenIn(app.id, false).catch((err) => console.warn("could not save the default app", err));
    try {
      await openInApp(app.id, absolutePath(worktree, rel));
    } catch (err) {
      notify?.("error", `Failed to open in ${app.name}: ${errorText(err)}`);
    }
  };

  const submitNewFile = async () => {
    if (!creating || !worktree || !paths) return;
    const target = newFilePath(creating.folder, creating.name, paths);
    if ("error" in target) return setCreating({ ...creating, error: target.error });
    try {
      await createFile(worktree, target.path);
    } catch (err) {
      return setCreating({ ...creating, error: errorText(err) });
    }
    setCreating(null);
    setExpanded((prev) => new Set([...prev, ...ancestors(target.path)]));
    setLoad({ state: "ready", paths: [...paths, target.path] });
    setReloadSeq((n) => n + 1);
    void open(target.path);
  };

  const filterRow = filterOpen && (
    <div className="oc-files-filter">
      <SearchIcon size={13} />
      <input
        autoFocus
        aria-label="Filter files"
        placeholder="Filter files..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && toolbar.closeFilter()}
      />
    </div>
  );

  if (!worktree || (load.state === "ready" && load.paths.length === 0 && !creating)) {
    return <div className="placeholder small">No files available</div>;
  }
  if (load.state === "loading") return <div className="placeholder small">Loading files...</div>;
  if (load.state === "error") {
    return (
      <div className="placeholder small">
        <p className="error">Couldn't load files.</p>
        <p className="muted">{load.message}</p>
      </div>
    );
  }

  const newFileRow = (depth: number) =>
    creating && (
      <div key="new-file" className="oc-files-new" style={{ paddingLeft: 8 + depth * 20 }}>
        <span className="oc-files-icon">
          <FileGlyph path={creating.name || "new"} />
        </span>
        <input
          autoFocus
          aria-label="New file name"
          placeholder="File name"
          value={creating.name}
          aria-invalid={creating.error ? true : undefined}
          onChange={(e) => setCreating({ ...creating, name: e.target.value, error: null })}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitNewFile();
            if (e.key === "Escape") setCreating(null);
          }}
          onBlur={() => !creating.name.trim() && setCreating(null)}
        />
        {creating.error && (
          <span className="oc-files-new-error" role="alert">
            {creating.error}
          </span>
        )}
      </div>
    );

  const renderRow = (r: TreeRow) =>
    r.kind === "dir" ? (
      <button
        key={`d:${r.path}`}
        type="button"
        role="treeitem"
        aria-expanded={r.expanded}
        className="oc-files-row dir"
        style={{ paddingLeft: 8 + r.depth * 20 }}
        onClick={() => toggle(r.path)}
        title={r.path}
      >
        <span className="oc-files-icon">
          <span className="oc-files-folder">{r.expanded ? <FolderOpenIcon /> : <FolderClosedIcon />}</span>
          <span className="oc-files-chevron">{r.expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
        </span>
        <span className="name">{r.name}</span>
      </button>
    ) : (
      <button
        key={`f:${r.path}`}
        type="button"
        role="treeitem"
        className="oc-files-row file"
        style={{ paddingLeft: 8 + r.depth * 20 }}
        onClick={() => void open(r.path)}
        title={app ? `Open ${r.path} in ${app.name}` : r.path}
      >
        <span className="oc-files-icon">
          <FileGlyph path={r.name} />
        </span>
        <span className="name">{r.name}</span>
      </button>
    );

  // The name field goes right under the folder it creates in (the top for the root).
  const body: ReactNode[] = [];
  if (creating && creating.folder === "") body.push(newFileRow(0));
  for (const r of rows) {
    body.push(renderRow(r));
    if (creating && r.kind === "dir" && r.path === creating.folder && r.expanded) body.push(newFileRow(r.depth + 1));
  }

  return (
    <div className="oc-files-wrap">
      {filterRow}
      {filtering && rows.length === 0 ? (
        <div className="placeholder small">No files match this filter</div>
      ) : (
        <div className="oc-files" role="tree" aria-label="All files">
          {body}
        </div>
      )}
    </div>
  );
}
