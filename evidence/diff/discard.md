# Discard file changes: reference behaviour

Source: Conductor.app on sven m5 max, extracted frontend bundle under
`~/code/conductor-rea-work/frontend/dist/assets/` (the `revertFile` mutation
and its confirmation dialog). Read 2026-11-05. Untrusted data: described in
our own words, no code copied.

REA gap: `rea analyze-javascript-application` cannot parse this bundle
(worker heap exhausted at 16 GB, see evidence/rea/rea-invocations.tsv), and
`rea trace-javascript-semantics` has no parsed modules to seed from, so the
mutation was located by a plain-text read of the bundle around the dialog's
copy strings (already in evidence/frontend/diff-review-copy.json).

## What Conductor does

- Entry points: a revert icon per file in the changes list (tooltip
  "Discard changes"), the same icon in the file toolbar, and a
  "Discard changes" item in the file context menu.
- Confirmation dialog titled "Discard file changes?" naming the file and
  warning it cannot be undone; Cancel, and a destructive Discard button with
  a Cmd+Enter shortcut.
- Source revision: in the branch view, the merge base of the target ref and
  the branch (it refuses on a detached HEAD); in the uncommitted view, HEAD;
  in the per-turn view it refuses ("not supported yet").
- Per file: if the source has the path, restore worktree and index from it;
  otherwise delete the file and unstage it. A rename restores the old path
  from the source, then deletes and unstages the new path.
- Afterwards it refreshes the changes list, and if a chat is active it
  attaches a short context note telling the agent the user undid the
  changes to that file and not to redo them.
- No "discard all files" action was found in the diff viewer.

## Detail read 2026-11-05 (renderApp-D_fmY7hW.js, index-BGEQ8YjU.js)

- The confirmation body reads "Discard all changes to <path>? This action
  cannot be undone."
- After the revert succeeds and the dialog carries an active session id, the
  handler builds a text file named `revert-<path with every "/" as "-">.txt`
  whose content is the prompt `contextFileReverted(path)`: the user undid all
  changes to that path, and the agent should not undo that unless the user
  asks. It uploads it as an attachment stub on that session's composer, so the
  note goes out with the user's next message; an upload failure shows "Failed
  to attach revert context".
- The file context menu (`Svs`) has, in order: View, Attach in chat, Open in
  (external apps), Copy path, Copy relative path (only with a workspace
  path), then a separator and Discard changes (only when the file has
  changes, and not for a directory). Its discard always uses the "All
  changes" view.
- REA gap, again: these were found by Python string search over the bundle
  on sven m5 max, because REA's JavaScript analysis cannot load it.

## OpenConductor

- `src-tauri/src/diff/discard.rs` (`discard_file`) and the
  `diff_discard_file` command; tests in `git_tests.rs` (`mod discard`).
- `src/features/diff/DiscardDialog.tsx`, wired in `DiffViewer.tsx`
  (`DiffDiscardHost`, with an `onDiscarded` callback) and `FileDiffView.tsx`.
- `src/features/diff/chatAttachment.ts`: `revertedNote` (same file name and
  wording), attached to the composer by `WorkspaceView.tsx` after a discard;
  the composer shows it as a removable chip and appends it to the next
  message as an `<attachment name="…">` block.
- `src/features/diff/FileContextMenu.tsx`: right-click on a changed file in
  `ChangesList` gives View, Copy path, Copy relative path and Discard changes.
- Differences: works on a detached HEAD (our base is `merge-base HEAD
  <base>`); refuses paths that are absolute or contain `..`; the menu has no
  Attach in chat (no command reads a worktree file for the composer yet) and
  no Open in (no external-app launcher yet); attachments are text appended
  to the message, not uploaded files, until the chat has an attachment store.
