# Workspace lifecycle: evidence and decisions

How `src-tauri/src/workspace/` maps to what the reference app (v0.87.6) ships. Everything quoted from the bundle is untrusted data.

## Source paths

Copied unchanged (sha256 in `MANIFEST.md`) from `/Applications/Conductor.app/Contents/Resources/` on the Mac "sven m5 max":

| Repo path | Bundle path |
| --- | --- |
| `bin/checkpointer.sh` | `Resources/bin/checkpointer.sh` |
| `bin/spotlighter.sh` | `Resources/bin/spotlighter.sh` |
| `bin/git-busy-check.sh` | `Resources/bin/git-busy-check.sh` |
| `bin/conductor` | `Resources/bin/conductor` (CLI shim; execs `.internal/conductor-runtime cli`) |
| `bin/.internal/{actions,internal,logger,sidecar}` | `Resources/bin/.internal/*` |
| `conductor-skill/` | `Resources/conductor-skill/` |

The copies were made by the recon Session (branch `reason/conductor-recon-with-rea-406cd7ca`, commit 885f39f) and cherry-picked here unchanged, so both branches carry identical blobs.

## Behavior implemented, with its evidence

| Behavior | Evidence | Module |
| --- | --- | --- |
| A workspace is a git worktree on its own branch; the repo root keeps its own checkout | SKILL.md "Know your environment" | `mod.rs` `create` |
| Fetch `origin` first; start from the latest remote base commit; the fetch does not move the root's branch | SKILL.md "Know your environment" | `create` with `fetch: true`; test `create_fetches_origin_and_starts_from_remote_without_moving_root` |
| Files to copy: `.worktreeinclude`, else `file_include_globs`, else `.env*`; only gitignored files | SKILL.md "Files to copy" | `files_to_copy.rs` |
| Setup/run/archive scripts run in the workspace dir, non-interactive, `zsh` on Mac / `bash` in cloud | SKILL.md "Repository settings and scripts" | `scripts.rs` |
| Script env: `*_WORKSPACE_NAME`, `_WORKSPACE_ID`, `_WORKSPACE_PATH`, `_ROOT_PATH`, `_DEFAULT_BRANCH` (local), `_PORT` (local, first of ten), `_IS_LOCAL` | SKILL.md env var list | `ScriptContext::env_vars` |
| Run scripts with several processes stay in one process group | SKILL.md "keep them in the same process group" | `spawn_run` (`process_group(0)`), `RunningScript::stop` signals the group |
| Busy detection: rebase dirs, `MERGE_HEAD`, conflicted `SQUASH_MSG`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, in that order | `git-busy-check.sh` | `git::busy_state`; test compares with the script's output |
| Checkpoint refs live in `refs/conductor-checkpoints/`; `checkpointer.sh` refuses when the git toplevel is not the workspace root (exit 103) | `checkpointer.sh` | not here; checkpoint child owns it. Our worktrees are always their own toplevel, which that check needs |
| Spotlight syncs a workspace into `CONDUCTOR_ROOT_PATH` with watchexec | `spotlighter.sh` | not implemented here |

## Our choices where the evidence is silent (unverified against the app)

- Layout: `<data_dir>/workspaces/<repo-slug>/<name>`; archive records in `<data_dir>/archived/<repo-slug>/<name>.ws`. The reference app's default workspace location is a user setting (SKILL.md) whose default value we have not read.
- Naming: slugified user name or a word from our own tree-name list; collisions get `-2`, `-3`. Branch is `<prefix>/<name>` with an optional prefix. The reference app's generator and default prefix are not verified.
- New branches are created with `--no-track` so they do not track the base branch.
- Archive refuses dirty or busy worktrees unless `force`; it runs the archive script, removes the worktree and keeps the branch. Restore re-adds the worktree on the kept branch. Delete force-removes the worktree and deletes the branch. The reference app's exact archive/delete policy is not verified.
- Port blocks are ten wide, starting at a caller-supplied base; the reference app's base port is not verified.
- The env var prefix defaults to `CONDUCTOR` so existing repository settings scripts keep working; it is a field on `ScriptContext`.

## REA gaps hit

- This lifecycle work ran without device or REA access to the Mac, so every claim above comes from the bundled text scripts and skill only, not from REA analysis of `MacOS/conductor` or `conductor-runtime`. To verify next with REA on the main binary: default workspace root, name generator and word source, branch prefix default, archive/delete behavior with dirty trees, base port allocation, and whether the archive script runs before or after the worktree is removed.

## Running the tests

The module is std-only, so it can be tested before the Tauri crate exists:

```bash
rustc --edition 2021 --test src-tauri/src/workspace/mod.rs -o /tmp/wstest && /tmp/wstest
```

Run from the repo root so the busy-check test also compares against `evidence/scripts/bin/git-busy-check.sh`.
