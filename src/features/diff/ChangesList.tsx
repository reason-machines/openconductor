// parity:diff.changes-list:ui parity:diff.discard:ui parity:diff.whitespace:ui parity:diff.viewed:ui parity:diff.turn-changes:ui
// Right panel of the diff viewer: scope and whitespace options, the
// "N files changed" header and one row per changed file with its stats and a
// per-file discard, plus Conductor's file context menu (FileContextMenu.tsx).
// The selected file opens in DiffViewer.tsx's DiffTab.
import { useCallback, useState, type ReactNode } from "react";
import "./diff.css";
import { RevertIcon } from "./DiscardDialog";
import { FileContextMenu } from "./FileContextMenu";
import { STATUS_LETTER } from "./FileDiffView";
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
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

/** Right panel: scope option, "N files changed" and one row per file. */
export function ChangesList({ diff, actions, worktree }: ChangesListProps) {
  const { opts, update, load, files, totals, current } = diff;
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
        </div>
      )}
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
          {files.map((f, i) => (
            <div
              key={f.path}
              className="oc-change-row"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ index: i, x: e.clientX, y: e.clientY });
              }}
            >
              <button className={`oc-change${diff.isViewed(f) ? " viewed" : ""}`} aria-current={i === current} onClick={() => diff.open(i)} title={`Open ${f.path}`}>
                <span className="name">{f.path}</span>
                <span className={`oc-status ${f.status}`}>{STATUS_LETTER[f.status]}</span>
                <span className="oc-count">
                  <span className="a">+{f.additions}</span>
                  <span className="d">-{f.deletions}</span>
                </span>
              </button>
              {diff.canDiscard && (
                <button className="icon-btn oc-discard" onClick={() => diff.askDiscard(f)} title="Discard changes" aria-label={`Discard changes to ${f.path}`}>
                  <RevertIcon />
                </button>
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
            discard: () => diff.askDiscard(menuFile),
          }}
        />
      )}
    </div>
  );
}

