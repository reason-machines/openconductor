// parity:diff.file-render:ui parity:diff.split-unified:ui parity:diff.viewed:ui
// One changed file in the "All changes" tab. The code is drawn by Pierre's
// diff library with the options Conductor's diff tab passes it (REA, 0.87.6):
// no Pierre file header (ours carries Viewed and discard), Pierre themes,
// "line-info-basic" separators expanding 20 lines per click, no wrapping,
// number-column hover and a gutter button that starts a comment.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { processFile, type DiffLineAnnotation, type LineAnnotation, type SelectedLineRange, type ThemeTypes } from "@pierre/diffs";
import { File as PierreFile, FileDiff as PierreFileDiff } from "@pierre/diffs/react";
import { RevertIcon } from "./DiscardDialog";
import type { CommentSide } from "./comments.ts";
import { EXPANSION_LINE_COUNT, PIERRE_THEME, fromPierreSide, fullContents, loadedFiles, toPatch, toPierreSide } from "./pierre.ts";
import type { DiffLayout, FileDiff } from "./types.ts";

export interface LineAnchor {
  side: CommentSide;
  line: number;
}

interface Props {
  file: FileDiff;
  layout: DiffLayout;
  ignoreWhitespace: boolean;
  viewed: boolean;
  onToggleViewed: () => void;
  /** The gutter button on a line starts a comment there. */
  onLineClick?: (anchor: LineAnchor) => void;
  /** Lines that have something rendered under them (comment threads, the composer). */
  anchors?: LineAnchor[];
  /** What to render under an anchored line. */
  annotations?: (anchor: LineAnchor) => ReactNode;
  /** This file loaded with whole-file context, for expanding unmodified lines. */
  loadFull?: () => Promise<FileDiff>;
  /** Ask to discard this file's changes (opens the confirmation). */
  onDiscard?: () => void;
  /** Extra header controls, before the Viewed checkbox (the layout toggle). */
  tools?: ReactNode;
}

/** The app theme as Pierre's themeType: `data-theme` on the root, or the system setting when absent. */
function useThemeType(): ThemeTypes {
  const read = (): ThemeTypes => {
    const t = document.documentElement.dataset.theme;
    return t === "light" || t === "dark" ? t : "system";
  };
  const [type, setType] = useState<ThemeTypes>(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setType(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return type;
}

const anchorOfRange = (r: SelectedLineRange): LineAnchor => ({ side: fromPierreSide(r.side), line: Math.min(r.start, r.end) });

function Code({ file, layout, ignoreWhitespace, onLineClick, anchors = [], annotations, loadFull }: Props) {
  const themeType = useThemeType();
  // Pierre upgrades this object in place when it loads the full file, so keep it per file.
  const meta = useMemo(() => processFile(toPatch(file), { isGitDiff: true }), [file]);
  const interaction = {
    enableGutterUtility: onLineClick !== undefined,
    lineHoverHighlight: "number" as const,
    onGutterUtilityClick: onLineClick && ((r: SelectedLineRange) => onLineClick(anchorOfRange(r))),
  };
  const base = { disableFileHeader: true, overflow: "scroll" as const, theme: PIERRE_THEME, themeType, ...interaction };

  if (layout === "file") {
    // The file as it is now (as it was, for a deleted file), loaded with whole-file context.
    const c = fullContents(file);
    const side: CommentSide = c.new === null ? "old" : "new";
    const lineAnnotations: LineAnnotation<LineAnchor>[] = anchors.filter((a) => a.side === side).map((a) => ({ lineNumber: a.line, metadata: a }));
    return (
      <PierreFile<LineAnchor>
        file={{ name: file.path, contents: c.new ?? c.old ?? "" }}
        options={{ ...base, onGutterUtilityClick: onLineClick && ((r: SelectedLineRange) => onLineClick({ side, line: Math.min(r.start, r.end) })) }}
        lineAnnotations={lineAnnotations}
        renderAnnotation={(a) => annotations?.(a.metadata)}
      />
    );
  }

  if (!meta) return <div className="oc-file-note">This diff couldn't be displayed.</div>;
  const lineAnnotations: DiffLineAnnotation<LineAnchor>[] = anchors.map((a) => ({ side: toPierreSide(a.side), lineNumber: a.line, metadata: a }));
  return (
    <PierreFileDiff<LineAnchor>
      fileDiff={meta}
      options={{
        ...base,
        diffStyle: layout === "split" ? "split" : "unified",
        hunkSeparators: "line-info-basic",
        expansionLineCount: EXPANSION_LINE_COUNT,
        loadDiffFiles: loadFull && (async () => loadedFiles(await loadFull())),
        parseDiffOptions: ignoreWhitespace ? { ignoreWhitespace: true } : undefined,
      }}
      lineAnnotations={lineAnnotations}
      renderAnnotation={(a) => annotations?.(a.metadata)}
    />
  );
}

export function FileDiffView(props: Props) {
  const { file, ignoreWhitespace, viewed, onToggleViewed, onDiscard, tools } = props;
  let body: ReactNode;
  if (file.binary) body = <div className="oc-file-note">Binary file not shown.</div>;
  else if (file.hunks.length === 0)
    body = <div className="oc-file-note">{ignoreWhitespace ? "Only whitespace changed in this file." : "No content changes in this file."}</div>;
  else
    body = (
      <div className="oc-code-scroll">
        <Code {...props} />
      </div>
    );

  return (
    <section className="oc-file" id={`oc-file-${encodeURIComponent(file.path)}`} data-viewed={viewed || undefined}>
      <header className="oc-file-header">
        <span className={`oc-status ${file.status}`}>{STATUS_LETTER[file.status]}</span>
        <span className="path" title={file.path}>
          {file.old_path ? `${file.old_path} → ` : ""}
          {file.path}
        </span>
        <span className="oc-count">
          <span className="a">+{file.additions}</span>
          <span className="d">-{file.deletions}</span>
        </span>
        {onDiscard && (
          <button className="icon-btn oc-discard" onClick={onDiscard} title="Discard changes" aria-label={`Discard changes to ${file.path}`}>
            <RevertIcon />
          </button>
        )}
        {tools}
        <label title="Mark this file as viewed">
          <input type="checkbox" checked={viewed} onChange={onToggleViewed} /> Viewed
        </label>
      </header>
      {!viewed && body}
    </section>
  );
}

export const STATUS_LETTER: Record<FileDiff["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  type_changed: "T",
  untracked: "U",
};
