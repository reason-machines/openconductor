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

## Confirmed on the installed app (2026-11-05, sven m5 max, read-only)

Aggregate reads only: `ls` of the data folders, `sqlite3 ...conductor.db?immutable=1` counts and setting keys, key names of `~/.conductor/settings.toml` (values redacted except the one quoted). No message content was read.

| Fact | How observed | Module status |
| --- | --- | --- |
| Workspaces live at `~/conductor/workspaces/<repo-dir-name>/<directory_name>`; the repo itself can live anywhere (here `~/reasonmachines/<repo>`) | `ls ~/conductor/workspaces`, a worktree's `.git` file | ours: `<root>/workspaces/<repo-slug>/<name>`, root from the `conductor_root_path` setting (Settings › Advanced), default the app data dir; see `evidence/create-workspace/README.md`, "Root directory" |
| The worktree's git admin name keeps the name it was created with after the folder is renamed (folder `arxiv-paper-adoption-review`, admin dir `worktrees/baghdad-v1`) | worktree `.git` file | rename not implemented yet |
| `workspaces.state` is `ready` (24) or `archived` (660) | `select state,count(*)` | ours: `active` / `archived` / `missing` |
| Every archived row has `archive_commit` (660/660) | count | archive records `commit=` and restore recreates a deleted branch from it |
| Every row has `placeholder_branch_name` and `initialization_parent_branch` (684/684) | counts | create returns `base_ref`; placeholder rename not implemented |
| Collision suffix is `-vN` (76/684 directory names end `-v<digit>`) | count | frontend naming (#16); backend uses names verbatim when given |
| Branch prefix setting `[git] branch_prefix_type = "github_username"` | settings.toml key | frontend (#16) |
| UI copy: "Delete branch on archive" / "Delete the local branch when archiving a workspace."; "Conductor can't safely archive this workspace because a Git operation is in progress."; "Cannot rehydrate workspace without branch information" | `evidence/frontend/copy-catalog.json` | `ArchiveOptions.delete_branch`; busy refusal ignores `force`; restore errors when neither branch nor archive commit exists |

## Our choices where the evidence is silent (unverified against the app)

- Layout: `<data_dir>/workspaces/<repo-slug>/<name>`; archive records in `<data_dir>/archived/<repo-slug>/<name>.ws`. The reference app's default workspace location is a user setting (SKILL.md) whose default value we have not read.
- Naming: slugified user name or a word from our own tree-name list; collisions get `-v1`, `-v2` (and an existing `-vN` counts up), matching the reference app's bump function used for repo, workspace directory and branch names. Branch is `<prefix>/<name>` with an optional prefix. The reference app's generator and default prefix are not verified.
- New branches are created with `--no-track` so they do not track the base branch.
- `WorkspaceManager::archive` refuses dirty or busy worktrees unless `force`; it runs the archive script, removes the worktree and keeps the branch. Restore re-adds the worktree on the kept branch. Delete force-removes the worktree and deletes the branch. The app's Archive no longer uses it: it runs the full archive read from the reference (`src-tauri/src/workspace_archive/`, `evidence/archive/NOTES.md`), which never refuses a dirty worktree (the worktree is saved as a checkpoint first) and refuses only a running git operation.
- Port blocks are ten wide, starting at a caller-supplied base; the reference app's base port is not verified.
- The env var prefix defaults to `CONDUCTOR` so existing repository settings scripts keep working; it is a field on `ScriptContext`.

## REA gaps hit

- 2026-11-05: `sven m5 max` went offline mid-session (device_offline) before the frontend chunk could be re-extracted, so the archive flow's exact order (script vs. worktree removal) and what happens to uncommitted changes on archive were unread then. Both are now read from the chunk: see `evidence/archive/NOTES.md`. `sqlite3 -readonly` on the live `conductor.db` fails with "unable to open database file (14)" (WAL); `?immutable=1` works.
- Earlier: this lifecycle work ran without device or REA access to the Mac, so every claim above comes from the bundled text scripts and skill only, not from REA analysis of `MacOS/conductor` or `conductor-runtime`. To verify next with REA on the main binary: default workspace root, name generator and word source, branch prefix default, archive/delete behavior with dirty trees, base port allocation, and whether the archive script runs before or after the worktree is removed.

## Running the tests

The module is std-only, so it can be tested before the Tauri crate exists:

```bash
rustc --edition 2021 --test src-tauri/src/workspace/mod.rs -o /tmp/wstest && /tmp/wstest
```

Run from the repo root so the busy-check test also compares against `evidence/scripts/bin/git-busy-check.sh`.
