// parity:diff.changes-list:ui parity:diff.discard:ui parity:diff.whitespace:ui parity:diff.viewed:ui parity:diff.turn-changes:ui
// Right panel of the diff viewer: scope and whitespace options, the
// "N files changed" header and one row per changed file with its stats and a
// per-file discard, plus Conductor's file context menu (FileContextMenu.tsx).
// The selected file opens in DiffViewer.tsx's DiffTab.
import { Tooltip } from "../../components/ui/Tooltip.tsx";
import { useCallback, useState, type ReactNode } from "react";
import "./diff.css";
import { RevertIcon } from "./DiscardDialog";
import { FileContextMenu } from "./FileContextMenu";
import { STATUS_LETTER } from "./FileDiffView";
import { splitPath } from "./FilePathChip";
import { SearchIcon, XIcon } from "../files/panelIcons";
import { filterActive, filterChangedFiles } from "./changesFilter";
import type { FileDiff } from "./types.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";

function Seg<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <span className="oc-seg">
      {options.map(([v, label]) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </span>
  );
}

export interface ChangesListProps {
  diff: WorkspaceDiff;
  /** Extra toolbar content (comment and review actions). */
  actions?: (files: FileDiff[]) => ReactNode;
  /** Worktree folder, for the context menu's absolute "Copy path". */
  worktree?: string | null;
  /** Under the All changes empty state: Conductor's "Pull latest from <target>" button. */
  emptyAction?: ReactNode;
  /** The "Filter files" state, shared with its toggle in the panel's tab row. */
  filter?: ChangesFilterState;
}

export interface ChangesFilterState {
  open: boolean;
  query: string;
  /** Typing also opens the row. */
  setQuery: (query: string) => void;
  /** Escape and "Close filter": clear and close. */
  close: () => void;
}

/** Conductor's `W4s`: search icon, the input, "N of M" while it holds text, and a close button. */
function ChangesFilterRow({ filter, matchCount, totalCount }: { filter: ChangesFilterState; matchCount: number; totalCount: number }) {
  return (
    <div className="oc-changes-filter">
      <div className="oc-changes-filter-box">
        <SearchIcon size={12} />
        <input
          autoFocus={filter.query === ""}
          type="text"
          value={filter.query}
          onChange={(e) => filter.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            filter.close();
          }}
          placeholder="Filter files"
          aria-label="Filter changed files"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {filter.query !== "" && (
          <span className="oc-changes-filter-count">
            {matchCount} of {totalCount}
          </span>
        )}
        <button type="button" className="oc-changes-filter-close" aria-label="Close filter" title="Close filter" onClick={filter.close}>
          <XIcon size={12} />
        </button>
      </div>
    </div>
  );
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

/** Right panel: scope option, "N files changed" and one row per file. */
export function ChangesList({ diff, actions, worktree, emptyAction, filter }: ChangesListProps) {
  const { opts, update, load, files, totals, current } = diff;
  const filtering = filter ? filterActive(filter.open, filter.query) : false;
  const shown = filter ? filterChangedFiles(files, filter.query) : files;
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuFile = menu ? files[menu.index] : undefined;
  return (
    <div className="oc-diff oc-diff-list">
      <div className="oc-diff-toolbar">
        <Seg
          value={diff.turn ? "turn" : opts.scope}
          options={diff.turn ? [["all", "All changes"], ["uncommitted", "Uncommitted"], ["turn", "Turn"]] : [["all", "All changes"], ["uncommitted", "Uncommitted"]]}
          onChange={(scope) => scope !== "turn" && update({ scope })}
        />
        <span className="spacer" />
        {load.state === "ready" && files.length > 0 && (
          <span className="muted">
            {diff.viewedCount}/{files.length} viewed
          </span>
        )}
        {actions?.(files)}
        <button className="btn btn-small" onClick={diff.refresh} title="Reload changes">
          Refresh
        </button>
      </div>
      {load.state === "loading" && <div className="placeholder small">Loading changes…</div>}
      {load.state === "error" && (
        <div className="placeholder small">
          <p className="error">Couldn't load changes.</p>
          <p className="muted">{load.message}</p>
        </div>
      )}
      {load.state === "ready" && files.length === 0 && (
        <div className="placeholder small">
          <p>{diff.turn ? "No changes in selected turn." : opts.scope === "uncommitted" ? "Nothing uncommitted." : "No changes on this branch yet."}</p>
          {!diff.turn && <p className="muted">Changes the agent makes show up here.</p>}
          {!diff.turn && opts.scope === "all" && emptyAction}
        </div>
      )}
      {load.state === "ready" && files.length > 0 && filter && filtering && <ChangesFilterRow filter={filter} matchCount={shown.length} totalCount={files.length} />}
      {load.state === "ready" && files.length > 0 && (
        <nav className="oc-changes" aria-label="Changed files">
          <div className="oc-changes-header">
            <span>
              {files.length} {files.length === 1 ? "file" : "files"} changed
            </span>
            <span className="oc-count">
              <span className="a">+{totals.a}</span>
              <span className="d">-{totals.d}</span>
            </span>
          </div>
          {shown.length === 0 && <div className="oc-changes-nomatch">No files match this filter</div>}
          {shown.map((f) => [f, files.indexOf(f)] as const).map(([f, i]) => (
            <div
              key={f.path}
              className="oc-change-row"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ index: i, x: e.clientX, y: e.clientY });
              }}
            >
              <button className={`oc-change${diff.isViewed(f) ? " viewed" : ""}`} aria-current={i === current} onClick={() => diff.open(i)} title={`Open ${f.path}`}>
                <span className="name">
                  {/* Conductor's row draws the path with \`bj\`: the directory muted, the file name in the foreground. */}
                  <PathParts path={f.path} />
                </span>
                <span className={`oc-status ${f.status}`}>{STATUS_LETTER[f.status]}</span>
                <span className="oc-count">
                  <span className="a">+{f.additions}</span>
                  <span className="d">-{f.deletions}</span>
                </span>
              </button>
              {diff.canDiscard && (
                <Tooltip content="Discard changes">
                  <button className="icon-btn oc-discard" onClick={() => diff.askDiscard(f)} aria-label={`Discard changes to ${f.path}`}>
                    <RevertIcon />
                  </button>
                </Tooltip>
              )}
            </div>
          ))}
        </nav>
      )}
      {menu && menuFile && (
        <FileContextMenu
          key={menuFile.path}
          path={menuFile.path}
          at={menu}
          onClose={closeMenu}
          actions={{
            view: () => diff.open(menu.index),
            copyPath: worktree ? () => copy(`${worktree.replace(/\/+$/, "")}/${menuFile.path}`) : undefined,
            copyRelativePath: () => copy(menuFile.path),
            // Always against the "All changes" base, also in the Uncommitted and turn views (target.ts).
            discard: () => diff.askDiscard(menuFile, "menu"),
          }}
        />
      )}
    </div>
  );
}


/** The directory (muted, may truncate) and the file name of a changed path. */
function PathParts({ path }: { path: string }) {
  const { directory, fileName } = splitPath(path);
  return (
    <>
      {directory && <span className="oc-path-dir">{directory}</span>}
      <span className="oc-path-name">{fileName}</span>
    </>
  );
}
