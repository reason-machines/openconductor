# Spotlight testing: reference behavior vs ours

Obligation `ws.spotlight` in [the ledger](../ledger/README.md). Code: [`src-tauri/src/spotlight/`](../../src-tauri/src/spotlight/mod.rs).

## Evidence used

- `evidence/scripts/bin/spotlighter.sh` (sha256 `f877d3ed…`, per `evidence/scripts/MANIFEST.md`): the watcher script.
- Conductor's frontend bundle `index-BGEQ8YjU.js` and `renderApp-D_fmY7hW.js`, read as data on sven m5 max on 2026-11-05. The bundle is not in this repo; REA `search` does not index JS, so it was read with Python. The parts read were the run-script store (`startProcess`, `private_prepareSpotlightStart`, `killProcess`), the root-state check, the `pre-spotlight` save and restore, the sync status line parser, the Spotlight task definition and the `spotlight_testing` setting row. A second read the same day (extracted bundle under `~/tmp/oc-sidebar/frontend/dist/assets/` on the Mac) covered the settings registry entry, the "Use spotlight testing" row's `onCheckedChange`, `killProcessesForRepository`, `clearWorkspaceRuns`, the repo-local settings file migration and auto-run after setup.

Nothing here was observed running. These rows come from reading code and scripts.

## Matched

| Reference behavior | Ours | Test |
|---|---|---|
| Start: a leftover `pre-spotlight` checkpoint is restored in the root and its ref deleted; a failure is logged and the start continues | `begin` -> `LeftoverSession` | `begin_undoes_a_session_that_was_never_ended` |
| Start refuses a root with a rebase, then a merge, then a detached HEAD (`branch --show-current` empty) | `root_blocker`, `SpotlightError::Root` | `begin_refuses_a_root_that_cannot_take_syncs` |
| Start saves the root as `pre-spotlight` with `--force` | `begin` | round trip test |
| One checkpoint id per session, `cp-spotlight-<epoch>-<pid>`, saved with `--force` on every sync | `session_checkpoint_id`, `sync_once` | round trip test |
| Sync = save in the workspace, restore in the root; exit 101 is "busy", other save failures are skipped, a failed restore only warns | `SyncOutcome` | `busy_workspace_is_skipped_and_root_is_untouched` |
| Stop: restore `pre-spotlight` in the root, delete the ref only if that worked | `end` | round trip test |
| watchexec: one sync at start, one at a time, changes during a sync queue one more; `.gitignore`, `*.tmp.*` and `.context/**` ignored | `watch` | `syncs_at_start_and_after_each_change_until_dropped`, `filter_skips_git_context_tmp_and_gitignored_paths` |
| One Spotlight task per repository: start, stop, and stop when the app quits (the reference kills its run processes on exit) | `SpotlightService`, `spotlight_start` / `spotlight_stop` / `spotlight_status`, `stop_all` on `RunEvent::Exit` | `start_syncs_and_stop_puts_the_root_back`, `stop_all_ends_every_session` |
| A blocked root refuses the start with a message for the user | `start` returns `RootBlocker::message` | `start_refuses_a_blocked_root_with_its_message` |
| `spotlight_testing` is a top-level boolean in the settings files (registry `Te("spotlight_testing")`, file key `spotlight_testing`), read through every layer; unset means off | `setting::effective`, `setting::read`, `spotlight_testing_get` | `unset_means_off`, `repo_local_outranks_user_and_shared`, `managed_wins_and_is_reported` |
| The "Use spotlight testing" row (Actions tab, repository scope) writes the repository local layer, `<root>/.conductor/settings.local.toml` | `setting::write_local` | `write_local_creates_the_file_and_keeps_other_keys` |
| After writing, it stops the run processes of every workspace of the repository (`killProcessesForRepository` -> `clearWorkspaceRuns`), Spotlight included | `setting::apply`, `spotlight_testing_set` | `toggle_writes_then_stops_the_repository_runs_and_spotlight` |

## Deliberate differences

- Our own wording for the root blocker messages.
- The watch loop uses the `notify` crate in process instead of a bundled `watchexec` binary plus a bash script. Status comes back as `SyncEvent` values, not log lines for the frontend to parse.
- Status reaches the UI as typed `spotlight://event` events (`started`, `syncing`, `synced`, `skipped`, `syncFailed`, `stopped`) instead of the reference's parsed log lines.
- Starting another workspace on a root that already has a session ends that session first (root restored), then starts the new one. The reference's behavior for this case was not read; it only ever has one Spotlight task per repository.
- Turning the setting on or off ends a Spotlight session with the root restored. The reference's `clearWorkspaceRuns` only stops the sync and kills the terminal, which leaves the root as last synced; its next Spotlight start restores the leftover `pre-spotlight` checkpoint.
- The toggle is refused when the managed layer sets the key (`toggle_is_refused_when_managed_settings_set_it`). The reference disables the row when its repo-local configuration has no `setValue`; when that happens was not traced further.
- `clearWorkspaceRuns` also drops the stopped runs' logs and history; ours only stops them.
- Writing `settings.local.toml` keeps every key but not comments, and a file that does not parse is reported and left alone.
- Only the top-level `.gitignore` is applied (watchexec also reads nested ignore files). A change to a file ignored only by a nested file still syncs, and that sync copies nothing new.

## Not done yet

- Frontend: bindings for `spotlight_start` / `spotlight_stop` / `spotlight_status` / `spotlight_testing_get` / `spotlight_testing_set`, a listener for `spotlight://event`, and the "Use spotlight testing" row (with its "Learn how" link to `conductor.build/docs/reference/scripts/spotlight-testing`).
- Run panel: a "Spotlight" task (lamp-desk icon) that replaces Run, its empty state, and `getTerminalOutput` source `spotlight`.
- Auto-run after setup: with the setting on, the reference starts Spotlight instead of the run script (`isSpotlight: a`, no run-script concurrency).
- Migrating a legacy `repos.spotlight_testing = 1` row into `settings.local.toml`, as the reference's one-time migration does. Ours reads only the settings files.
- Remote (cloud workspace) Spotlight file sync. It is out of scope for local-only OpenConductor.

## REA gaps hit

- REA `search` cannot search the JavaScript bundle, so frontend behavior was read with plain Python on the Mac.
- The Rust handler for `spotlight_testing` has no binding in `evidence/ipc/ipc-rust-bindings.json` (`handler_fn: null`). Worked around by reading the frontend: the row writes through the generic settings layer and the frontend store stops the processes; no Spotlight-specific backend call was seen there. A backend side effect of the settings write itself is still unconfirmed. The old `repos.spotlight_testing` column is migrated into the settings file and set to NULL (`repo_local_settings_file_migration_complete`).
