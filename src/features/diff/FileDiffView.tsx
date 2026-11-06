// parity:diff.file-render:ui parity:diff.split-unified:ui parity:diff.viewed:ui parity:diff.virtualized:ui
// One changed file in the "All changes" tab. The code is drawn by Pierre's
// diff library with the options Conductor's diff tab passes it (REA, 0.87.6):
// no Pierre file header (ours carries Viewed and discard), Pierre themes,
// "line-info-basic" separators expanding 20 lines per click, lines wrapped or
// scrolled by the Wrap lines toggle (the wrap_lines setting, on by default),
// number-column hover, and a comment started from the gutter button or by
// dragging across line numbers, the picked lines highlighted while it is
// written (enableLineSelection with a controlled selection).
// Like Conductor, the file is one item of a Pierre CodeView, which renders only
// the rows in and near the viewport, so a long diff stays cheap to show.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { processFile, type CodeViewItem, type CodeViewLineSelection, type SelectedLineRange, type ThemeTypes } from "@pierre/diffs";
import { CodeView, EditProvider, type CodeViewHandle, type CodeViewReactOptions } from "@pierre/diffs/react";
import { WhitespaceOnly } from "./Whitespace";
import { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs, matchesEvent } from "../../keybindings/shortcut.ts";
import { createEditor, type FileEdit } from "./EditInViewer.ts";
import { CommentNav, useCommentNavigation } from "./CommentNav";
import { RevertIcon } from "./DiscardDialog";
import type { CommentSide } from "./comments.ts";
import { type Anchor, CODE_VIEW_LAYOUT, EXPANSION_LINE_COUNT, type LineRange, codeViewItem, fromPierreSide, lineTarget, loadedFiles, rangeOf, selectionOf, toPatch } from "./pierre.ts";
import type { DiffLayout, FileDiff } from "./types.ts";
import { useDiffTheme } from "./useDiffTheme.ts";

export type LineAnchor = Anchor;
export type { LineRange };

interface Props {
  file: FileDiff;
  layout: DiffLayout;
  ignoreWhitespace: boolean;
  /** Wrap long lines instead of scrolling them sideways. */
  wrapLines: boolean;
  viewed: boolean;
  onToggleViewed: () => void;
  /** The gutter button on a line, or a drag across line numbers, starts a comment on those lines. */
  onLineClick?: (range: LineRange) => void;
  /** Lines a comment is being written on, kept highlighted until it is saved or cancelled. */
  selected?: LineRange | null;
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
  /** Turn hidden whitespace back on (the whitespace-only empty state's link). */
  onShowWhitespace?: () => void;
  /** Make the entire-file view an editor (EditInViewer.ts); absent where the file can't be edited. */
  edit?: FileEdit;
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

/** Scrollers of the file views on screen, by path, so a comment jump can bring an unrendered line into view. */
const revealers = new Map<string, (anchor: LineAnchor) => void>();

/**
 * Scroll the open diff of `path` so `anchor`'s line is centred, rendering it if
 * it was outside the virtualized window. False when that file is not open.
 */
export function revealLine(path: string, anchor: LineAnchor): boolean {
  const reveal = revealers.get(path);
  reveal?.(anchor);
  return reveal !== undefined;
}

function Code({ file, layout, ignoreWhitespace, wrapLines, onLineClick, selected = null, anchors = [], annotations, loadFull, edit }: Props) {
  const themeType = useThemeType();
  const theme = useDiffTheme();
  const view = useRef<CodeViewHandle<LineAnchor, undefined> | null>(null);
  // The handle in state too, so comment navigation subscribes once the CodeView exists.
  const [handle, setHandle] = useState<CodeViewHandle<LineAnchor, undefined> | null>(null);
  const attach = useCallback((h: CodeViewHandle<LineAnchor, undefined> | null) => {
    view.current = h;
    setHandle(h);
  }, []);
  const nav = useCommentNavigation(handle, file.path, anchors);
  const refreshNav = useRef(nav.refresh);
  refreshNav.current = nav.refresh;
  // Pierre upgrades this object in place when it loads the full file, so keep it per file.
  const meta = useMemo(() => processFile(toPatch(file), { isGitDiff: true }), [file]);

  // CodeView redraws whenever its options or items change identity: keep callbacks behind refs
  // and bump the item's version only when what it shows changes (as Conductor's tab does).
  const latest = useRef({ onLineClick, loadFull });
  latest.current = { onLineClick, loadFull };
  const clickable = onLineClick !== undefined;
  const canLoad = loadFull !== undefined;
  const shown = useCodeViewItem(file, meta, layout, anchors);
  // Editing (Conductor's EditablePierreFile): the file item with `edit: true`, starting from the draft.
  // Pierre's edit session keeps its own document across item updates; a new `generation` remounts it.
  const editing = edit !== undefined && shown.type === "file";
  const latestEdit = useRef(edit);
  latestEdit.current = edit;
  const item = useMemo<CodeViewItem<LineAnchor>>(
    () => (editing && shown.type === "file" ? { ...shown, file: { ...shown.file, contents: latestEdit.current!.current() }, edit: true } : shown),
    [shown, editing],
  );
  const onEditChange = useCallback((e: { file: { contents: string } }) => latestEdit.current?.onChange(e.file.contents), []);
  const { overrides } = useKeybindingOverrides();
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Only the save shortcut: other keys belong to the editor, CommentNav and the comment box.
    if (!editing || !effectiveShortcuts("editor.saveFile", overrides).some((s) => matchesEvent(s, e.nativeEvent))) return;
    e.preventDefault();
    const contents = view.current?.getEditor(file.path)?.getFile()?.contents ?? latestEdit.current!.current();
    latestEdit.current!.onSave(contents);
  };
  const fileSide: CommentSide = item.type === "file" && file.status === "deleted" ? "old" : "new";
  const wholeFile = layout === "file";

  // Pierre shows the selection we hand it: follow its drags, and the parent's comment range once one is open.
  const [selection, setSelection] = useState<CodeViewLineSelection | null>(null);
  const selectedKey = selected ? `${selected.side}:${selected.start}:${selected.line}` : "";
  useEffect(() => {
    setSelection(selected ? { id: file.path, range: selectionOf(selected, wholeFile) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, file.path, wholeFile]);

  const options = useMemo<CodeViewReactOptions<LineAnchor, undefined>>(
    () => ({
      disableFileHeader: true,
      layout: CODE_VIEW_LAYOUT,
      overflow: wrapLines ? "wrap" : "scroll",
      theme,
      themeType,
      lineHoverHighlight: "number",
      enableGutterUtility: clickable,
      enableLineSelection: clickable,
      onGutterUtilityClick: clickable ? (r: SelectedLineRange) => latest.current.onLineClick?.(rangeOf(r, wholeFile ? fileSide : fromPierreSide(r.side))) : undefined,
      onLineSelectionEnd: clickable
        ? (r: SelectedLineRange | null) => {
            if (r) latest.current.onLineClick?.(rangeOf(r, wholeFile ? fileSide : fromPierreSide(r.side)));
          }
        : undefined,
      diffStyle: layout === "split" ? "split" : "unified",
      hunkSeparators: "line-info-basic",
      expansionLineCount: EXPANSION_LINE_COUNT,
      loadDiffFiles: canLoad ? async () => loadedFiles(await latest.current.loadFull!()) : undefined,
      parseDiffOptions: ignoreWhitespace ? { ignoreWhitespace: true } : undefined,
      // Rows (and comment heights) settle after a render: re-count the comments then.
      onPostRender: () => refreshNav.current(),
    }),
    [theme, themeType, clickable, canLoad, layout, wholeFile, fileSide, ignoreWhitespace, wrapLines],
  );

  useEffect(() => {
    const reveal = (a: LineAnchor) => view.current?.scrollTo(lineTarget(file.path, a, layout === "file"));
    revealers.set(file.path, reveal);
    return () => {
      if (revealers.get(file.path) === reveal) revealers.delete(file.path);
    };
  }, [file.path, layout]);

  if (!meta && layout !== "file") return <div className="oc-file-note">This diff couldn't be displayed.</div>;
  const code = (
    <CodeView<LineAnchor>
      ref={attach}
      className="oc-code-view"
      items={[item]}
      options={options}
      selectedLines={selection}
      onSelectedLinesChange={setSelection}
      onItemEditChange={editing ? onEditChange : undefined}
      onItemEditComplete={editing ? acceptEdit : undefined}
      renderAnnotation={(...[a]) => annotations?.(a.metadata!)}
    />
  );
  return (
    <>
      {editing ? (
        <div className="oc-code-edit" onKeyDown={onKeyDown}>
          <EditProvider createEditor={createEditor}>{code}</EditProvider>
        </div>
      ) : (
        code
      )}
      <CommentNav previousCount={nav.previousCount} nextCount={nav.nextCount} navigate={nav.navigate} />
    </>
  );
}

/** An ended edit session keeps its text, as Conductor's onItemEditComplete accepts it. */
const acceptEdit = () => "accept" as const;

/** The one CodeView item, rebuilt (with a bumped version) only when the file, layout or anchors change. */
function useCodeViewItem(file: FileDiff, meta: ReturnType<typeof processFile>, layout: DiffLayout, anchors: LineAnchor[]): CodeViewItem<LineAnchor> {
  const signature = JSON.stringify(anchors);
  const version = useRef({ file, layout, signature, n: 0 });
  const v = version.current;
  if (v.file !== file || v.layout !== layout || v.signature !== signature) version.current = { file, layout, signature, n: v.n + 1 };
  const n = version.current.n;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => codeViewItem(file, meta, layout, anchors, n), [file, meta, layout, n]);
}

export function FileDiffView(props: Props) {
  const { file, ignoreWhitespace, viewed, onToggleViewed, onDiscard, tools, onShowWhitespace, edit } = props;
  let body: ReactNode;
  if (file.binary) body = <div className="oc-file-note">Binary file not shown.</div>;
  else if (file.hunks.length === 0)
    body = ignoreWhitespace ? <WhitespaceOnly onShow={onShowWhitespace} /> : <div className="oc-file-note">No content changes in this file.</div>;
  else
    body = (
      <div className="oc-code-scroll">
        <Code key={edit?.generation ?? 0} {...props} />
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
        {edit?.dirty && <span className="oc-unsaved" role="img" aria-label="Unsaved changes" title="Unsaved changes" />}
        {tools}
        <ViewedToggle viewed={viewed} onToggle={onToggleViewed} />
      </header>
      {edit?.error && (
        <div className="oc-file-note oc-save-error" role="alert">
          {edit.error}
        </div>
      )}
      {!viewed && body}
    </section>
  );
}

/** Conductor's viewed toggle tooltip, which says what a click does. */
export const viewedLabel = (viewed: boolean): string => (viewed ? "Mark as not viewed" : "Mark as viewed");

/** Conductor's ghost "Viewed" button: a check box icon and the word, tooltip with the toggle's shortcut. */
function ViewedToggle({ viewed, onToggle }: { viewed: boolean; onToggle: () => void }) {
  const { overrides } = useKeybindingOverrides();
  const key = effectiveShortcuts("diff.toggleViewed", overrides)[0];
  const label = viewedLabel(viewed);
  return (
    <button type="button" className="oc-viewed" aria-pressed={viewed} aria-label={label} title={key ? `${label} (${glyphs(key)})` : label} onClick={onToggle}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
        {viewed && <path d="M5.5 8.2l1.8 1.8 3.4-4" />}
      </svg>
      Viewed
    </button>
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
