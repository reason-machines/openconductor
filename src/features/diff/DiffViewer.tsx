// parity:diff.discard:ui parity:diff.whitespace:ui parity:diff.split-unified:ui parity:diff.viewed:ui parity:diff.navigation:ui parity:diff.file-render:ui
// The diff viewer in two places, as in Conductor: the changed-files list in the
// right panel, and the selected file in an "All changes" tab in the main area.
// Both read one useWorkspaceDiff state. The list is in ChangesList.tsx.
import { Tooltip } from "../../components/ui/Tooltip.tsx";
import { useEffect, useState, type ReactNode } from "react";
import { ConductorIcon } from "../../components/ConductorIcon";
import type { ConductorIconName } from "../../components/conductorIcons.generated";
import "./diff.css";
import { DiscardDialog } from "./DiscardDialog";
import { ViewOptionsMenu } from "./Whitespace";
import { FileDiffView, type LineAnchor, type LineRange } from "./FileDiffView";
import { editableContents, useFileEdit } from "./EditInViewer.ts";
import type { DiffLayout, FileDiff } from "./types.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";
export { ChangesList, type ChangesListProps } from "./ChangesList";

// Conductor's `UPo` icons (Lucide, size-3): text-align-start, columns-2, file-text.
const LAYOUT_ICON: Record<DiffLayout, ConductorIconName> = { unified: "text-align-start", split: "columns-2", file: "file-text" };
// Conductor's labels for its three file-toolbar layout toggles (REA, 0.87.6).
export const LAYOUT_TITLE: Record<DiffLayout, string> = { unified: "Unified view", split: "Split view", file: "Entire file" };

/** Conductor's `HPo`: h-8 rounded-md bg-muted p-0.5 around three size-7 icon buttons, the pressed one bg-popover-accent. */
function LayoutToggle({ value, onChange }: { value: DiffLayout; onChange: (v: DiffLayout) => void }) {
  return (
    <span className="oc-layout-group" role="group" aria-label="Diff layout">
      {(Object.keys(LAYOUT_ICON) as DiffLayout[]).map((v) => (
        <Tooltip key={v} content={LAYOUT_TITLE[v]}>
          <button aria-pressed={v === value} onClick={() => onChange(v)} aria-label={LAYOUT_TITLE[v]}>
            <ConductorIcon name={LAYOUT_ICON[v]} size={12} />
          </button>
        </Tooltip>
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
  /** Shows a toast (a failed copy of the file). */
  notify?: (kind: "info" | "error", message: string) => void;
}

/** Main-area "All changes" tab: the file picked in the changes list, with its toolbar. */
export function DiffTab({ diff, onLineClick, commentRange, anchors, annotations, notes, notify }: DiffTabProps) {
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
  return <OpenFile diff={diff} f={f} selected={selected} onLineClick={onLineClick} commentRange={commentRange} anchors={anchors} annotations={annotations} notes={notes} notify={notify} />;
}

/**
 * The open file with whole-file context, so Pierre draws it as a full diff like
 * Conductor's tab (pierre.ts `fullDiffMeta`). The entire-file layout already has
 * it; binary files have no lines. Null until it loads or when it fails (the
 * patch is drawn meanwhile).
 */
function useWholeFile(diff: WorkspaceDiff, selected: FileDiff, layout: DiffLayout): FileDiff | null {
  const [full, setFull] = useState<{ of: FileDiff; file: FileDiff } | null>(null);
  const wanted = layout !== "file" && !selected.binary && selected.hunks.length > 0;
  const loadFull = diff.loadFull;
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    loadFull(selected).then(
      (file) => live && setFull({ of: selected, file }),
      () => live && setFull(null),
    );
    return () => {
      live = false;
    };
    // loadFull is rebuilt every render; the file object changes whenever the diff reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, wanted]);
  return wanted && full?.of === selected ? full.file : null;
}

/** The open file, editable after its complete current contents are available. */
function OpenFile({ diff, f, selected, onLineClick, commentRange, anchors, annotations, notes, notify }: DiffTabProps & { f: FileDiff; selected: FileDiff }) {
  const { opts, update } = diff;
  const full = useWholeFile(diff, selected, opts.layout);
  const edit = useFileEdit(diff.worktree, selected.path, typeof opts.scope === "object" || diff.turn !== null ? null : editableContents(selected, opts.layout, opts.ignoreWhitespace, full), diff.reloadQuietly);
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
          full={full}
          loadText={() => diff.loadText(f)}
          notify={notify}
          onDiscard={diff.canDiscard ? () => diff.askDiscard(f) : undefined}
          onShowWhitespace={() => update({ ignoreWhitespace: false })}
          edit={edit}
          worktree={diff.worktree}
          tools={<LayoutToggle value={opts.layout} onChange={(layout) => update({ layout })} />}
          options={
            <ViewOptionsMenu
              whitespace={{ hidden: opts.ignoreWhitespace, onChange: (ignoreWhitespace) => update({ ignoreWhitespace }) }}
              textWrap={f.binary ? undefined : { wrapLines: opts.wrapLines, onChange: (wrapLines) => update({ wrapLines }) }}
            />
          }
        />
        {diff.unread >= 0 && diff.unread !== diff.current && (
          <button className="btn btn-small oc-next-unread" onClick={() => diff.open(diff.unread)}>
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
