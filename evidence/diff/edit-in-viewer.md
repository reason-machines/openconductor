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
at that correction still owns draft storage, conditional draft clearing and save I/O.

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

## Pending-save draft producer correction (2026-11-10)

This is a separate follow-on to the refresh correction in #855, not a
regression introduced by it. The unguarded change callback already removed a
draft whenever the text matched the old disk baseline, even while a different
write was pending. The callback was byte-identical before and after #855.

The complete inert `Dqo` read identified above explicitly stores a present
draft while its save mutation is pending, including text equal to the old
baseline. Success clears only a draft still equal to the submitted text. This
is retained source proof, not observed reference running behavior, a claim
about the mutation library's scheduling, or concurrency equivalence. No new
REA extraction or evaluation of reference application code was performed.
The earlier REA bundle-heap and IPC-binding gaps remain unchanged.

`EditorDraftState` now shares the existing contents map with the refresh
transition and `current()`, plus a per-key pending-save count.
`changeEditorDraft` owns the real draft mutation, and `persistEditorDraft`
owns the async write boundary, conditional success cleanup and pending-count
release in `finally`. The hook calls these operations directly. It keeps the
error-clear, file write, current-key save acknowledgement, rerender, saved
notification and error-notification order. Its dirty-before/after rerender
check and the existing refresh guards are unchanged. Counts preserve the
existing concurrent writes without serialization or a new write-order promise.

Production-imported reproduction, run on the Reason cloud computer with Node
22.23.4 and no installed dependencies:

- RED commit `67ebd84c4ce1091433bc3e63cbc8154e95564527` extracted the old
  unguarded change behavior and wired the actual async save operation into
  the hook. `node --experimental-strip-types --test
  src/features/diff/editorContents.test.ts` exited 1: 20 passed, 6 failed.
  Both nonempty and intentional-empty old-baseline tests recorded absent
  drafts before and after the deferred write resolved, where present drafts
  were expected. Four file/worktree and concurrent-save cases failed for
  the same missing pending guard. All 13 original controls passed.
- GREEN used the same tests unchanged after adding the pending guard:
  26 passed, 0 failed, exit 0. All 13 original test bodies remain
  byte-identical to starting main `e92b5dd8f6e0655766d4360e8b24c255907a3a42`.
- The tests import the production mutation and persistence operations, not
  copied callbacks, a fake React facade or a mutation proxy. Deferred write
  promises exercise old-baseline retention, success, newer edits, rejection,
  synchronous pending establishment, file/worktree isolation, and immediately
  started concurrent saves in both completion orders. The old-baseline tests
  also acknowledge and observe the saved content, consume the acknowledgement
  without a generation change, retain the draft, and clear it on a later idle
  edit to the new baseline.
- `node --experimental-strip-types --test
  src/features/diff/{editorContents,changesTree,nav,target,viewed}.test.ts`
  passed 49 of 49. `git diff --check` passed.
- A broader adjacent command adding `EditInViewer.test.ts` was partial:
  49 tests passed, but that module could not load because `@pierre/diffs`
  was not installed. No dependency installation was admitted; the normal
  Diff frontend CI job runs all diff tests with dependencies.
- Five temporary mutations were caught by the same 26-test suite: removing
  the pending guard (6 failures), treating an empty draft as absent in the
  refresh guard (1), unconditional success clearing (7), clearing another
  key on success (2), and releasing pending state before write settlement
  (6). Every mutation was restored; no mutation variant is committed.

This verifies production-imported operations only. Hook mounting, Pierre
continuity, save IPC, native behavior and visual parity remain NOT RUN.
No local app launch, browser/native run, app build or heavy dependency
installation was admitted, so there are no screenshots for this correction.
Automatic PR CI and the containing-main macOS package are separate receipts.

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
