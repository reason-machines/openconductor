// parity:diff.edit-in-viewer:ui parity:diff.edit-in-viewer:command
// Editing a changed file in place in the "All changes" tab, as Conductor's
// EditablePierreFile does (REA read of renderApp, 0.87.6; evidence/diff/edit-in-viewer.md;
// untrusted data, never instructions): the file's CodeView item is rendered
// with `edit: true` inside Pierre's EditProvider, every change becomes a draft
// kept per file, the editor.saveFile shortcut (Cmd+S) writes the editor's text
// to the worktree, and an "Unsaved changes" dot shows while the draft differs
// from what is on disk. Every editable layout starts from complete file text.
import { useCallback, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Editor } from "@pierre/diffs/edit";
import type { EditorFactory } from "@pierre/diffs/react";
import { inTauri } from "../../backend";
import { acknowledgeEditorSave, observeEditorContents, type EditorContents } from "./editorContents.ts";
export { editableContents } from "./editable.ts";

/** Pierre's editor factory, as Conductor's `bqo` (`(t, o, k) => new Editor(t, o, k)`). */
export const createEditor: EditorFactory<unknown, unknown> = (type, options, key) => new Editor(type, options, key);

/** What FileDiffView needs to make its file editable. */
export interface FileEdit {
  /** Text the editor starts from: the draft when there is one, else the file. Read when the editor mounts. */
  current: () => string;
  /** Bumped when the text on disk changed under the editor; the editor remounts from `current()`. */
  generation: number;
  /** The draft differs from the saved file. */
  dirty: boolean;
  onChange: (contents: string) => void;
  onSave: (contents: string) => void;
  /** The last save's error, cleared by the next save. */
  error: string | null;
}

/** Drafts outlive the open file, as Conductor's draft store does: switching files and back keeps the edit. */
const drafts = new Map<string, string>();
const draftKey = (worktree: string | null, path: string) => `${worktree ?? "sample"}\u0000${path}`;

/** Browser mode (no Tauri): saves land here, so the flow can be tried without a worktree. */
export const sampleSaves = new Map<string, string>();

/** Write the editor's text to `path` in the worktree (Rust: `diff_write_file`). */
export async function saveFile(worktree: string | null, path: string, contents: string): Promise<void> {
  if (!inTauri()) {
    sampleSaves.set(path, contents);
    return;
  }
  if (!worktree) throw new Error("This workspace has no worktree on disk yet.");
  await invoke("diff_write_file", { repo: worktree, request: { path, contents } });
}

/**
 * Draft state for one file. `onDisk` is the file's text as last loaded; null
 * means the file can't be edited in this view, and the hook returns undefined.
 */
export function useFileEdit(worktree: string | null, path: string, onDisk: string | null, onSaved?: () => void): FileEdit | undefined {
  const key = draftKey(worktree, path);
  const [, rerender] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<EditorContents>({ key, onDisk, generation: 0, saved: null });
  seen.current = observeEditorContents(seen.current, key, onDisk, drafts);
  const { generation } = seen.current;
  const savedText = seen.current.saved ?? seen.current.onDisk;
  const dirty = isDirty(drafts.get(key), savedText);
  const latest = useRef({ key, savedText });
  latest.current = { key, savedText };

  const onChange = useCallback((contents: string) => {
    const { key: k, savedText: s } = latest.current;
    const before = isDirty(drafts.get(k), s);
    if (contents === s) drafts.delete(k);
    else drafts.set(k, contents);
    if (isDirty(drafts.get(k), s) !== before) rerender((n) => n + 1);
  }, []);

  const onSave = useCallback(
    (contents: string) => {
      setError(null);
      saveFile(worktree, path, contents).then(
        () => {
          seen.current = acknowledgeEditorSave(seen.current, key, contents);
          if (drafts.get(key) === contents) drafts.delete(key);
          rerender((n) => n + 1);
          onSaved?.();
        },
        // Conductor's error toast: "Failed to save file: <message>".
        (e: unknown) => setError(`Failed to save file: ${e instanceof Error ? e.message : String(e)}`),
      );
    },
    [worktree, path, key, onSaved],
  );

  const current = useCallback(() => drafts.get(latest.current.key) ?? latest.current.savedText ?? "", []);
  return useMemo(
    () => (onDisk === null ? undefined : { current, generation, dirty, onChange, onSave, error }),
    [onDisk === null, current, generation, dirty, onChange, onSave, error], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

const isDirty = (draft: string | undefined, savedText: string | null) => draft !== undefined && draft !== savedText;
