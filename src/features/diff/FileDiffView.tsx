// parity:diff.file-render:ui parity:diff.split-unified:ui parity:diff.viewed:ui parity:diff.virtualized:ui
// One changed file in the "All changes" tab. The code is drawn by Pierre's
// diff library with the options Conductor's diff tab passes it (REA, 0.87.6):
// no Pierre file header (ours carries Viewed, discard and copy), Pierre themes,
// "line-info-basic" separators expanding 20 lines per click, lines wrapped or
// scrolled by the Wrap lines toggle (the wrap_lines setting, on by default),
// number-column hover, and a comment started from the gutter button or by
// dragging across line numbers, the picked lines highlighted while it is
// written (enableLineSelection with a controlled selection).
// Like Conductor, the file is one item of a Pierre CodeView, which renders only
// the rows in and near the viewport, so a long diff stays cheap to show.
import { Tooltip } from "../../components/ui/Tooltip.tsx";
import { CheckIcon, CopyIcon } from "../../components/Icons.tsx";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";
import { clipboardHtml, COPIED_MS, copySource } from "./copyFile.ts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { processFile, type CodeViewItem, type CodeViewLineSelection, type SelectedLineRange, type ThemeTypes } from "@pierre/diffs";
import { CodeView, EditProvider, type CodeViewHandle, type CodeViewReactOptions } from "@pierre/diffs/react";
import { WhitespaceOnly } from "./Whitespace";
import { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { matchesEvent } from "../../keybindings/shortcut.ts";
import { createEditor, type FileEdit } from "./EditInViewer.ts";
import { CommentNav, useCommentNavigation } from "./CommentNav";
import { RevertIcon } from "./DiscardDialog";
import { FilePathChip } from "./FilePathChip";
import type { CommentAnchorPositions, CommentSide } from "./comments.ts";
import { type Anchor, CODE_VIEW_LAYOUT, EXPANSION_LINE_COUNT, type LineRange, codeViewItem, editableCodeViewItem, fromPierreSide, fullDiffMeta, lineTarget, loadedFiles, rangeOf, selectionOf, toPatch } from "./pierre.ts";
import type { DiffLayout, FileDiff } from "./types.ts";
import { useDiffTheme } from "./useDiffTheme.ts";

export type LineAnchor = Anchor;
export type { LineRange };
export type FileRefreshStatus = { type: "updating" } | { type: "failed"; onRetry: () => void };

interface Props {
  file: FileDiff;
  /** Inactive retained views keep their Code state but not global navigation. */
  isVisible?: boolean;
  layout: DiffLayout;
  ignoreWhitespace: boolean;
  /** Wrap long lines instead of scrolling them sideways. */
  wrapLines: boolean;
  viewed: boolean;
  onToggleViewed: () => void;
  refreshStatus?: FileRefreshStatus;
  /** The gutter button on a line, or a drag across line numbers, starts a comment on those lines. */
  onLineClick?: (range: LineRange) => void;
  /** Lines a comment is being written on, kept highlighted until it is saved or cancelled. */
  selected?: LineRange | null;
  /** Lines that have something rendered under them (comment threads, the composer). */
  anchors?: LineAnchor[];
  /** What to render under an anchored line. */
  annotations?: (anchor: LineAnchor) => ReactNode;
  onPersistAnchors?: (positions: CommentAnchorPositions) => void;
  /** This file loaded with whole-file context, for expanding unmodified lines. */
  loadFull?: () => Promise<FileDiff>;
  /** This file already loaded with whole-file context: drawn as a full diff (pierre.ts `fullDiffMeta`). */
  full?: FileDiff | null;
  /** Ask to discard this file's changes (opens the confirmation). */
  onDiscard?: () => void;
  /** Extra header controls, before the Viewed checkbox (the layout toggle). */
  tools?: ReactNode;
  /** Header controls after the Viewed checkbox (Conductor's "View options" menu). */
  options?: ReactNode;
  /** The workspace's checkout, for the path chip's "Open in". */
  worktree?: string | null;
  /** Turn hidden whitespace back on (the whitespace-only empty state's link). */
  onShowWhitespace?: () => void;
  /** Enable editing from complete current contents; absent for read-only files and history. */
  edit?: FileEdit;
  /** The whole new file, for the header's "Copy file contents" button. */
  loadText?: () => Promise<string>;
  /** Shows a toast (a failed copy). */
  notify?: (kind: "info" | "error", message: string) => void;
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

function Code({ file, full, layout, ignoreWhitespace, wrapLines, onLineClick, selected = null, anchors = [], annotations, onPersistAnchors, loadFull, edit, isVisible = true }: Props) {
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
  // With the whole file at hand it is a full diff instead, as in Conductor's tab.
  const meta = useMemo(() => (full ? fullDiffMeta(full, ignoreWhitespace) : processFile(toPatch(file), { isGitDiff: true })), [file, full, ignoreWhitespace]);

  // CodeView redraws whenever its options or items change identity: keep callbacks behind refs
  // and bump the item's version only when what it shows changes (as Conductor's tab does).
  const latest = useRef({ onLineClick, loadFull });
  latest.current = { onLineClick, loadFull };
  const clickable = onLineClick !== undefined;
  const canLoad = loadFull !== undefined;
  const shown = useCodeViewItem(full ?? file, meta, layout, anchors);
  // Pierre requires complete diff metadata before attaching its editor.
  const editing = edit !== undefined && (shown.type === "file" || !shown.fileDiff.isPartial);
  const latestEdit = useRef(edit);
  latestEdit.current = edit;
  const item = useMemo<CodeViewItem<LineAnchor>>(
    () => (editing ? editableCodeViewItem(shown, latestEdit.current!.current(), ignoreWhitespace) : shown),
    [shown, editing, ignoreWhitespace],
  );
  const movedAnchors = useRef(new Map<string, number | null>());
  const persistAnchors = useRef(onPersistAnchors);
  persistAnchors.current = onPersistAnchors;
  const observeAnchors = useCallback((annotations: Array<{ lineNumber: number; metadata?: LineAnchor }> | undefined) => {
    if (annotations === undefined) return;
    for (const id of movedAnchors.current.keys()) movedAnchors.current.set(id, null);
    for (const annotation of annotations) {
      for (const id of annotation.metadata?.commentIds ?? []) movedAnchors.current.set(id, annotation.lineNumber);
    }
  }, []);
  const onEditChange = useCallback((e: { file: { contents: string }; lineAnnotations?: Array<{ lineNumber: number; metadata?: LineAnchor }> }) => {
    latestEdit.current?.onChange(e.file.contents);
    observeAnchors(e.lineAnnotations);
  }, [observeAnchors]);
  const onEditComplete = useCallback((e: { lineAnnotations?: Array<{ lineNumber: number; metadata?: LineAnchor }> }) => {
    observeAnchors(e.lineAnnotations);
    persistAnchors.current?.(movedAnchors.current);
    return "accept" as const;
  }, [observeAnchors]);
  const { overrides } = useKeybindingOverrides();
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Only the save shortcut: other keys belong to the editor, CommentNav and the comment box.
    if (!editing || !effectiveShortcuts("editor.saveFile", overrides).some((s) => matchesEvent(s, e.nativeEvent))) return;
    e.preventDefault();
    const contents = view.current?.getEditor(file.path)?.getFile()?.contents ?? latestEdit.current!.current();
    persistAnchors.current?.(movedAnchors.current);
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
            else setSelection(null);
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
    if (!isVisible) return;
    const reveal = (a: LineAnchor) => view.current?.scrollTo(lineTarget(file.path, a, layout === "file"));
    revealers.set(file.path, reveal);
    return () => {
      if (revealers.get(file.path) === reveal) revealers.delete(file.path);
    };
  }, [file.path, layout, isVisible]);

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
      onItemEditComplete={editing ? onEditComplete : undefined}
      renderAnnotation={(...[a]) => annotations?.(a.metadata!)}
    />
  );
  return (
    <div style={{ display: "contents" }} onPointerCancelCapture={clickable ? () => setSelection(null) : undefined}>
      {editing ? (
        <div className="oc-code-edit" onKeyDown={onKeyDown}>
          <EditProvider createEditor={createEditor}>{code}</EditProvider>
        </div>
      ) : (
        code
      )}
      {isVisible && <CommentNav previousCount={nav.previousCount} nextCount={nav.nextCount} navigate={nav.navigate} />}
    </div>
  );
}

/** The one CodeView item, rebuilt (with a bumped version) only when the file, its parsed diff, layout or anchors change. */
function useCodeViewItem(file: FileDiff, meta: ReturnType<typeof processFile>, layout: DiffLayout, anchors: LineAnchor[]): CodeViewItem<LineAnchor> {
  const signature = JSON.stringify(anchors);
  const version = useRef({ file, meta, layout, signature, n: 0 });
  const v = version.current;
  if (v.file !== file || v.meta !== meta || v.layout !== layout || v.signature !== signature) version.current = { file, meta, layout, signature, n: v.n + 1 };
  const n = version.current.n;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => codeViewItem(file, meta, layout, anchors, n), [file, meta, layout, n]);
}

export function FileDiffView(props: Props) {
  const { file, ignoreWhitespace, viewed, onToggleViewed, refreshStatus, onDiscard, tools, options, worktree, onShowWhitespace, edit, loadText, notify } = props;
  const copy = copySource(file, { draft: edit?.current, loadText });
  let body: ReactNode;
  if (file.hide_reason === "file_too_large") body = <div className="oc-file-note">File too large to display</div>;
  else if (file.binary) body = <div className="oc-file-note">Binary file changed</div>;
  else if (file.hunks.length === 0)
    body = ignoreWhitespace ? <WhitespaceOnly onShow={onShowWhitespace} /> : <div className="oc-file-note">No changes in this file</div>;
  else
    body = (
      <div className="oc-code-scroll">
        <Code key={`${edit?.generation ?? 0}:${props.layout}`} {...props} />
      </div>
    );

  return (
    <section className="oc-file" id={`oc-file-${encodeURIComponent(file.path)}`} data-viewed={viewed || undefined}>
      {/* Conductor's NPo (REA, 0.87.6 @8,916,282): the path chip and the unsaved dot on the left;
          then revert, copy, the layout group, Viewed and the View options menu (its Pierre order). */}
      <header className="oc-file-header">
        <div className="oc-file-lead">
          <FilePathChip path={file.path} oldPath={file.old_path} worktree={worktree} deleted={file.status === "deleted"} notify={notify} />
          {edit?.dirty && (
            <Tooltip content="Unsaved changes">
              <span className="oc-unsaved" role="img" aria-label="Unsaved changes" />
            </Tooltip>
          )}
        </div>
        <div className="oc-file-actions">
          {onDiscard && (
            <Tooltip content="Discard changes">
              <button className="icon-btn oc-discard" onClick={onDiscard} aria-label={`Discard changes to ${file.path}`}>
                <RevertIcon />
              </button>
            </Tooltip>
          )}
          {copy && <CopyFileButton path={file.path} read={copy} notify={notify} />}
          {tools}
          {refreshStatus?.type === "updating" ? (
            <span className="oc-file-refresh-status" role="status"><span className="clone-spinner" aria-hidden />Updating…</span>
          ) : refreshStatus?.type === "failed" ? (
            <Tooltip content="Update failed. Retry">
              <button type="button" className="oc-file-refresh-status" aria-label="Update failed. Retry" onClick={refreshStatus.onRetry}>Retry update</button>
            </Tooltip>
          ) : <ViewedToggle viewed={viewed} onToggle={onToggleViewed} />}
          {options}
        </div>
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

/** Plain text plus Conductor's HTML flavour naming the path (`V$r`), falling back to plain text. */
async function writeFileToClipboard(path: string, contents: string): Promise<void> {
  const html = clipboardHtml(path, contents);
  if (inTauri()) {
    try {
      await invoke("plugin:clipboard-manager|write_html", { html, altText: contents });
    } catch {
      await invoke("plugin:clipboard-manager|write_text", { text: contents });
    }
    return;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "text/plain": new Blob([contents], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) }),
    ]);
  } catch {
    await navigator.clipboard.writeText(contents);
  }
}

/**
 * Conductor's SimpleCopyButton in the file header: a copy icon that turns into a
 * check, with the tooltip "Copied!", for two seconds after a copy.
 */
function CopyFileButton({ path, read, notify }: { path: string; read: () => Promise<string>; notify?: Props["notify"] }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    read()
      .then((contents) => writeFileToClipboard(path, contents))
      .then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
        notify?.("error", "Failed to copy");
      });
  };
  const label = "Copy file contents";
  return (
    <Tooltip content={copied ? "Copied!" : label}>
      <button type="button" className="oc-copy-file" aria-label={label} onClick={onClick}>
        {copied ? <CheckIcon size={14} strokeWidth={1.5} /> : <CopyIcon size={14} strokeWidth={1.5} />}
      </button>
    </Tooltip>
  );
}

/** Conductor's viewed toggle tooltip, which says what a click does. */
export const viewedLabel = (viewed: boolean): string => (viewed ? "Mark as not viewed" : "Mark as viewed");

/**
 * Conductor's ghost "Viewed" button (`MPo`): w-24, text-xs font-medium, a size-4 rounded-sm
 * bordered box (filled with a check once viewed) and the word; tooltip with the toggle's shortcut.
 */
function ViewedToggle({ viewed, onToggle }: { viewed: boolean; onToggle: () => void }) {
  const label = viewedLabel(viewed);
  return (
    <Tooltip content={label} shortcut="diff.toggleViewed">
      <button type="button" className="oc-viewed" aria-pressed={viewed} aria-label={label} onClick={onToggle}>
        <span className="oc-viewed-box" aria-hidden>
          {viewed && <CheckIcon size={12} />}
        </span>
        Viewed
      </button>
    </Tooltip>
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
