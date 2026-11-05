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

## OpenConductor

- `src-tauri/src/diff/discard.rs` (`discard_file`) and the
  `diff_discard_file` command; tests in `git_tests.rs` (`mod discard`).
- `src/features/diff/DiscardDialog.tsx`, wired in `DiffViewer.tsx` and
  `FileDiffView.tsx`.
- Differences: works on a detached HEAD (our base is `merge-base HEAD
  <base>`); refuses paths that are absolute or contain `..`; no context note
  to the agent yet (no chat attachment path exists), and no context-menu
  entry yet (the changes list has no context menu).
