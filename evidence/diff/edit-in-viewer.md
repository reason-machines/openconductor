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

## Pending-draft refresh correction (2026-11-10)

The complete retained Conductor 0.87.6 renderer is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
Literal complete-function reads, not evaluated code, establish this chain:

- `Dqo`, UTF-8 bytes `[9636034,9637549)`, UTF-16
  `[9590506,9592021)`, SHA-256
  `e84b4c7ffc7323e35f137e86131118847873a856159170d6b39b804c06b7413e`,
  chooses a present draft before saved content. Its saved-content-change
  transition advances generation only without a draft and when the new
  content is neither the previous editor content nor its own save. It
  consumes the own-save acknowledgement when saved content changes. The
  success callback clears a draft only if it still equals the submitted text.
- `jqo`, UTF-8 bytes `[9641484,9642975)`, UTF-16
  `[9595956,9597447)`, SHA-256
  `3b57f4d3fb1c0ba90d3249cf522f66114602f79f79e85afbed10c08b16ba4741`,
  calls `Dqo`, passes its draft value to the editor, and incorporates its
  generation into the editable component key.

At main `14dc5aa889ea9f9cc0459187e6d43c475f3cbdd7`, the external
refresh branch in `useFileEdit` instead deleted any pending draft and
advanced generation. The exact original transition reproduced loss of both
nonempty and intentional-empty drafts. Clean refresh and own-save refresh
were passing controls.

`editorContents.ts` now owns the production key, observed disk content,
generation and one-shot save acknowledgement transition. A read-only draft
map makes draft presence, including an empty string, the remount guard.
Unavailable content retains the last loaded revision. A late save cannot
replace the acknowledgement for a different file or worktree. The hook
still owns draft storage, conditional draft clearing and save I/O.

Verification is source/unit only:

- `node --experimental-strip-types --test
  src/features/diff/editorContents.test.ts`: the extracted old refresh
  behavior failed 8 of 13 assertions. Both draft cases failed directly.
  After correction, all 13 pass.
- Cases include clean external refresh, present draft equal to the new
  disk text, loading gaps, empty loaded files, own-save refresh, edits
  during save, stale acknowledgement consumption and file/worktree switches.
- The new tests plus unchanged Changes tree, comment navigation, target-ref
  and viewed-state tests pass 36 of 36. Four temporary mutations are caught:
  removing the draft guard, using truthiness for an empty draft, retaining
  a stale acknowledgement, and accepting another key's save acknowledgement.
- No React facade or retained application code is executed. These tests do
  not exercise hook mounting, Pierre document continuity, save IPC, native
  admission or clipboard behavior. No dependency install, app build, new
  REA extraction, browser run or native run was performed.

## OpenConductor

- `src/features/diff/EditInViewer.ts`: draft per worktree and file, save via
  `diff_write_file`, and the remount generation. `editable.ts` decides what
  can be edited.
- `src/features/diff/FileDiffView.tsx`: the item with `edit: true` inside
  `EditProvider`, the save shortcut, the dot and the save error.
- `src-tauri/src/diff/write_file.rs`: `diff_write_file` writes through a temp
  file and rename, keeps the file mode, and refuses paths outside the worktree
  and symlinks.
- Unified and split layouts now wait for the existing whole-file-context load
  before enabling Pierre's diff-item editor. The item starts from the complete
  draft and unchanged old side, never the visible patch alone. Switching layouts
  remounts the appropriate editor type without dropping the retained draft while
  the next full-content load is pending. Historical commits and turns stay read-only.
- Editing remains off while whitespace changes are hidden, because a `-w`
  diff's context lines aren't the file's own text. Drafts live in memory, not
  in Conductor's persisted draft store. Comment anchors are not moved with
  edited lines (Conductor remaps them and saves the new lines).
- Source regression: `node --experimental-strip-types --test
  src/features/diff/EditInViewer.test.ts` failed both new unified/split cases
  before the change. After the change it covers complete text, untouched
  prefix/suffix, missing final newline, renamed and added files, annotation
  retention and rejection of partial documents. This is source/unit proof,
  not a mounted edit/save or layout-switch receipt. Browser and native
  acceptance, including draft retention across layout switches, remain NOT RUN.
