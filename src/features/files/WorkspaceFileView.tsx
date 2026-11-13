import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CodeViewItem, ThemeTypes } from "@pierre/diffs";
import { CodeView, EditProvider, type CodeViewHandle, type CodeViewReactOptions } from "@pierre/diffs/react";
import { inTauri } from "../../backend";
import { Tooltip } from "../../components/ui/Tooltip.tsx";
import { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { matchesEvent } from "../../keybindings/shortcut.ts";
import { isTextPath } from "../diff/copyFile.ts";
import { createEditor, useFileEdit, waitForFileSaves, type FileEdit } from "../diff/EditInViewer.ts";
import { FilePathChip } from "../diff/FilePathChip";
import { CODE_VIEW_LAYOUT } from "../diff/pierre.ts";
import { useDiffTheme } from "../diff/useDiffTheme.ts";
import { ViewOptionsMenu } from "../diff/Whitespace";
import { readText, type TextRead } from "./readText.ts";
import "../diff/diff.css";
import "./workspaceFile.css";

export interface WorkspaceFileViewProps {
  worktree: string;
  path: string;
  isVisible: boolean;
  readOnly: boolean;
}

export function WorkspaceFileView(props: WorkspaceFileViewProps) {
  return <WorkspaceFile key={JSON.stringify([props.worktree, props.path, props.readOnly])} {...props} />;
}

function WorkspaceFile({ worktree, path, isVisible, readOnly }: WorkspaceFileViewProps) {
  const [load, setLoad] = useState<TextRead>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [wrapLines, setWrapLines] = useState(true);
  const textPath = isTextPath(path);
  useEffect(() => {
    if (!textPath) return;
    let current = true;
    const cancel = readText(async () => {
      if (!inTauri()) throw new Error("Reading workspace files needs the desktop app.");
      await waitForFileSaves(worktree, path);
      if (!current) throw new Error("Workspace file read was replaced");
      const text: unknown = await invoke("workspace_read_text", { repo: worktree, path });
      if (typeof text !== "string") throw new Error("Invalid workspace text response");
      return text;
    }, setLoad);
    return () => { current = false; cancel(); };
  }, [worktree, path, textPath, attempt]);
  const text = textPath && load.kind === "ready" ? load.text : null;
  const edit = useFileEdit(worktree, path, readOnly ? null : text);
  return (
    <section className="workspace-file-view" aria-label={`File ${path}`} hidden={!isVisible}>
      <header className="oc-file-header">
        <div className="oc-file-lead">
          <FilePathChip path={path} worktree={worktree} />
          {edit?.dirty && <Tooltip content="Unsaved changes"><span className="oc-unsaved" role="img" aria-label="Unsaved changes" /></Tooltip>}
        </div>
        <div className="oc-file-actions">
          {readOnly && <span className="muted">Read only</span>}
          {textPath && <ViewOptionsMenu textWrap={{ wrapLines, onChange: setWrapLines }} />}
        </div>
      </header>
      {edit?.error && <div className="oc-file-note oc-save-error" role="alert">{edit.error}</div>}
      {!textPath ? <p className="oc-file-note">This file cannot be displayed as text. Open it externally.</p> :
        load.kind === "loading" ? <p className="oc-file-note" role="status">Loading file…</p> :
        load.kind === "error" ? <div className="oc-file-note" role="alert">{load.message} <button className="link-btn" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div> :
        <WorkspaceTextCode key={`${edit !== undefined}:${edit?.generation ?? 0}`} path={path} text={load.text} edit={edit} isVisible={isVisible} wrapLines={wrapLines} />}
    </section>
  );
}

function useThemeType(): ThemeTypes {
  const read = (): ThemeTypes => {
    const type = document.documentElement.dataset.theme;
    return type === "light" || type === "dark" ? type : "system";
  };
  const [type, setType] = useState<ThemeTypes>(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setType(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return type;
}

function WorkspaceTextCode({ path, text, edit, isVisible, wrapLines }: {
  path: string;
  text: string;
  edit: FileEdit | undefined;
  isVisible: boolean;
  wrapLines: boolean;
}) {
  const view = useRef<CodeViewHandle<never, undefined> | null>(null);
  const initial = useRef(edit?.current() ?? text);
  const item = useMemo<CodeViewItem<never>>(() => ({
    id: path,
    type: "file",
    file: { name: path, contents: initial.current },
    version: 0,
    edit: edit !== undefined,
  }), [path, edit !== undefined]);
  const theme = useDiffTheme();
  const themeType = useThemeType();
  const options = useMemo<CodeViewReactOptions<never, undefined>>(() => ({
    disableFileHeader: true,
    layout: CODE_VIEW_LAYOUT,
    overflow: wrapLines ? "wrap" : "scroll",
    theme,
    themeType,
    lineHoverHighlight: "number",
  }), [theme, themeType, wrapLines]);
  const { overrides } = useKeybindingOverrides();
  const code = <CodeView<never>
    ref={view}
    className="oc-code-view"
    items={[item]}
    options={options}
    onItemEditChange={edit ? (event) => edit.onChange(event.file.contents) : undefined}
    onItemEditComplete={edit ? () => "accept" : undefined}
  />;
  return <div className="workspace-file-code" onKeyDown={(event) => {
    if (!edit || !isVisible || !effectiveShortcuts("editor.saveFile", overrides).some((shortcut) => matchesEvent(shortcut, event.nativeEvent))) return;
    event.preventDefault();
    edit.onSave(view.current?.getEditor(path)?.getFile()?.contents ?? edit.current());
  }}>
    {edit ? <EditProvider createEditor={createEditor}>{code}</EditProvider> : code}
  </div>;
}
