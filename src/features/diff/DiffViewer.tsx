// parity:diff.discard:ui parity:diff.whitespace:ui parity:diff.split-unified:ui parity:diff.viewed:ui parity:diff.navigation:ui parity:diff.file-render:ui
// The diff viewer in two places, as in Conductor: the changed-files list in the
// right panel, and the selected file in an "All changes" tab in the main area.
// Both read one useWorkspaceDiff state. The list is in ChangesList.tsx.
import type { ReactNode } from "react";
import "./diff.css";
import { DiscardDialog } from "./DiscardDialog";
import { ViewOptionsMenu } from "./Whitespace";
import { FileDiffView, type LineAnchor, type LineRange } from "./FileDiffView";
import { editableContents, useFileEdit } from "./EditInViewer.ts";
import type { DiffLayout, FileDiff } from "./types.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";
export { ChangesList, type ChangesListProps } from "./ChangesList";

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
// Conductor's labels for its three file-toolbar layout toggles (REA, 0.87.6).
export const LAYOUT_TITLE: Record<DiffLayout, string> = { unified: "Unified view", split: "Split view", file: "Entire file" };

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

export interface DiffTabProps {
  diff: WorkspaceDiff;
  onLineClick?: (file: FileDiff, range: LineRange) => void;
  /** Lines a comment is being written on in `file`, if any. */
  commentRange?: (file: FileDiff) => LineRange | null;
  anchors?: (file: FileDiff) => LineAnchor[];
  annotations?: (file: FileDiff, anchor: LineAnchor) => ReactNode;
  /** Shown above the file: PR-level and whole-file comments. */
  notes?: (file: FileDiff) => ReactNode;
}

/** Main-area "All changes" tab: the file picked in the changes list, with its toolbar. */
export function DiffTab({ diff, onLineClick, commentRange, anchors, annotations, notes }: DiffTabProps) {
  const { selected, files, load } = diff;
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
  return <OpenFile diff={diff} f={f} selected={selected} onLineClick={onLineClick} commentRange={commentRange} anchors={anchors} annotations={annotations} notes={notes} />;
}

/** The open file, editable in the entire-file layout (EditInViewer.ts). */
function OpenFile({ diff, f, selected, onLineClick, commentRange, anchors, annotations, notes }: DiffTabProps & { f: FileDiff; selected: FileDiff }) {
  const { opts, update } = diff;
  const edit = useFileEdit(diff.worktree, selected.path, editableContents(selected, opts.layout, opts.ignoreWhitespace), diff.reloadQuietly);
  return (
    <div className="oc-diff oc-diff-tab">
      <div className="oc-files">
        {notes?.(f)}
        <FileDiffView
          key={selected.path}
          file={selected}
          layout={opts.layout}
          ignoreWhitespace={opts.ignoreWhitespace}
          wrapLines={opts.wrapLines}
          viewed={diff.isViewed(f)}
          onToggleViewed={() => diff.toggleViewed(f)}
          onLineClick={onLineClick && ((r) => onLineClick(f, r))}
          selected={commentRange?.(f)}
          anchors={anchors?.(f)}
          annotations={annotations && ((a) => annotations(f, a))}
          loadFull={() => diff.loadFull(f)}
          onDiscard={diff.canDiscard ? () => diff.askDiscard(f) : undefined}
          onShowWhitespace={() => update({ ignoreWhitespace: false })}
          edit={edit}
          tools={
            <>
              <LayoutToggle value={opts.layout} onChange={(layout) => update({ layout })} />
              <ViewOptionsMenu
                whitespace={{ hidden: opts.ignoreWhitespace, onChange: (ignoreWhitespace) => update({ ignoreWhitespace }) }}
                textWrap={f.binary ? undefined : { wrapLines: opts.wrapLines, onChange: (wrapLines) => update({ wrapLines }) }}
              />
            </>
          }
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

/**
 * The discard confirmation, shown once for whichever view asked for it.
 * `onDiscarded` runs after a successful discard (WorkspaceView attaches Conductor's revert note to the chat).
 */
export function DiffDiscardHost({ diff, onDiscarded }: { diff: WorkspaceDiff; onDiscarded?: (f: FileDiff) => void }) {
  const f = diff.discarding;
  if (!f) return null;
  return <DiscardDialog file={f} onClose={() => diff.askDiscard(null)} onConfirm={() => diff.discard(f).then(() => onDiscarded?.(f))} />;
}
