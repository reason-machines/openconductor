// The right panel's All files tab (Conductor's tab strip: All files, Changes,
// Checks). Conductor opens a picked file in an in-app editor; OpenConductor
// has no in-app file viewer, so a file opens through Open in: the default app
// from the workspace header's Open button (Finder reveals it, a terminal opens
// its folder; src-tauri/src/open_in).
import { useEffect, useMemo, useState } from "react";
import { fuzzyFilterFiles } from "../../backend";
import { ChevronDownIcon, FileIcon, FolderIcon } from "../../components/Icons";
import { recordOpenIn, useAppPrefs } from "../../settings/appPrefs";
import { defaultAppId, loadOpenInApps, openInApp, type OpenInApp } from "../openIn/apps";
import { absolutePath, buildTree, visibleRows } from "./tree";
import "./allFiles.css";

type Notify = (kind: "info" | "error", message: string) => void;

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; paths: string[] };

export function AllFilesTree({ worktree, notify }: { worktree: string | null; notify?: Notify }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [apps, setApps] = useState<OpenInApp[]>([]);
  const saved = useAppPrefs().default_open_in;
  const app = apps.find((a) => a.id === defaultAppId(apps, saved));

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
    setLoad({ state: "loading" });
    fuzzyFilterFiles(worktree, "", true).then(
      (m) => live && setLoad({ state: "ready", paths: m.map((x) => x.relative_path) }),
      (err) => live && setLoad({ state: "error", message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      live = false;
    };
  }, [worktree]);

  const tree = useMemo(() => (load.state === "ready" ? buildTree(load.paths) : null), [load]);
  const rows = useMemo(() => (tree ? visibleRows(tree, expanded) : []), [tree, expanded]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const open = async (rel: string) => {
    if (!worktree || !app) return notify?.("error", "No app to open files in");
    void recordOpenIn(app.id, false).catch((err) => console.warn("could not save the default app", err));
    try {
      await openInApp(app.id, absolutePath(worktree, rel));
    } catch (err) {
      notify?.("error", `Failed to open in ${app.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (!worktree || (load.state === "ready" && load.paths.length === 0)) {
    return <div className="placeholder small">No files available</div>;
  }
  if (load.state === "loading") return <div className="placeholder small">Loading files…</div>;
  if (load.state === "error") {
    return (
      <div className="placeholder small">
        <p className="error">Couldn't load files.</p>
        <p className="muted">{load.message}</p>
      </div>
    );
  }
  return (
    <div className="oc-files" role="tree" aria-label="All files">
      {rows.map((r) =>
        r.kind === "dir" ? (
          <button
            key={`d:${r.path}`}
            role="treeitem"
            aria-expanded={r.expanded}
            className="oc-files-row dir"
            style={{ paddingLeft: 8 + r.depth * 20 }}
            onClick={() => toggle(r.path)}
          >
            <FolderIcon size={14} />
            <span className="name">{r.name}</span>
            <span className={`oc-files-chevron${r.expanded ? " open" : ""}`} aria-hidden>
              <ChevronDownIcon size={12} />
            </span>
          </button>
        ) : (
          <button
            key={`f:${r.path}`}
            role="treeitem"
            className="oc-files-row file"
            style={{ paddingLeft: 8 + r.depth * 20 }}
            onClick={() => void open(r.path)}
            title={app ? `Open ${r.path} in ${app.name}` : r.path}
          >
            <FileIcon size={14} />
            <span className="name">{r.name}</span>
          </button>
        ),
      )}
    </div>
  );
}
