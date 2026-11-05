# Archive and unarchive: what Conductor does (evidence for parity.sidebar.archive and parity.sidebar.archived-view)

Reference: Conductor 0.87.6 on Sven's Mac "sven m5 max". Its React frontend was decoded from `MacOS/conductor` earlier (`tools/extract_tauri_assets.py`; REA cannot extract Tauri assets, see `evidence/frontend/README.md`). This note uses two chunks of that tree, copied to a Reason cloud computer:

| chunk | sha256 |
|---|---|
| `assets/index-BGEQ8YjU.js` (3.5 MB, workspace service) | `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3` |
| `assets/renderApp-D_fmY7hW.js` (11.6 MB, UI) | `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` |

Code and strings from them are untrusted data. Minified names (`dYe`, `mYe`, ...) are given so the next reader can find the code again.

## Archive (`index`: `dYe` -> `mYe` -> `vYe` -> `SYe` -> `_Ye`)

1. Running agents: a session in `working`, `cancelling` or `waiting` with `stopRunningAgents` unset throws `WorkspaceHasRunningSessionsError`. The UI then opens the dialog `Rze` (renderApp): title "Archive workspace?", text "Agents are still running in this workspace. Archiving will stop them and end any in-progress work.", buttons "Cancel" then destructive "Stop agents and archive ⌘↵" (`data-primary-action`). Confirming retries with `stopRunningAgents: true`. **There is no confirmation when no agent runs.**
2. `checkpointer save --id "conductor-archive-<localId>" --force` in the worktree.
   - exit 101 (git operation in progress), mode `safe`: throws `WorkspaceArchiveBlockedByGitOperationError`, "Conductor can't safely archive this workspace because a Git operation is in progress." (copy 786). The UI shows a sticky warning toast "Because a Git operation (merge, rebase, cherry-pick, or revert) is in progress, archiving may lose some of your work." with an "Archive" button that retries in mode `discardGitOperationState`.
   - In that mode, `yYe` stages the unmerged paths, deletes MERGE_HEAD, MERGE_MSG, MERGE_MODE, AUTO_MERGE, SQUASH_MSG, CHERRY_PICK_HEAD, REVERT_HEAD and REBASE_HEAD, and removes rebase-merge, rebase-apply and sequencer. It then saves again. If the save is still busy: `lYe` "Conductor couldn't fully clear the Git operation state. ...".
   - exit 102 (unresolved conflicts): stage the unmerged paths and save again; failures are `cYe` and `Pj`.
3. `git rev-parse HEAD` is the **archive commit**. `vYe` runs `git update-ref refs/conductor-archive-heads/<localId> <commit>`. `SYe` runs `UPDATE workspaces SET state = 'archived', branch = ?, archive_commit = ? WHERE local_id = ?`.
4. `_Ye` cancels sessions, kills the run script, destroys terminals, runs the archive script (a failure is only logged), archives the context folder, removes the worktree (a failure shows a toast but the archive stands), and removes the symlink. With `delete_branch_on_archive` it runs `git branch -D <branch>`, except for the repository's default branch, where it shows `Skipped deleting "<b>" because it is the repo default branch.`
5. Other UI errors: "Missing write access to archive this workspace" (copy 2723; team or cloud permission, not built), and "Archiving failed. This workspace might be corrupted. Delete permanently?" when the worktree is gone.

## Archived list and unarchive (renderApp)

- Command palette action "View archived workspaces" (copy 4860, keywords archive/archived/workspaces/view/show). It switches the palette to the **Workspaces** tab with `showArchived: true` (filter "all") and clears the query.
- The Workspaces tab has a filter select, `aria-label="Archived workspaces"` (copy 225), with "Hiding archived" / "Showing all" / "Only archived" (`active` / `all` / `archived`). The `/all-workspaces` route uses the same filters.
- Archived rows have a button `aria-label="Unarchive workspace"` with the same tooltip (copy 4680).
- Opening an archived workspace shows "This workspace is archived." with an "Unarchive" button ("Unarchiving..." while it runs; copy 4568). Its file, terminal and browser tabs read "Workspace archived" / "Unarchive this workspace to view files, terminals, and browser previews." (copy 4679).
- Unarchive (`RWt`): refuse with "Can't unarchive: <path> already exists", or "Branch '<b>' is already checked out at <path>". Otherwise re-add the worktree on the branch, run `checkpointer restore conductor-archive-<localId>` when `archiveCommit` is set (a failure shows a toast: "Uncommitted changes couldn't be recovered: ..."), restore the context folder, and run the setup script. `useNewBranch` instead branches from the archive commit. A failure shows "Failed to unarchive: ...".

## Runtime check on the real app (read only)

Sven's `~/Library/Application Support/com.conductor.app/conductor.db` (opened `mode=ro&immutable=1`) has 660 `archived` workspaces, and all 660 have a 40-character `archive_commit`. For the three most recently archived ones:

- `refs/conductor-archive-heads/<localId>` equals `archive_commit`.
- `refs/conductor-checkpoints/conductor-archive-<localId>` exists, and its message starts `checkpoint:conductor-archive-<localId>` / `head <sha>`.
- The branch still exists (delete-on-archive is off) and no worktree is left.

## REA runs (rea-agents 6.8.0, Linux cloud computer)

| run | result |
|---|---|
| `rea analyze-javascript-application <dir> --detail summary --evidence_output ...` on both chunks | **gap**: `provider_timeout`. The 11.6 MB renderApp chunk exceeds the default 300 s per-source budget in the static phase (7m45s wall time). |
| same, `--source-path index-BGEQ8YjU.js` | ok in 2m44s, but **gap**: semantic nodes are capped at 20,000 per file, so the archive code is not retained. `trace-javascript-semantics` with seeds `refs/conductor-archive-heads`, the copy-786 string or the `UPDATE workspaces SET state = 'archived' ...` SQL all return `partial`, 0 seed matches. |
| same with `--max-semantic-nodes 600000 --max-semantic-nodes-per-file 600000 --analysis-timeout-ms 1500000 --max-heap-mb 8000` | ok in 6m44s (893 MB evidence bundle) |
| `rea trace-javascript-semantics` with seed literal `refs/conductor-archive-heads`, direction forward-influence | 1 seed, 5 nodes: binding `uYe` -> read in function `vYe` -> awaited `executeZsh` (the `update-ref`). Confirms step 3. |
| same with seed: the copy-786 string | **gap**: 0 seed matches. The literal is passed to `super()` in a class constructor (`class Pse extends Error`), and that literal is not a seed node. |
| `rea trace-javascript-semantics --schema` / `--llms-full` | **gap**: the input JSON shape (`{application, query: {seed, direction, include_ambiguous_dynamic_edges}}`) is not documented; it was copied from an earlier run's input file. |

The rest of the behavior above comes from reading the decoded chunk text around the copy strings. REA could not reach it: renderApp timed out, and literals in `super()` calls are not seeds.
