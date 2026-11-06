// parity:diff.changes-list:ui parity:diff.discard:ui parity:diff.whitespace:ui parity:diff.viewed:ui parity:diff.turn-changes:ui
import { Tooltip } from "../../components/ui/Tooltip.tsx";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import "./diff.css";
import { RevertIcon } from "./DiscardDialog";
import { FileContextMenu } from "./FileContextMenu";
import { copyText, openInApp } from "../openIn/apps";
import { splitPath } from "./FilePathChip";
import { SearchIcon, XIcon } from "../files/panelIcons";
import { filterActive, filterChangedFiles } from "./changesFilter";
import { changeRows, type ChangesView } from "./changesTree.ts";
import type { FileDiff, FileStatus } from "./types.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";

type Notify = (kind: "info" | "error", message: string) => void;
export interface ChangesListProps {
  diff: WorkspaceDiff;
  actions?: (files: FileDiff[]) => ReactNode;
  worktree?: string | null;
  emptyAction?: ReactNode;
  filter?: ChangesFilterState;
  notify?: Notify;
  view?: ChangesView;
}
export interface ChangesFilterState {
  open: boolean;
  query: string;
  setQuery: (query: string) => void;
  close: () => void;
}

function ChangesFilterRow({ filter, matchCount, totalCount }: { filter: ChangesFilterState; matchCount: number; totalCount: number }) {
  return (
    <div className="oc-changes-filter">
      <div className="oc-changes-filter-box">
        <SearchIcon size={12} />
        <input autoFocus={filter.query === ""} type="text" value={filter.query} onChange={(e) => filter.setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); filter.close(); } }}
          placeholder="Filter files" aria-label="Filter changed files" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
        {filter.query !== "" && <span className="oc-changes-filter-count">{matchCount} of {totalCount}</span>}
        <button type="button" className="oc-changes-filter-close" aria-label="Close filter" title="Close filter" onClick={filter.close}><XIcon size={12} /></button>
      </div>
    </div>
  );
}

function copy(text: string, label: string, notify?: Notify) {
  copyText(text).then(() => notify?.("info", `Copied ${label} to clipboard`), () => notify?.("error", "Failed to copy to clipboard"));
}

export function ChangesList({ diff, actions, worktree, emptyAction, filter, notify, view = "flat" }: ChangesListProps) {
  const { opts, load, files, totals, current } = diff;
  const filtering = filter ? filterActive(filter.open, filter.query) : false;
  const shown = filter ? filterChangedFiles(files, filter.query) : files;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => setCollapsed(new Set()), [worktree]);
  const rows = changeRows(shown, view, filter?.query.trim() ? new Set() : collapsed);
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuFile = menu ? files.find((file) => file.path === menu.path) : undefined;
  return (
    <div className="oc-diff oc-diff-list">
      {load.state === "loading" && <div className="placeholder small">Loading changes…</div>}
      {load.state === "error" && <div className="placeholder small"><p className="error">Couldn't load changes.</p><p className="muted">{load.message}</p><button className="btn btn-small" onClick={diff.refresh}>Try again</button></div>}
      {load.state === "ready" && files.length === 0 && <div className="placeholder small"><p>{diff.turn ? "No changes in selected turn." : opts.scope === "uncommitted" ? "Nothing uncommitted." : "No changes on this branch yet."}</p>{!diff.turn && <p className="muted">Changes the agent makes show up here.</p>}{!diff.turn && opts.scope === "all" && emptyAction}</div>}
      {load.state === "ready" && files.length > 0 && filter && filtering && <ChangesFilterRow filter={filter} matchCount={shown.length} totalCount={files.length} />}
      {load.state === "ready" && files.length > 0 && <>
        <div className="oc-changes-header"><span>{files.length} {files.length === 1 ? "file" : "files"} changed</span><ChangeCounts additions={totals.a} deletions={totals.d} showZero /></div>
        <nav className="oc-changes" aria-label="Changed files" data-view={view}>
          {shown.length === 0 && <div className="oc-changes-nomatch">No files match this filter</div>}
          {rows.map((row, rowIndex) => {
            const nextDepth = rows[rowIndex + 1]?.depth ?? -1;
            if (row.kind === "directory") return <button key={row.path} type="button" className="oc-change-directory" aria-label={row.name} aria-expanded={row.expanded} style={{ paddingLeft: 12 + row.depth * 12 }} onClick={() => setCollapsed((prev) => { const next = new Set(prev); if (next.has(row.path)) next.delete(row.path); else next.add(row.path); return next; })}>
              <TreeGuides depth={row.depth} nextDepth={nextDepth} />
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={row.expanded ? "m6 9 6 6 6-6" : "m9 18 6-6-6-6"} /></svg>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d={row.expanded ? "M1.5 14h11l.48-.37 2.63-7-.48-.63H14V3.5l-.5-.5H7.71l-.86-.85L6.5 2h-5l-.5.5v11l.5.5zM2 3h4.29l.86.85.35.15H13v2H8.5l-.35.15-.86.85H3.5l-.47.34-1 3.08L2 3zm10.13 10H2.19l1.67-5H7.5l.35-.15.86-.85h5.79l-2.37 6z" : "M1.5 2h5l.35.15.86.85h5.79l.5.5v10l-.5.5h-12l-.5-.5v-11l.5-.5zM2 3v10h11V4H7.5l-.35-.15L6.29 3H2z"} /></svg><span className="name">{row.name}</span>{!row.expanded && <ChangeCounts additions={row.additions} deletions={row.deletions} />}
            </button>;
            const f = row.file;
            return <div key={f.path} className="oc-change-row" style={view === "tree" ? { marginLeft: 8 + row.depth * 12 } : undefined} onContextMenu={(e) => { e.preventDefault(); setMenu({ path: f.path, x: e.clientX, y: e.clientY }); }}>
              {view === "tree" && <TreeGuides depth={row.depth} nextDepth={nextDepth} offset={8 + row.depth * 12} />}
              <button className={`oc-change${diff.isViewed(f) ? " viewed" : ""}`} aria-current={files[current]?.path === f.path} onClick={() => diff.openPath(f.path)} title={`Open ${f.path}`}>
                <span className="name">{f.status === "renamed" && f.old_path && <><PathParts path={view === "tree" ? splitPath(f.old_path).fileName : f.old_path} /><span className="oc-change-rename-arrow">→</span></>}<PathParts path={row.name} /></span>
                <span className="oc-change-meta">{diff.uncommittedPaths.has(f.path) && <span className="oc-change-uncommitted">U</span>}<ChangeCounts additions={f.additions} deletions={f.deletions} /><ChangeStatus status={f.status} /></span>
              </button>
              <span className="oc-change-actions">
                {diff.canDiscard && <Tooltip content="Discard changes"><button className="rp-icon oc-discard" onClick={() => diff.askDiscard(f)} aria-label={`Discard changes to ${f.path}`}><RevertIcon /></button></Tooltip>}
                {worktree && <Tooltip content="Open in"><button className="rp-icon" aria-label={`Open in options for ${f.path}`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ path: f.path, x: r.left, y: r.bottom }); }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></Tooltip>}
              </span>
            </div>;
          })}
        </nav>
      </>}
      <div className="oc-changes-comment-actions">{actions?.(files)}</div>
      {menu && menuFile && <FileContextMenu key={menuFile.path} path={menuFile.path} at={menu} onClose={closeMenu} actions={{
        view: () => diff.openPath(menu.path),
        copyPath: worktree ? () => copy(`${worktree.replace(/\/+$/, "")}/${menuFile.path}`, "path", notify) : undefined,
        copyRelativePath: () => copy(menuFile.path, "relative path", notify),
        openIn: worktree ? (app) => openInApp(app.id, `${worktree.replace(/\/+$/, "")}/${menuFile.path}`).catch((e) => notify?.("error", `Failed to open in ${app.name}: ${e instanceof Error ? e.message : String(e)}`)) : undefined,
        discard: () => diff.askDiscard(menuFile, "menu"),
      }} />}
    </div>
  );
}

function TreeGuides({ depth, nextDepth, offset = 0 }: { depth: number; nextDepth: number; offset?: number }) {
  return Array.from({ length: depth }, (_, level) => <span key={level} className="oc-change-guide" aria-hidden="true" style={{ left: 18 + level * 12 - offset, height: nextDepth <= level ? "50%" : "100%" }} />);
}

function PathParts({ path }: { path: string }) {
  const { directory, fileName } = splitPath(path);
  return <>{directory && <span className="oc-path-dir">{directory}</span>}<span className="oc-path-name">{fileName}</span></>;
}
function ChangeCounts({ additions, deletions, showZero = false }: { additions: number; deletions: number; showZero?: boolean }) {
  return <span className="oc-count">{(showZero || additions > 0) && <span className="a">+{additions}</span>}{(showZero || deletions > 0) && <span className="d">-{deletions}</span>}</span>;
}
const STATUS_GLYPH = { added: "plus", untracked: "plus", deleted: "minus", modified: "dot", renamed: "arrow", copied: "plus", type_changed: "dot" } satisfies Record<FileStatus, "plus" | "minus" | "dot" | "arrow">;
function ChangeStatus({ status }: { status: FileStatus }) {
  const glyph = STATUS_GLYPH[status];
  return <svg className={`oc-status ${status}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={status}>
    <rect width="18" height="18" x="3" y="3" rx="2" />{glyph === "dot" ? <circle cx="12" cy="12" r="1" /> : glyph === "arrow" ? <path d="M8 12h8m-3-3 3 3-3 3" /> : <><path d="M8 12h8" />{glyph === "plus" && <path d="M12 8v8" />}</>}
  </svg>;
}
