// parity:diff.changes-list:ui parity:diff.discard:ui parity:diff.whitespace:ui parity:diff.split-unified:ui parity:diff.viewed:ui parity:diff.navigation:ui parity:diff.file-render:ui
// The diff viewer in two places, as in Conductor: the changed-files list in the
// right panel, and the selected file in an "All changes" tab in the main area.
// Both read one useWorkspaceDiff state.
import type { ReactNode } from "react";
import "./diff.css";
import { DiscardDialog, RevertIcon } from "./DiscardDialog";
import { FileDiffView, STATUS_LETTER, type LineAnchor } from "./FileDiffView";
import type { DiffLayout, FileDiff } from "./types.ts";
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

const LAYOUT_ICON: Record<DiffLayout, ReactNode> = {
  unified: <path d="M3 4h10M3 7h10M3 10h10M3 13h6" />,
  split: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M8 3v10" />
    </>
  ),
  file: (
    <>
      <path d="M4 2.5h5l3 3v8H4z" />
      <path d="M6 8h4M6 10.5h4" />
    </>
  ),
};
const LAYOUT_TITLE: Record<DiffLayout, string> = { unified: "Unified diff", split: "Split diff", file: "Entire file" };

function LayoutToggle({ value, onChange }: { value: DiffLayout; onChange: (v: DiffLayout) => void }) {
  return (
    <span className="oc-seg oc-icons" role="group" aria-label="Diff layout">
      {(Object.keys(LAYOUT_ICON) as DiffLayout[]).map((v) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)} title={LAYOUT_TITLE[v]} aria-label={LAYOUT_TITLE[v]}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {LAYOUT_ICON[v]}
          </svg>
        </button>
      ))}
    </span>
  );
}

export interface ChangesListProps {
  diff: WorkspaceDiff;
  /** Extra toolbar content (comment and review actions). */
  actions?: (files: FileDiff[]) => ReactNode;
}

/** Right panel: scope and whitespace options, "N files changed" and one row per file. */
export function ChangesList({ diff, actions }: ChangesListProps) {
  const { opts, update, load, files, totals, current } = diff;
  return (
    <div className="oc-diff oc-diff-list">
      <div className="oc-diff-toolbar">
        <Seg value={opts.scope} options={[["all", "All changes"], ["uncommitted", "Uncommitted"]]} onChange={(scope) => update({ scope })} />
        <label title="Hide changes that only touch whitespace">
          <input type="checkbox" checked={opts.ignoreWhitespace} onChange={(e) => update({ ignoreWhitespace: e.target.checked })} /> Hide whitespace
        </label>
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
          <p>{opts.scope === "uncommitted" ? "Nothing uncommitted." : "No changes on this branch yet."}</p>
          <p className="muted">Changes the agent makes show up here.</p>
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
            <div key={f.path} className="oc-change-row">
              <button className={`oc-change${diff.isViewed(f) ? " viewed" : ""}`} aria-current={i === current} onClick={() => diff.open(i)} title={`Open ${f.path}`}>
                <span className="name">{f.path}</span>
                <span className={`oc-status ${f.status}`}>{STATUS_LETTER[f.status]}</span>
                <span className="oc-count">
                  <span className="a">+{f.additions}</span>
                  <span className="d">-{f.deletions}</span>
                </span>
              </button>
              <button className="icon-btn oc-discard" onClick={() => diff.askDiscard(f)} title="Discard changes" aria-label={`Discard changes to ${f.path}`}>
                <RevertIcon />
              </button>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}

export interface DiffTabProps {
  diff: WorkspaceDiff;
  onLineClick?: (file: FileDiff, anchor: LineAnchor) => void;
  anchors?: (file: FileDiff) => LineAnchor[];
  annotations?: (file: FileDiff, anchor: LineAnchor) => ReactNode;
}

/** Main-area "All changes" tab: the file picked in the changes list, with its toolbar. */
export function DiffTab({ diff, onLineClick, anchors, annotations }: DiffTabProps) {
  const { opts, update, selected, files, load } = diff;
  if (!selected) {
    return (
      <div className="oc-diff oc-diff-tab">
        <div className="placeholder small">
          <p>{load.state === "ready" && files.length === 0 ? "No changes to show." : "Pick a file in the changes list."}</p>
        </div>
      </div>
    );
  }
  const f = files[diff.current];
  return (
    <div className="oc-diff oc-diff-tab">
      <div className="oc-files">
        <FileDiffView
          key={selected.path}
          file={selected}
          layout={opts.layout}
          ignoreWhitespace={opts.ignoreWhitespace}
          viewed={diff.isViewed(f)}
          onToggleViewed={() => diff.toggleViewed(f)}
          onLineClick={onLineClick && ((a) => onLineClick(f, a))}
          anchors={anchors?.(f)}
          annotations={annotations && ((a) => annotations(f, a))}
          loadFull={() => diff.loadFull(f)}
          onDiscard={() => diff.askDiscard(f)}
          tools={<LayoutToggle value={opts.layout} onChange={(layout) => update({ layout })} />}
        />
        {diff.unread >= 0 && diff.unread !== diff.current && (
          <button className="btn btn-small oc-next-unread" onClick={() => diff.open(diff.unread)} title="Open the next file not marked as viewed">
            Next unread ›
          </button>
        )}
      </div>
    </div>
  );
}

/** The discard confirmation, shown once for whichever view asked for it. */
export function DiffDiscardHost({ diff }: { diff: WorkspaceDiff }) {
  const f = diff.discarding;
  if (!f) return null;
  return <DiscardDialog file={f} onClose={() => diff.askDiscard(null)} onConfirm={() => diff.discard(f)} />;
}
