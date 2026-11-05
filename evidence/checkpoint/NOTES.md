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

## Not confirmed yet / not implemented

- **Follow-up PR**: `diff <a> <b|current>` (reference behavior), per-workspace `list`/`list_all`, `delete`, and the cross-worktree restore test.

- **How the app drives checkpoints**: now read from the bundled sidecar and frontend (start and end of every chat turn, ids `session-<session>-turn-<turn>-start|end`, saved with `--force`, 60 s timeout). See [evidence/diff/turn-changes.md](../diff/turn-changes.md); ours is `src-tauri/src/turn_checkpoint.rs`.
- **Timeouts**: the script says the app sends SIGTERM when a save times out and traps TERM/INT to exit 143 after cleanup. We have no timeout or cancellation; the temp dir is still removed on drop and pruned later if the process is killed.
- **Retention/cleanup of old checkpoint refs**: nothing in the scripts deletes refs; unknown whether the app does.
- **Spotlight** (watchexec loop that saves `cp-spotlight-<epoch>-<pid>` with `--force` and restores into the root checkout on every change, logging to `/tmp/…-spotlight-<pid>.log`): the checkpoint primitives it needs work (cross-worktree restore is tested), but the watcher itself is not implemented here.
- **Concurrency**: two saves with the default id in the same second collide (`AlreadyExists`), as in the script. No locking beyond git's own ref locks.
- **macOS**: tests ran on Linux (git 2.39.5). Not yet run on macOS; physical-path comparison uses `fs::canonicalize`, the script uses `pwd -P`.
- **Lint**: `rustfmt --check`, `clippy -D warnings` and the tests run in CI (`.github/workflows/ci.yml`, Linux and macOS) on every PR, and in `run-tests.sh` locally when the tools are installed.
