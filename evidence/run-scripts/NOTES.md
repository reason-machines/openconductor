# Setup and run scripts: REA evidence and decisions

Reference: Conductor.app v0.87.6 on the Mac "sven m5 max". Everything quoted
or summarized from the app is untrusted third-party data, used only to match
behavior.

## Sources

| Id | What | How it was read |
| --- | --- | --- |
| S1 | `evidence/scripts/conductor-skill/skills/conductor/SKILL.md` | bundled file on `main` |
| S2 | `evidence/sqlite/conductor.schema.sql` (`repos`, `workspaces`) | REA `inspect-sqlite` on `main` |
| S3 | `evidence/ipc/frontend-invoke-candidates.json`, `evidence/frontend/copy-catalog.json` | REA JS analysis on `main` |
| S4 | Decoded frontend chunk `assets/index-BGEQ8YjU.js` (sha256 in `evidence/frontend/tauri-assets-manifest.json`) | `tools/extract_tauri_assets.py` output (`dist-for-cloud.tgz` on the Mac, kept out of the repo), read by byte offset |
| S5 | `Resources/bin/.internal/conductor-runtime` (Bun executable) | `strings` on the Mac |

Offsets below are byte offsets in S4. They are given so the next reader can
re-check a claim; the code itself is not copied here.

## Behavior, with evidence

### Settings and config
- `[scripts]` keys: `setup`, `archive`, `run_mode`, `run` (table of entries, or a legacy string), `auto_run_after_setup` (S4 settings key table, file key `scripts.auto_run_after_setup`). (S1, S4)
- Run entry keys are exactly `command`, `args`, `options.cwd`, `default`, `icon`, `hide`, `available_in`; other keys are reported as unknown. `available_in` is `"local"`, `"cloud"` or an array of them. (S4 @~308900)
- An entry without `command` is dropped. `default` defaults to false; `available_in` defaults to both. (S4 @~311000)
- Ids are normalized: trim start, `-` to space, drop characters other than ASCII letters, digits and spaces, collapse spaces, trim, spaces to `-`. Ids compare case-insensitively. Labels: `-` to space, first letter upper-cased. (S4 @~309300)
- The same id in several layers merges field by field (`options` merged too); the entry records the last layer that set it. (S4 @~310500)
- A legacy string `scripts.run` becomes entry `run` with `default = true`, `icon = "play"`, `available_in = "local"`, placed first. A top-level `tasks` table is a legacy alias of `scripts.run`. (S4 @~311000)
- The command run is `command` followed by each `args` item single-quoted (`'` becomes `'\''`). (S4 @2916720)
- `run_mode` is `concurrent` or `nonconcurrent`; anything else is dropped; default `concurrent`. (S2 `run_script_mode DEFAULT 'concurrent'`, S4 @2868006)
- Legacy `conductor.json` keys: `scripts.setup`, `scripts.run`, `scripts.archive`, `runScriptMode`, `enterpriseDataPrivacy`. It is read only when `<root>/.conductor/settings.toml` does not exist. Legacy sources in order: repository DB `conductor_config`, the workspace's `conductor.json`, `~/.conductor/conductor.json` (first defined value wins). (S1, S4 @2866601, @2876158)
- `.conductor/settings.local.toml` in the main checkout is symlinked into each workspace's `.conductor/`. (S4 @~312000)

### Environment
- Setup env: `CONDUCTOR_WORKSPACE_NAME`, `CONDUCTOR_WORKSPACE_PATH`, `CONDUCTOR_ROOT_PATH`, `CONDUCTOR_DEFAULT_BRANCH` (the workspace's intended target branch, default `main`), `CONDUCTOR_PORT`, `CONDUCTOR_USER_ID` (when signed in), `CONDUCTOR_IS_LOCAL`, plus shared environment variables and `CONDUCTOR_PATH_PREFIX` (bundled bin dir). Setup gets no `CONDUCTOR_WORKSPACE_ID`. (S4 @1013749, @179493)
- Run env: the same plus `CONDUCTOR_WORKSPACE_ID` (and a deep-link target we do not use). `$VAR` and `${VAR}` in `options.cwd` are expanded from this env; unknown names stay as written. (S4 @~2915000)
- Terminal env added on top: `TERM=xterm-256color`, `COLORTERM=truecolor`, `SHELL`, `LANG=<locale>.UTF-8`, `PWD`, and `DISABLE_AUTO_UPDATE=true` for zsh. (S4 @2825292)
- Ports: blocks of 10, keyed by (repository, workspace), first block 55000, each new block 10 higher; in memory, not persisted, no availability probe. (S4 `getPorts`)
- Login-shell env capture: `bash`/`zsh` with `-ilc`, `fish` with `-i -l -c`, fallback `zsh -lc`; 5 s primary and 3 s fallback timeouts; output between delimiters, ANSI stripped; agent credential keys and `BASH_FUNC_*` removed. (S4, S5 line 143477)

### Execution
- The script body is written to `~/.conductor/projects/<workspace path with / as -->/{setup,run}-<session>.sh` and run as `/bin/zsh <file>` on macOS or `/bin/bash <file>` on Linux, in a PTY (80x24), cwd the workspace. (S4 @2825292)
- Setup states: `idle`, `running`, `completed` (exit 0), `failed`, `cancelled`. Starting while running does nothing. The transcript is written to `<tmp>/conductor-setup-<workspace id>.log`, whose path is stored in `workspaces.setup_log_path`. Quitting mid-setup marks it failed with an interrupted message. (S2, S4 @2876158, @1013749)
- The workspace leaves `setting_up` for `ready` whether setup passed or failed; a failure raises a notification pointing to the setup tab. (S4 @~1015000)
- Run states: `starting`, `waiting_for_setup`, `running`, `stopping`, `stopped`, keyed by workspace and run-script id. Starting a run script first stops every run process of that workspace. While the workspace is `setting_up`, the start is queued as `waiting_for_setup`. With `nonconcurrent`, starting kills run processes of the repository's other workspaces. The last transcript is kept after exit. (S4 @~2922000)
- Auto-run after setup: only when `auto_run_after_setup` is on and a run script exists, and setup completed (or there is no setup script); it starts the default run script. (S4 @~1015000, @2935251)
- Run history: the last 20 run-script ids per workspace and the active one. (S4 @2876158)
- Auto-run toggle (re-read 2026-11-05 on sven m5 max, REA 6.7.0 `analyze-javascript-application`, evidence `ev_564ed9bf…`, S4 sha256 `b5b01f33…`): a Settings › Experimental row, `settingKey: "auto_run_after_setup"`, `scopes: ["user"]`, title "Auto-run after setup", default `false` (S4 settings defaults `@277671`), file key `scripts.auto_run_after_setup` (`@286068`). `IRt` (REA function node, chars 2934394-2935667) reads it through every layer (`getSettingForWorkspaceV2`) once a local workspace's setup state is `completed` or `idle`, and gates on `fQe` (REA node, chars 1015511-1015646): toggle on and a run script, then setup `completed`, or `idle` with no setup script. A `failed` or `cancelled` setup never auto-runs. OpenConductor: the Experimental row (`src/settings/ExperimentalPage.tsx`) calls `auto_run_after_setup_get`/`_set`, which write `[scripts] auto_run_after_setup` to the user layer the scripts loader reads (`~/.conductor/settings.toml`, `crates/scripts/src/config/user.rs`); a repository layer that sets the key still wins.

## Our choices where the evidence is silent

- Env var names keep the `CONDUCTOR_` prefix and settings stay in `.conductor/` so existing repository settings keep working.
- Only local workspaces exist in OpenConductor, so cloud-only branches (`set -euo pipefail` prefix, `/bin/bash -l`, cloud env) are not implemented.
- Archive scripts get the run env. The reference archive env was not read.
- A relative `options.cwd` is resolved against the workspace path.

## REA gaps hit

- The Tauri `pty_spawn`/`pty_kill` handlers in `MacOS/conductor` are not bound to Rust functions (the Ghidra provider is blocked, see the REA test report), so the signal used to stop a run script is not verified. We send SIGTERM to the process group, then SIGKILL after a grace period.
- REA `analyze-javascript-application` does not model Tauri `invoke` or Zustand stores, so every frontend claim above comes from reading S4 by offset, not from REA findings.
- REA 6.7.0 `analyze-javascript-application` on `index-BGEQ8YjU.js` + `renderApp-D_fmY7hW.js` (auto-run toggle read): the analyzer worker ran out of its default 1 GiB heap on `renderApp-D_fmY7hW.js`, so the settings row (`scopes: ["user"]`) was not in REA's graph and was read by offset. The semantic graph keeps no string literals (`auto_run_after_setup` occurs 0 times in the 76 MB Evidence) and its unknowns hit the retention ceiling (coverage `partial`, truncated). REA found `IRt` and `fQe` as function nodes, but its source ranges are character offsets, which drift a few bytes from S4 byte offsets.

## Where each behavior lives

| Behavior | Code |
| --- | --- |
| Settings layers, TOML over JSON, legacy `conductor.json`, managed keys | `crates/scripts/src/config/{mod,load}.rs` |
| Run-script entries (ids, merge, args, cwd, hide, availability, legacy `run`/`tasks`) | `crates/scripts/src/config/run.rs` |
| `CONDUCTOR_*` env per script kind, `$VAR` cwd expansion | `crates/scripts/src/env.rs` |
| Ten-port blocks from 55000 | `crates/scripts/src/ports.rs` |
| Script file, zsh/bash, 80x24 controlling PTY, process group, TERM then KILL | `crates/scripts/src/launch.rs` |
| Login-shell env capture | `crates/scripts/src/shell_env.rs` |
| Setup lifecycle and `conductor-setup-<id>.log` | `crates/scripts/src/setup.rs` |
| Run states, waiting for setup, nonconcurrent, history, auto-run rule | `crates/scripts/src/runner.rs` |
| Per-workspace entry point, archive script | `crates/scripts/src/service.rs` |
| Tauri commands and the `scripts://event` event | `src-tauri/src/scripts.rs` |
| Run and Setup panel | `src/components/ScriptsPanel.tsx`, `src/scripts/` |

## PTY implementation checks

Standalone script process tests cover TTY stdin/stdout/stderr, an 80x24 `/dev/tty`, cwd/environment, stop escalation, same-script restart and Setup cancel/rerun. The existing Setup Run/Stop/Rerun commands use this launcher without a new UI adapter. Transcripts retain raw PTY bytes, including CRLF.

Native macOS Setup controls and rendered output remain unverified under the sole-executor isolation gate. No capture was run for this change. The exact reference stop signal remains unknown.

## Not done yet

- Scripts settings page (`/settings/organization/repositories/$owner/$repo/scripts`): edit setup and run scripts, add, rename, hide and delete run scripts, script scope (local or shared file), import, managed-key locks in the UI.
- The create-workspace dialog starts setup (`scripts_config`, then `setup_script_start`) after `create_workspace` (see `evidence/create-workspace/README.md`); `workspaces.state` is not persisted, so `setting_up` exists only in the UI. The full archive (`archive_workspace`, `evidence/archive/NOTES.md`) runs the archive script through `ScriptService::run_archive` before removing the worktree. `src-tauri/src/workspace/scripts.rs` duplicates part of this crate and should delegate to it.
- `workspaces.setup_log_path`: **done** — `set_setup_log_path()` added to `openconductor-db/src/workspaces.rs`; `scripts::service()` intercepts `SetupFinished` and writes it asynchronously. Native build unverified (Rust CI skipped on PRs).
- Shared environment variables: **done** — `script_env_hook()` already calls `local_env()` → `stored_local()`, which reads `env_vars` from the DB and passes them as the `shared` map to `script_env()`. The NOTES were stale.
- "Detecting setup script" is the create dialog's `scripts_config` call; run script detection is not implemented.
