# Checkpoints: reference behavior vs our implementation

Implementation: [`src-tauri/src/checkpoint/`](../../src-tauri/src/checkpoint/mod.rs) (std only, shells out to `git`).
Tests: [`tests.rs`](../../src-tauri/src/checkpoint/tests.rs), run with [`run-tests.sh`](run-tests.sh) until the Tauri crate declares `mod checkpoint;`.

## Evidence used

- `evidence/scripts/bin/checkpointer.sh` in `reason-machines/conductor-rebuild` (12239 bytes, sha256 `fd85f6b33d10e6f315a281efcfdd08656ca50f16e68c595089a86efae7f451f1` per `evidence/scripts/MANIFEST.md`), copied verbatim by the workspace-lifecycle child from `Conductor.app/Contents/Resources/bin` (v0.87.6). Read on that repo's branch `reason/conductor-recon-with-rea-406cd7ca`, commit `885f39f`; not copied into this repo.
- `evidence/scripts/bin/git-busy-check.sh`, same branch (the busy check `save` calls).
- `evidence/scripts/bin/spotlighter.sh`, same branch (the only bundled caller seen so far).

All three were read as data only; none was executed. Every claim below comes from reading those scripts. Nothing here was observed in the running app or its binary, so how the app calls the checkpointer (when, with which ids, how it stores them) is unconfirmed. The analysis of the main binary is happening in another Session.

## Matched (implemented and covered by a test)

| Reference behavior | Ours | Test |
|---|---|---|
| Refs live at `refs/conductor-checkpoints/<id>`; temp indexes under `<git-dir>/conductor-checkpoint-tmp/` | same names (`REF_NAMESPACE`, `TMP_DIR_NAME`), so checkpoints made by either tool are visible to the other | `checkpoint_commit_layout_matches_reference` (literal ref name), `stale_temp_index_dirs_are_pruned` |
| `save` never moves HEAD or touches index/files; it writes only objects and one ref | same | `save_change_restore_round_trip` |
| Snapshot = parentless commit whose tree is the *worktree tree*; message lines `checkpoint:<id>`, `head <oid>`, `index-tree <tree>`, `worktree-tree <tree>`, `created <UTC ISO>` in that order | same order and keys (plus one extra trailing line, see Differences) | `checkpoint_commit_layout_matches_reference` |
| Neutral identity `Checkpointer <checkpointer@noreply>`, author/committer date = `created` | same | same test |
| Worktree tree: temp index seeded with the *index* tree, then `add -A -- .` (tracked files that match .gitignore kept, ignored untracked skipped) | same | `ignored_files_semantics` |
| Default id `cp-YYYYMMDDTHHMMSSZ` (UTC) | same | `default_id_and_duplicate_handling`, `utc_formatting` |
| Existing id refused unless `--force`; force overwrites | `SaveOptions.force` | `default_id_and_duplicate_handling` |
| Unborn HEAD recorded as 40 zeros; save works, restore refuses | `head: None`, `UnbornHead` | `unborn_head_saves_but_cannot_restore` |
| Exit 101: busy (rebase dirs, MERGE_HEAD, conflicted squash, CHERRY_PICK_HEAD, REVERT_HEAD, checked in that order by `--git-path`) | `Busy(BusyState)`, `reference_exit_code() == 101` | `busy_states_skip_save`, `conflicted_squash_merge_is_busy` |
| Clean squash merge (SQUASH_MSG without unmerged entries) is not busy | same | `busy_states_skip_save` |
| Exit 102: unmerged index entries with no operation in progress | `UnresolvedConflicts` | `unresolved_conflicts_without_operation_is_102` |
| Exit 103: git toplevel (physical path) differs from the workspace dir | `RootMismatch` on every operation | `refuses_outside_workspace_root` |
| Restore step 1: `reset -q --mixed <head>` only if HEAD differs, unmerged entries exist, or MERGE_HEAD / CHERRY_PICK_HEAD / REVERT_HEAD exists (so a no-op restore adds no reflog entry) | same | `restore_is_noop_when_state_matches`, `restore_clears_in_progress_merge` |
| Restore step 2: `read-tree --reset <head>`, `add -A`, `read-tree --reset -u <worktree-tree>`, `clean -fd` (rewrite only differing files, drop untracked incl. empty dirs, keep ignored files) | same | `only_differing_files_are_rewritten`, `save_change_restore_round_trip`, `ignored_files_semantics` |
| Restore step 3: `read-tree --reset <index-tree>`, `update-index -q --refresh` (failure ignored) | same | round trip checks `diff --cached` |
| Missing metadata → error; missing ref → "not found" | `MissingMetadata`, `NotFound` | `missing_checkpoint_and_metadata` |
| Metadata lookup = first line starting with `<key> ` in `git cat-file commit` | same | (all restore tests) |
| Temp index dirs live under the worktree's git dir, hold an `owner-pid`, and are pruned only when older than 60 min **and** the owner is dead/missing; cleaned up on exit | same (Drop guard instead of an EXIT trap) | `stale_temp_index_dirs_are_pruned`, layout test checks no leftovers |

Mutation check (done once, by hand): removing `clean -fd`, removing the fresh-stat `add -A` before `read-tree -u`, or making the HEAD reset unconditional each makes at least one test fail.

## Deliberate differences

- **Extra metadata line** `worktree <abs path>` after `created`, recording which workspace saved the checkpoint (refs are shared by all worktrees of a repo). The reference's key lookup ignores unknown lines, so the format stays compatible both ways. Per-workspace listing that uses it lands in the follow-up PR.
- **`get`** (read one checkpoint's metadata) does not exist in the script.
- **Id validation**: we reject empty ids, ids with `/`, and anything `git check-ref-format` rejects, before touching refs. The script just lets `update-ref` fail.
- **Environment**: `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_PREFIX` are cleared for every git call so an inherited hook environment cannot redirect us. The script inherits them.
- **Errors are typed** (`CheckpointError`) with `reference_exit_code()` / `is_skip()` instead of exit codes and stderr text.

## Turn checkpoints and "Reset chat" (how the app drives the checkpointer)

Read from the shipped v0.87.6 app on Sven's Mac (`sven m5 max`, `~/code/conductor-rea-work`). The frontend came from the Tauri asset table (`frontend/dist/assets/index-BGEQ8YjU.js`, `renderApp-D_fmY7hW.js`). The sidecar is the Bun binary `Contents/Resources/bin/.internal/conductor-runtime`. All of it was read as data and nothing was executed.

| Conductor | Where | OpenConductor |
|---|---|---|
| Before and after every agent turn the sidecar runs `checkpointer.sh save --id session-<sessionId>-turn-<turnId>-<start\|end> --force` (detached, 60 s timeout then SIGTERM, SIGKILL 5 s later). Exit 101/102 is logged as "skipped" and anything else as "failed". The turn never fails because of it. The `end` save also computes `diff start end --name-status/--numstat` for a `checkpointCreated` event (omitted above 200 files). | runtime `Ul5`, `Vi`, `Bl5` | `sendReason` saves `start` before `reason_prompt` and `end` after it, through `checkpoint_save` (always force). A skip or failure is logged only. There's no timeout and no `checkpointCreated` diff event yet (`diff.turn-changes`). |
| Ids: `session-${sessionId}-turn-${turnId}-${type}` in both the sidecar and the frontend's checkpoint service | runtime `aa0`, frontend `getCheckpointId` | `checkpointId()` in `src/features/chat/checkpoints.ts`. Our turn id `<chat>:tN` becomes `tN`, made ref-safe. |
| Turn footer **More actions** menu: Fork to new tab, Fork to new workspace, **Reset chat**. Reset chat shows when the workspace has a path, is not archived, the turn is **not the last**, and the turn has reset info (an assistant message). It is disabled while the session is `working` or `needs_plan_response`. | renderApp turn footer (`TDo`) | Same rule (`canReset` in `view.ts`; `onResetChat` only for Reason chats in non-archived workspaces; disabled while a turn runs). Fork is not built yet. |
| Dialog: **Reset chat?** / **Later messages will be deleted.** / checkbox **Also reset files** (stored as `reset-chat-also-reset-files`, default on) / skeleton, then **N changed** (`checkpointer diff <end> current -- --name-only -z`) / **Cancel** / destructive **Reset ⌘↵**, **Resetting...** while it runs | renderApp `dDo`; frontend `getCurrentFileCount` | `ResetChatDialog.tsx`, same copy. The count comes from `checkpoint_changed_count` → `checkpoint::changed_since` (the reference's HEAD-seeded `current` tree). |
| Reset sequence: cancel the session (not Codex) → with files on, `checkpointExists(end)`, else **Checkpoint not found for this turn** → (Codex: rollback N turns) → `restore end` (error: `Failed to revert to checkpoint: <stderr>. No changes or conversation history have been reverted.`) → `deleteMessagesAfterWatermark` → Claude: `updateResumeSessionAt(lastAssistantMessageId)` | index `UDt` (`useResetChatToTurn`) | `resetReasonChat`: exists → restore → `truncateAfterTurn`. Same messages. The agent is rewound too (#271): when messages were deleted the chat forgets its Reason Session, and the save that deletes them also sets `sessions.claude_session_id = NULL, resume_session_at = <last kept message>`. The next prompt opens a new Session and attaches the kept conversation as `Earlier conversation.md` (`features/chat/rewind.ts`). |
| A failure is a toast, `Failed to reset chat: <message>`, and the dialog stays open | index `zDt` | The same text inside the dialog, which stays open (the chat panel has no toast host) |

Gaps:
- **The agent is rewound by replacement, not resumed in place.** ACP gives no way to drop turns from a Reason Session or fork it at a message (`reason acp --help` lists no such option), so a reset starts a new Session that gets the kept turns' text (no tool output or thinking) instead of resuming the old one at `resume_session_at` as Conductor does for Claude. The old Session stays in Reason's list.
- Chat transcripts aren't persisted yet, so after a restart turn numbering starts again at `t1` and older refs are overwritten by `--force`. No visible turn points at them anymore.
- REA's `analyze-javascript-application` doesn't model Tauri `invoke` (known), and `rea search` on `conductor-runtime` failed with `capability_unavailable` when Ghidra wasn't configured in the shell. The runtime's checkpoint code was read with a byte search of the binary's embedded JS instead.

## Not confirmed yet / not implemented

- **Follow-up PR**: `diff <a> <b|current>` (reference behavior), per-workspace `list`/`list_all`, `delete`, and the cross-worktree restore test.

- ~~How the app drives checkpoints~~: answered above (per turn, start and end) and in [evidence/diff/turn-changes.md](../diff/turn-changes.md). We have two savers on main: the frontend's `sendReason` (used today) and the backend's `turn_checkpoint::around_turn` (#279), which runs only when `reason_prompt` gets a `turnId`. The frontend doesn't pass one yet, so each turn is saved once; whoever wires `turnId` must drop the frontend saves in the same change. The reset path finds checkpoints by id in git refs (`show-ref`). conductor.db migration 37 ("add columns for checkpointing", cleared again by 43 and 49) shows the database once held checkpoint data. Which columns those are, and whether anything still reads them, is unconfirmed.
- **Timeouts**: the script says the app sends SIGTERM when a save times out and traps TERM/INT to exit 143 after cleanup. We have no timeout or cancellation; the temp dir is still removed on drop and pruned later if the process is killed.
- **Retention/cleanup of old checkpoint refs**: nothing in the scripts deletes refs; unknown whether the app does.
- **Spotlight** (watchexec loop that saves `cp-spotlight-<epoch>-<pid>` with `--force` and restores into the root checkout on every change, logging to `/tmp/…-spotlight-<pid>.log`): the checkpoint primitives it needs work (cross-worktree restore is tested), but the watcher itself is not implemented here.
- **Concurrency**: two saves with the default id in the same second collide (`AlreadyExists`), as in the script. No locking beyond git's own ref locks.
- **macOS**: tests ran on Linux (git 2.39.5). Not yet run on macOS; physical-path comparison uses `fs::canonicalize`, the script uses `pwd -P`.
- **Lint**: `rustfmt --check`, `clippy -D warnings` and the tests run in CI (`.github/workflows/ci.yml`, Linux and macOS) on every PR, and in `run-tests.sh` locally when the tools are installed.
