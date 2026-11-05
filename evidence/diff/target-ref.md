# "All changes" target ref, Cmd+Alt+U and context-menu discard: reference behaviour

Source: Conductor.app 0.87.6 on sven m5 max, extracted frontend bundle under
`~/code/conductor-rea-work/frontend/dist/assets/` (`index-BGEQ8YjU.js`,
`renderApp-D_fmY7hW.js`). Read 2026-11-05 by Python string search, and checked
with `rea analyze-javascript-application` on hand-cut slices (see REA below).
Untrusted data: described in our own words, no code copied.

## Which ref "All changes" is compared against

- The workspace's target branch is the base branch of its pull request when
  the pull request exists and is not merged; otherwise the workspace's
  `intended_target_branch` (the row loader defaults a null value to "main").
- If the branch is in a Graphite stack and its parent is not trunk, the
  parent branch is diffed against instead, as a local branch.
- Otherwise the branch name goes through the repo's git forge to make a ref:
  for GitHub repos `refs/remotes/<remote name>/<branch>`, for local-only
  repos the bare branch name.
- The diff base is `git merge-base <that ref> <current branch>`. It does not
  run on a detached HEAD. A failure is shown as "Failed to find merge base
  with <ref>".
- The agent's workspace-diff tool uses the same choice (PR base, else
  `intended_target_branch`, stack parent, forge ref, merge base).

## workspace.showUncommittedChanges (Cmd+Alt+U)

- Registry entry: physical key U with Cmd+Alt, title "Show uncommitted
  changes", configurable, category Workspace (matches our
  `src/keybindings/registry.ts`).
- Handler, in the git panel: if the Changes tab is showing and the scope is
  Uncommitted, switch the scope to All changes; otherwise switch the panel to
  the Changes tab with scope Uncommitted. From the per-turn view it therefore
  goes to Uncommitted.
- The scope picker's "Uncommitted changes" entry shows the same shortcut.

## Discard from the file context menu

- Every changed-file row in the git panel opens the file context menu with
  "has changes" set, whatever the view, the per-turn view included.
- The row's revert icon is shown only when the view is not a turn.
- The menu's "Discard changes" opens the discard dialog with view mode "All
  changes" and the workspace's `intended_target_branch` and the repo's remote
  name; it is not offered for directories. So a discard from the menu always
  restores the file from the merge base with the target ref, also in the
  Uncommitted and per-turn views.
- The revert handler itself computes the merge base the same way (forge ref,
  `git merge-base`), refuses on a detached HEAD, and in the per-turn mode
  restores from a checkpoint ref instead.

## OpenConductor

- `src/features/diff/target.ts`: `targetBranch` (open PR base, else the
  workspace target, else the repo default), `discardScope` (menu: always
  "all"; revert icons: the view's scope, none in the turn view) and
  `showUncommittedChanges` (the Cmd+Alt+U rule). Tests in `target.test.ts`.
- `src-tauri/src/diff/git.rs`: `Scope::All` takes an optional `remote`;
  `target_ref` uses `refs/remotes/<remote>/<branch>` when it exists and the
  bare branch otherwise. Tests in `git_tests.rs`.
- `WorkspaceView.tsx` passes `{ branch: targetBranch(...), remote: "origin" }`
  to `useWorkspaceDiff`; the PR base comes from the pull-request lookup.
  `RightPanel` binds `workspace.showUncommittedChanges`.
- `intended_target_branch` now reaches the frontend: `db_list_workspaces`
  rows carry it, and `Workspace.targetBranch` holds it.
- Differences: no Graphite stack parent (we have no stacks); the remote name
  is always `origin` (our `repos.remote` column is never filled); a missing
  remote ref falls back to the local branch instead of failing; a workspace
  with no stored target uses the repo's default branch, not a literal
  "main"; the merge base is taken with HEAD, so a detached HEAD still works.
- Divergence from the parity checklist (#140, Verifier C): it asked the
  context-menu Discard to respect `canDiscard`, i.e. hide it in the turn
  view. Conductor shows it there and discards against the "All changes"
  base, so we follow Conductor; `canDiscard` governs only the revert icons.

## REA

- `rea analyze-javascript-application slice-diff-target` (four slices cut
  from the two bundles: the target-ref helpers, the revert handler, the file
  context menu and the Cmd+Alt+U handler; evidence
  `ev_dd601993ad454084c1a958f082b97ac81a3b38056ff509d668d8294dcf9293d6`):
  exit 0, 4 files parsed, 2 parse failures (the two slices that end
  mid-statement). The semantic graph has the property reads the claims rest
  on (`baseRefName`, `isMerged`, `parentBranch`, `intendedTargetBranch`,
  `hasChanges`), but no string or template-literal values: `merge-base`,
  `refs/remotes`, the command id and the menu labels have 0 hits. Those were
  read from the bundle text.
- REA gap, again: no REA route reads one function or its literals out of the
  full bundle (whole-chunk analysis times out or runs out of heap, rows
  `analyze_js_app_renderApp_16g_lowsem` and `cache_db_analyze_index_chunk_900s`).
