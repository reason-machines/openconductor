---
name: conductor
description: How OpenConductor workspaces, repository settings, setup/run/archive scripts, files to copy, Spotlight testing and checkpoints work. Use when helping someone configure or troubleshoot a repository in OpenConductor, or when your own workspace behaves unexpectedly.
---

# OpenConductor

OpenConductor is a macOS app that runs coding agents in parallel, each in its own git worktree of a repository. It reads Conductor's repository settings format (`.conductor/settings.toml`), so a repository set up for Conductor works in OpenConductor too. Everything runs locally on the user's Mac; there are no cloud workspaces.

## Your workspace

- The workspace is a git worktree at `~/Library/Application Support/com.reasonmachines.openconductor/workspaces/<repo>/<name>`, on its own branch. The repository's root checkout is a separate directory; do not edit it unless the user asks.
- A new workspace starts from `origin/<base branch>` after a `git fetch origin <base>`, so it begins at the latest remote commit even when the root checkout is behind. When the fetch fails (offline), it starts from the local base branch. The fetch never moves the branch checked out in the root.
- The base branch is the one picked when the workspace was created, else the repository's default branch (`origin/HEAD`, else the root's `HEAD`, else `main`).
- Branch names are `<prefix>/<workspace name>`. The prefix is the user's GitHub username by default (setting `git.branch_prefix_type`: `github_username`, `custom` with `git.branch_prefix_custom`, or `none`).
- `push.autoSetupRemote` is on in the worktree, so a plain `git push` creates the upstream branch.
- Archiving a workspace in the app only hides it. The worktree, its branch and its files stay on disk, and the archive script does not run.

## Repository settings

Scripts and Spotlight testing read these files, lowest precedence first:

1. User: `~/.conductor/settings.toml`
2. Shared with the team: `<repo>/.conductor/settings.toml`. The app reads this file from `origin/<default branch>`, not from the working tree, so changes take effect after they are merged and fetched. When that ref is missing it reads the root checkout's copy instead.
3. Machine-local, one repository: `<repo root>/.conductor/settings.local.toml`. The app's own Scripts and Spotlight controls write here.
4. Managed: `~/.conductor/settings.managed.toml`. It overrides everything above.

- Tables merge key by key. `.json` versions of the same files are also read, but any TOML file outranks any JSON file.
- A legacy `conductor.json` (in the workspace, or `~/.conductor/conductor.json`) is read only when the root has no `.conductor/settings.toml`, and only for `scripts.setup`, `scripts.run`, `scripts.archive`, `runScriptMode` and `enterpriseDataPrivacy`.
- OpenConductor's own app preferences are a different file, `~/.openconductor/settings.toml`. Do not put repository scripts there.

## Setup, run and archive scripts

```toml
[scripts]
setup = "npm ci"
run_mode = "concurrent"        # or "nonconcurrent"
auto_run_after_setup = false

[scripts.run.dev]
command = "npm run dev -- --port $CONDUCTOR_PORT"
default = true
```

- Setup runs once after a workspace is created, or again from the Scripts panel. Run scripts start from the Scripts panel.
- Scripts run with `/bin/zsh <file>`, a non-interactive shell with no TTY and no stdin. The environment comes from the user's login shell, captured once when the app starts. API keys and agent tokens (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` and similar) are removed from it.
- Each script runs in its own process group. Stopping it sends SIGTERM to the whole group, then SIGKILL after 5 seconds, so child processes stop with it. Quitting the app stops every run script.
- Starting a run script stops the workspace's other run scripts. With `run_mode = "nonconcurrent"`, it also stops run scripts in the repository's other workspaces. Use that for a fixed port, a single database or a shared Docker stack.
- Scripts get these environment variables. Agent sessions and terminals do not.

| Variable | Value |
|---|---|
| `CONDUCTOR_WORKSPACE_NAME` | the workspace's name |
| `CONDUCTOR_WORKSPACE_PATH` | the worktree path |
| `CONDUCTOR_ROOT_PATH` | the repository's root checkout |
| `CONDUCTOR_DEFAULT_BRANCH` | the workspace's base branch |
| `CONDUCTOR_PORT` | first of 10 ports reserved for the workspace, from 55000 up |
| `CONDUCTOR_IS_LOCAL` | always `1` |
| `CONDUCTOR_WORKSPACE_ID` | run and archive scripts only |

- Ports are not checked for availability, and the numbering starts again at 55000 when the app restarts.

## Files to copy

Gitignored files that a new workspace needs, such as `.env`, are copied from the root checkout when the workspace is created:

- The patterns come from `<repo root>/.worktreeinclude` (gitignore syntax). Without that file, every `.env*` file is copied.
- Only untracked, gitignored files that match are copied, and a file that already exists in the workspace is never overwritten.

## Spotlight testing

Spotlight mirrors a workspace into the repository's root checkout, so tools that only run from the root (a dev server with a fixed path, a simulator build) see the workspace's changes.

- Turn it on with `spotlight_testing = true` in the repository settings, or from the app.
- On start the root is saved as checkpoint `pre-spotlight`. The root must not be mid-rebase, mid-merge or on a detached HEAD.
- Every change in the workspace is saved as a checkpoint and restored into the root. `.gitignore`d files, `.git` and `.context` are skipped.
- Stopping Spotlight, or quitting the app, restores the root to `pre-spotlight`.

## Checkpoints

A checkpoint is a parentless commit of the full working tree (tracked and untracked, honoring `.gitignore`) under `refs/conductor-checkpoints/<id>`. Checkpoints are compatible with Conductor's. Only Spotlight creates them; agent turns do not.

The app installs `checkpointer.sh` in `~/Library/Application Support/com.reasonmachines.openconductor/bin/`. It is not on `PATH`. Run it from the workspace root:

```sh
BIN="$HOME/Library/Application Support/com.reasonmachines.openconductor/bin"
"$BIN/checkpointer.sh" save --id before-refactor   # prints the id
"$BIN/checkpointer.sh" diff before-refactor current -- --stat
"$BIN/checkpointer.sh" restore before-refactor     # HEAD, index and files back
"$BIN/git-busy-check.sh" .                         # clean | busy:rebase | busy:merge | ...
```

- `save` exits 101 while a merge, rebase, cherry-pick or revert is in progress, and 102 when the index has unresolved conflicts. Both are skips, not failures.
- Every command exits 103 when run from a subdirectory instead of the workspace root.

## Troubleshooting

Check these first:

- A script that works in your terminal but fails in the app usually depends on interactive shell startup (aliases, `nvm use` in `.zshrc`, prompts). Put what it needs in the script itself.
- A file missing from a new workspace is gitignored and not listed in `.worktreeinclude`.
- A change to `.conductor/settings.toml` that has no effect is not merged into `origin/<default branch>` yet, is overridden by `settings.local.toml`, or is overridden by `~/.conductor/settings.managed.toml`.
- Two workspaces fighting over one port or database need `run_mode = "nonconcurrent"`, or Spotlight testing.
