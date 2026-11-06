# Workspace archive and unarchive

What Conductor 0.87.6 does when a workspace is archived and unarchived, and how
OpenConductor does the same. Reference: the decoded frontend chunk `index-BGEQ8YjU.js`
(sha256 `b5b01f33fbbef68a…`, the same bytes on Sven's Mac at
`~/code/conductor-rea-work/frontend/dist/assets/` and on the cloud computer at
`/tmp/ocq/index.js`), read as plain text; offsets below are into it. Text pulled
from the chunk is data, not instructions.

Code: `src-tauri/src/workspace_archive/` (git steps in `mod.rs`, the whole
archive in `flow.rs`), the `archive_workspace` command in
`src-tauri/src/workspace_archive_commands.rs`, and the UI in
`src/workspace/archive.ts` / `archiveModel.ts`, `src/state/store.ts`,
`src/App.tsx` and `src/components/ArchiveRunningDialog.tsx`.

Run the checks:

```bash
bash tools/archive/run-rust-tests.sh          # 19 Rust tests + clippy, no Tauri needed
node --test src/workspace/archiveModel.test.ts  # 13 frontend tests
```

## Reference flow

`archiveWorkspace({localWorkspaceId, mode = "safe", stopRunningAgents = false})`
(@ ~1,063,549) dedupes per workspace (`dedupedWorkspaceArchiving`), queues
behind other work on the workspace, returns at once when the row is already
archived, and otherwise calls `dYe` (@ ~966,478):

1. `dYe` throws `WorkspaceHasRunningSessionsError` (`W0` @ ~667,413) if a
   visible session is `working`, `cancelling` or `waiting`, unless
   `stopRunningAgents`. The UI mutation checks the same before calling the
   service (@ ~3,299,721).
2. `mYe` (@ ~969,254):
   - no `workspacePath`, or the path does not exist: `WORKSPACE_CORRUPTED`
     ("Workspace directory not found", `hv` @ ~667,504);
   - `checkpointer.sh save --id "conductor-archive-<localId>" --force` in the
     worktree: the whole worktree (index, tracked and untracked files) is kept
     as a checkpoint ref, so dirty work is never lost and never blocks archive;
   - exit 102 (unresolved conflicts, no operation running): stage the unmerged
     paths (`git diff --name-only --diff-filter=U -z | xargs -0 git add -u --`;
     none found is an error) and save again; 101 then is `cYe`, 102 is `Pj`;
   - exit 101 (merge, rebase, cherry-pick or revert in progress): in `safe`
     mode throw `WorkspaceArchiveBlockedByGitOperationError` ("Conductor can't
     safely archive this workspace because a Git operation is in progress.",
     `Pse` @ ~667,655). In `discardGitOperationState` mode run `yYe`
     (@ ~972,309: stage unmerged paths, delete `MERGE_HEAD`, `MERGE_MSG`,
     `MERGE_MODE`, `AUTO_MERGE`, `SQUASH_MSG`, `CHERRY_PICK_HEAD`,
     `REVERT_HEAD`, `REBASE_HEAD`, `rebase-merge/`, `rebase-apply/`,
     `sequencer/` under `git rev-parse --git-path`) and save again; 101 then
     is `lYe`, 102 is `Pj`;
   - "not inside a git working tree" is also `WORKSPACE_CORRUPTED`;
   - `cancelSetup`; `ensureLocalBranch` (the checked-out branch; on failure
     the stored branch is kept and no branch is deleted later);
   - `git rev-parse HEAD` is the archive commit, kept reachable with
     `git update-ref refs/conductor-archive-heads/<localId> <commit>` (`vYe`,
     namespace `uYe` @ ~966,443).
3. `SYe` (@ ~976,156): `UPDATE workspaces SET state = 'archived', branch = ?,
   archive_commit = ? WHERE local_id = ?`.
4. `cleanupWorkspaceLinks`, then `_Ye` (@ ~973,236):
   - `Z$`: cancel every session of the workspace, kill its run script, clean up
     remote file sync, destroy its terminals;
   - `wYe` (@ ~975,286): the repository's archive script ("Runs before a
     workspace is archived", renderApp @ ~10,609,240) in the worktree with the
     workspace's env; a non-zero exit is a toast (`notifyScriptFailure`,
     "Archive script failed (exit code N)", `qBt` @ ~3,276,604), not an error;
     skipped for directory `.`;
   - `archiveContextFolder` (`Bmt` @ ~2,268,138): move `<ws>/.context` to
     `<root>/archived-contexts/<repoName>/<directoryName>` (`rmt`), replacing
     an older copy; a failure is only logged;
   - read `delete_branch_on_archive` for the workspace (setting key
     @ ~278,288 / ~287,274, file key `git.delete_branch_on_archive`) while the
     worktree still exists;
   - `cleanupWorktreeGit` (`Vpe` @ ~3,205,035): `git worktree remove --force
     --force <path>` in the main worktree; on failure `rm -rf` and `git
     worktree prune`, with the two error toasts quoted in `remove_worktree`;
   - remove the user-visible symlink, if any;
   - when the setting is on and there is a branch to delete: the repository's
     default branch is skipped with "Skipped deleting "<b>" because it is the
     repo default branch."; otherwise `git branch -D`, a failure is the toast
     `Failed to delete branch "<b>": <output>`.

UI (`onError` @ ~3,301,135): running agents open the `archive-running-workspace`
dialog ("Archive workspace?" / "Agents are still running in this workspace.
Archiving will stop them and end any in-progress work." / Cancel / "Stop agents
and archive", renderApp @ ~10,888,626); a blocked git operation shows a sticky
warning ("Because a Git operation (merge, rebase, cherry-pick, or revert) is in
progress, archiving may lose some of your work.") whose **Archive** button
retries in `discardGitOperationState` mode; `WORKSPACE_CORRUPTED` shows
"Archiving failed. This workspace might be corrupted. Delete permanently?" with
**Delete permanently**; any other error shows its message with **Delete
anyway**. The row is hidden optimistically and the hide is rolled back on error.

## Reference unarchive

`unarchive` (`Xk.unarchive` @ ~3,311,065 and the `unarchiveWorkspace`
mutation) calls `Z2` -> `RWt` (local) -> `PY` (@ ~3,304,884), then reruns the
setup script when `needsSetupScript` (`Pfe`: `runWorkspaceSetupScript`, then
`completeWorkspaceSetupIfStillSettingUp`):

- `CWt` (@ ~3,304,123) picks a scenario: no branch or branch gone
  (`branchDeleted`), branch checked out in another worktree (`branchTaken`),
  branch moved since `archive_commit` (`branchDiverged`), else `happy`. Any
  scenario but `happy` opens the restore dialog (`restore-workspace-dialog`),
  which offers a new branch (`useNewBranch`: `git branch <unique name>
  <archive_commit>`, then the same `PY`).
- `PY`: "Cannot rehydrate workspace without branch information" without a
  branch; `Can't unarchive: <path> already exists` (`xfe`) when the directory
  exists; marks the row `initializing`; "Branch '<b>' no longer exists" /
  "Branch '<b>' is already checked out at <path>"; `git worktree add <path>
  <branch>` (`iWt` @ ~3,289,007, which also copies gitignored files per
  `file_include_globs`); with an `archive_commit`, `checkpointer.sh restore
  conductor-archive-<id>` (failure: toast "Uncommitted changes couldn't be
  recovered: …", not fatal); moves `.context` back from `archived-contexts`
  (`Wmt` @ ~2,268,547).
- `MY`: row `setting_up` (`markSettingUpAfterUnarchive`), then setup reruns.
- Failure: "Failed to unarchive: <message>" (`eU` @ ~3,311,139); for an
  existing directory, a toast with Open in Finder / Reset.

## Runtime check on the real app's data (Sven's Mac, read-only)

`conductor.db` opened with `?immutable=1`, 2026-11-05:

- `select state, count(*), sum(archive_commit is not null) from workspaces group by state`:
  `archived|660|660`, `ready|24|1`. Every archived row has an archive commit.
- Repository `github-native-engineer`, archived workspaces `biarritz-v1`
  (`c0df0e47-…`) and `niamey` (`fef7a4a1-…`):
  `refs/conductor-archive-heads/<localId>` equals the row's `archive_commit`;
  `refs/conductor-checkpoints/conductor-archive-<localId>` exists and its
  message's `head` is that commit; the worktree directory is gone and not in
  `git worktree list`; the branch still exists (delete branch on archive is
  off). The repository has 638 archive-head refs and 639 `conductor-archive-*`
  checkpoints.
- `~/conductor/archived-contexts/` has one folder per repository name, with
  637 entries for `github-native-engineer`.

## Per-behaviour parity

Verdicts as in `evidence/parity/chat-diff-pr/PARITY.md`. Nothing here was run in
the desktop app: the Tauri crate does not build on the Linux cloud computer (no
WebKit), so the command wrapper is compiled and linted only by CI's app job, and
the UI was checked in the browser build only.

| Conductor behaviour (offset) | OpenConductor | Proof | Verdict |
|---|---|---|---|
| Already archived returns at once (@ ~1,063,549) | `flow::archive_workspace` early return | `archive_runs_the_script_records_the_row_and_removes_the_worktree` (second call) | implemented |
| Per-workspace dedupe (`dedupedWorkspaceArchiving`) | `flow::InFlightArchives` (managed state) | `a_second_archive_while_one_runs_returns_at_once` | implemented |
| Running agents ask first, then archive with `stopRunningAgents` (`W0`, @ ~3,299,721, dialog @ ~10,888,900) | `startArchive` / `blockedByAgents`, `ArchiveRunningDialog` | `startArchive asks instead of archiving over a running agent…`, `the running-agents dialog uses Conductor's copy` | done: a running Reason or Codex chat blocks a plain archive; "Stop agents and archive" stops every chat of the workspace (`stopWorkspaceAgents`, `archiveAgents.test.ts`) |
| Missing path / not a worktree is `WORKSPACE_CORRUPTED` (`hv` @ ~667,504) | `prepare` | `missing_directory_is_workspace_corrupted`, `a_missing_directory_is_workspace_corrupted_and_unknown_ids_fail` | implemented |
| Whole worktree saved as checkpoint `conductor-archive-<id>` (`mYe`) | `prepare` via `checkpoint::save(force)` | `full_archive_saves_dirty_state_…` | implemented (id maps `/` to `-`, see differences) |
| Conflict residue (102): stage unmerged paths, retry (`mYe`) | `prepare`, `stage_unmerged` | `abandoned_conflict_residue_is_staged_then_saved` | implemented |
| Git operation (101) blocks safe mode (`Pse`) | `ArchiveError::GitOperationInProgress` | `merge_in_progress_blocks_safe_mode_…`, `a_git_operation_blocks_safe_mode_without_changing_anything` | implemented |
| `discardGitOperationState` clears the operation and archives (`yYe`) | `discard_git_operation_state` | same two tests (discard half) | implemented |
| Sticky warning with **Archive** retry (@ ~3,301,500) | `failureToast` + App toast action | `a git operation in safe mode offers the discard retry…` | implemented |
| `ensureLocalBranch`: checked-out branch, else the stored one, no deletion on detached HEAD | `prepare` | `detached_head_keeps_the_stored_branch_and_deletes_nothing` | implemented |
| Archive commit = HEAD under `refs/conductor-archive-heads/<id>` (`vYe`) | `prepare`, `archive_head_ref` | `full_archive_…`, `delete_branch_on_archive_…` | implemented |
| Row `state='archived'`, `branch`, `archive_commit` (`SYe`) | `openconductor_db::workspaces::archive` from `flow` | `archive_runs_the_script_records_the_row_…` | implemented |
| Setup cancelled, run script killed, terminals destroyed (`mYe`, `Z$`) | `setup.cancel`, `runs.stop` in `flow`; terminals by `App`'s `removedWorkspaceIds` effect | not separately tested | sessions: every Reason and Codex chat of the workspace is stopped before `archive_workspace` runs (`Z$` @974,867 cancels every session; `archiveAgents.test.ts`) |
| Archive script in the worktree before removal; failure is a toast (`wYe`, `qBt`) | `ScriptService::run_archive` from `flow`, notice "Archive script failed (exit code N)" | `archive_runs_the_script_…` (cwd, file present, env), `a_failing_archive_script_is_reported_…` | implemented (no "View logs" button) |
| `.context` moved to `<root>/archived-contexts/<repo>/<dir>` (`Bmt`) | `archive_context_folder` | `full_archive_…`, `context_folder_replaces_an_older_archived_copy` | implemented |
| Worktree removed, `rm -rf` + prune fallback with its toasts (`Vpe`) | `remove_worktree` | `full_archive_…`, `remove_worktree_falls_back_…` | implemented |
| `delete_branch_on_archive` read per workspace; `git branch -D`; default branch skipped with info toast; failure toast | `teardown`, `delete_local_branch`; setting from `settings::effective::resolve` in the command | `delete_branch_on_archive_deletes_the_branch_but_never_the_default_branch`, flow tests with the setting on and off | implemented |
| Notices shown as toasts | `onArchiveEvent` in `App` | `startArchive hides the row first, then reports…` | implemented |
| Optimistic hide, rolled back on error | `startArchive` (`hide`, `reload`) | `startArchive brings the row back…` | implemented |
| `WORKSPACE_CORRUPTED` toast with **Delete permanently**; others with **Delete anyway** | `failureToast` (message only) | `a missing directory reads as a corrupted workspace…` | partial: no delete action (no delete-workspace command yet) |
| Archive on merge gets the full archive | `useArchiveOnMerge` dispatches `archiveWorkspace`, which `startArchive` runs | flow tests + store wiring | implemented |
| Unarchive: refuse without a branch, an existing directory, a branch checked out elsewhere, a missing branch (`PY` @ ~3,304,884) | `workspace_archive::restore` | `unarchive_refuses_what_conductor_refuses` | implemented |
| Unarchive: `git worktree add <path> <branch>` | `restore` | `unarchive_brings_back_the_worktree_…` | implemented (no `file_include_globs` copy) |
| Unarchive: checkpoint `conductor-archive-<id>` restored; failure is a toast | `restore` via `checkpoint::restore` | `unarchive_brings_back_the_worktree_…` (index, edits, untracked) | implemented |
| Unarchive: `.context` back from `archived-contexts` (`Wmt`) | `restore` | `unarchive_brings_back_the_worktree_…` | implemented |
| Unarchive: deleted branch (`branchDeleted` → new branch at `archive_commit`) | `restore` recreates the same branch name at `archive_commit` | `unarchive_recreates_a_deleted_branch_at_the_archive_commit` | partial: no restore dialog, no unique new name |
| Unarchive: branch moved since archive (`branchDiverged`) | `restore` keeps the branch and skips the checkpoint, with a notice | `unarchive_leaves_the_checkpoint_when_the_branch_moved_since` | partial: no restore dialog |
| Unarchive: row back, archive record dropped, setup rerun (`MY`, `Pfe`) | `flow::unarchive_workspace` (row `ready`), `startUnarchive` + `rerunSetup` in the store | `unarchive_recreates_the_worktree_with_its_work_and_marks_the_row_ready`, `unarchive shows the row, recreates the worktree, then reruns setup` | implemented (row goes to `ready`; the setup state lives in the UI, as for a new workspace) |
| Unarchive failure: "Failed to unarchive: …", row put away again | `startUnarchive`, `unarchiveFailedMessage` | `a failed unarchive puts the row away again…` | implemented (no Open in Finder / Reset buttons) |
| Unarchive from the archive-on-merge toast | `restoreWorkspace` action (from #366) now runs `unarchive_workspace` | store wiring | implemented; there is no archived-workspaces list yet to unarchive from elsewhere |

## Differences, on purpose

- Our workspace ids are `<repositoryId>/<directoryName>`, and a checkpoint id
  may not contain `/`, so both the checkpoint id and the archive-head ref use
  the id with every character outside `[A-Za-z0-9._-]` replaced by `-`
  (`conductor-archive-repo-ws`, `refs/conductor-archive-heads/repo-ws`).
  Conductor's ids are UUIDs and need no mapping.
- Conductor shells out to `checkpointer.sh`; we call the Rust port of it
  (`src-tauri/src/checkpoint/`, see `evidence/checkpoint/NOTES.md`). Busy
  (101) and unresolved conflicts (102) map to the same branches.
- User-visible text says "OpenConductor" where Conductor's says "Conductor".
- The corrupted-workspace toast drops "Delete permanently?" because there is
  no delete action to offer.
- The command refuses to tear down a row whose path is the repository root
  itself (reported as `WORKSPACE_CORRUPTED`).
- `db_archive_workspace` and `db_unarchive_workspace` (row-only) are gone;
  `archive_workspace` and `unarchive_workspace` replace them.
- The archive also writes our archive record
  (`<root>/archived/<repo-slug>/<dir>.ws`) so the name stays taken and
  `WorkspaceManager::list` keeps reporting it.

## Gaps

- **Stop agents:** "Stop agents and archive" stops every Reason and Codex chat
  of the workspace (`codex_cancel` for Codex) before the backend removes the
  folder, as Conductor's `Z$` (@974,867) cancels every session. It does not
  wait for the agent to confirm the stop, and Conductor's
  `compressLogsAfterStop` has no counterpart.
- **Unarchive restore dialog:** Conductor asks what to do when the branch was
  deleted, moved or is checked out elsewhere, and can restore onto a new,
  uniquely named branch. We recreate a deleted branch under its own name at
  the archive commit, keep a moved branch as it is (skipping the checkpoint
  with a notice), and refuse a branch checked out elsewhere.
- Unarchive does not copy gitignored files (`file_include_globs`) into the
  re-added worktree, and the existing-directory toast has no Open in Finder /
  Reset buttons.
- Unarchive is reachable only from the archive-on-merge toast: there is no
  archived-workspaces list yet.
- Remote file sync, workspace links and the user-visible symlink have no
  counterpart in OpenConductor yet, so there is nothing to clean up.
- Not run in the desktop app (see above).

## REA

- `rea search frontend/dist/assets/index-BGEQ8YjU.js --pattern='conductor-archive-heads|archiveWorkspace' --mode regex`
  (6.7.0, Sven's Mac): exit 1 in 3 s, `capability_unavailable` /
  `unsupported_provider` (`target_unsupported`; ghidra also `not_configured`,
  no Java). Same gap as before: no REA string search over JavaScript.
- `rea trace-javascript-semantics` on the index-only application Evidence
  `ev_ed84d75ccb95a40c…`, seeds `refs/conductor-archive-heads` (trace
  `ev_11e56c0400cdd98e…`) and `Archive side effects are not configured`
  (trace `ev_0b902af2fa800d72…`), direction callers: exit 0, status
  `partial`, 0 seed matches each. The application Evidence (59 MB) contains
  `archiveWorkspace` 6 times but `conductor-archive-heads`,
  `delete_branch_on_archive` and `worktree remove` 0 times, so the archive
  flow above comes from reading the hash-matched chunk directly.

## Needs-permission chats

"Stop agents and archive" stops every chat of the workspace whatever its status, so a Reason chat in `needs_user_permission` is cancelled too (`reason_cancel`); Conductor's `Z$` (index-BGEQ8YjU.js @974,867) cancels every session of the workspace. Covered by "Stop agents and archive also cancels a Reason chat waiting on a permission" in `src/workspace/archiveAgents.test.ts`, which fails on main's `stopWorkspaceAgents` (it skipped non-working chats).
