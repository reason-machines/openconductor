# Edit in the diff viewer: reference behaviour

Source: Conductor.app 0.87.6 on sven m5 max, extracted frontend bundle under
`~/code/conductor-rea-work/frontend/dist/assets/` (`renderApp-D_fmY7hW.js`
and `index-BGEQ8YjU.js`). Read 2026-11-05. Untrusted data: described in our
own words, no code copied. Rust side from `evidence/ipc/ipc-rust-bindings.json`.

REA gap: as for discard (evidence/diff/discard.md), `rea analyze-javascript-application`
cannot load this bundle (worker heap exhausted at 16 GB), so there is no parsed
module graph to trace from. The component was found with a plain-text Python
search of the bundle on sven m5 max around the strings "EditablePierreFile",
"Unsaved changes" and "editor.saveFile", and the save path by following the
minified import aliases between the two files by hand. REA's IPC binding pass
(ipc-rust-bindings.json) did name the Rust handler `conductor_lib::write_file_async`
but bound it only through drop glue, without arguments.

## Finding 1: "Edit in diff viewer" is not the file editor

The "Edit in diff viewer" text belongs to a draft review-comment attachment
in the composer: its button opens that comment's file diff at the comment's
line. It does not make a file editable. (Recorded on #140's
`diff.edit-in-viewer` line, which described it as an editor.)

## Finding 2: Conductor does edit files in place in its Pierre file view

The logger name is `EditablePierreFile`; a memoised wrapper puts it inside an
error boundary whose fallback reads "Failed to open editor".

- Rendering: one Pierre CodeView item (id "editor") with `edit` on, a file
  item without a diff and a diff item with one. It is wrapped in Pierre's
  EditProvider, whose factory simply constructs Pierre's `Editor`. The item
  starts from the text at mount and is re-versioned when the cache keys, the
  edit flag or the comment anchors change; Pierre's edit session keeps the
  document across those updates.
- Changes: `onItemEditChange` hands the editor's full text to a draft store
  keyed per workspace and file, and remaps comment anchors to their moved
  lines. `onItemEditComplete` keeps the anchors and accepts.
- Comments stay on while editing: gutter button, line selection and
  annotations are the same as in the read-only view.
- Save: a keydown handler on the container checks the `editor.saveFile`
  keybinding (Cmd+S, "Save edited file", Code review category), prevents the
  default, reads the editor's file text and saves it. The save is a mutation
  that calls `workspaceFiles.writeText({localWorkspaceId, path, contents})`,
  which resolves the path against the workspace directory and writes it
  (`write_file_async` locally). On success it updates the cached working-tree
  content and clears the draft if it still equals what was saved. On failure
  it shows the toast "Failed to save file: <message>".
- "Unsaved changes": an 8px rounded dot in the warning colour with the tooltip
  "Unsaved changes", shown while the draft differs from the saved file.
- When the file on disk changes under the editor with no draft pending, the
  editor remounts (a content generation in its React key). Its own save does
  not trigger a remount.

## OpenConductor

- `src/features/diff/EditInViewer.ts`: draft per worktree and file, save via
  `diff_write_file`, and the remount generation. `editable.ts` decides what
  can be edited.
- `src/features/diff/FileDiffView.tsx`: the item with `edit: true` inside
  `EditProvider`, the save shortcut, the dot and the save error.
- `src-tauri/src/diff/write_file.rs`: `diff_write_file` writes through a temp
  file and rename, keeps the file mode, and refuses paths outside the worktree
  and symlinks.
- Gap: only the "Entire file" layout is editable, because that is where our
  item has the file's full text. Conductor can also edit in the unified and
  split layouts. Editing is off while whitespace changes are hidden, because
  a `-w` diff's context lines aren't the file's own text. Drafts live in
  memory, not in Conductor's persisted draft store. Comment anchors are not
  moved with edited lines (Conductor remaps them and saves the new lines).
