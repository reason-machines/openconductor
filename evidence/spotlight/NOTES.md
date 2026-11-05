# Spotlight testing: reference behavior vs ours

Obligation `ws.spotlight` in [the ledger](../ledger/README.md). Code: [`src-tauri/src/spotlight/`](../../src-tauri/src/spotlight/mod.rs).

## Evidence used

- `evidence/scripts/bin/spotlighter.sh` (sha256 `f877d3ed…`, per `evidence/scripts/MANIFEST.md`): the watcher script.
- Conductor's frontend bundle `index-BGEQ8YjU.js` and `renderApp-D_fmY7hW.js`, read as data on sven m5 max on 2026-11-05. The bundle is not in this repo; REA `search` does not index JS, so it was read with Python. The parts read were the run-script store (`startProcess`, `private_prepareSpotlightStart`, `killProcess`), the root-state check, the `pre-spotlight` save and restore, the sync status line parser, the Spotlight task definition and the `spotlight_testing` setting row.

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

## Deliberate differences

- Our own wording for the root blocker messages.
- The watch loop uses the `notify` crate in process instead of a bundled `watchexec` binary plus a bash script. Status comes back as `SyncEvent` values, not log lines for the frontend to parse.
- Status reaches the UI as typed `spotlight://event` events (`started`, `syncing`, `synced`, `skipped`, `syncFailed`, `stopped`) instead of the reference's parsed log lines.
- Starting another workspace on a root that already has a session ends that session first (root restored), then starts the new one. The reference's behavior for this case was not read; it only ever has one Spotlight task per repository.
- Only the top-level `.gitignore` is applied (watchexec also reads nested ignore files). A change to a file ignored only by a nested file still syncs, and that sync copies nothing new.

## Not done yet

- The `spotlight_testing` repo setting. In the reference, turning the setting on or off kills the repo's run processes.
- Frontend: `backend.ts` bindings for the three commands and a listener for `spotlight://event`.
- Run panel: a "Spotlight" task (lamp-desk icon) that replaces Run, its empty state, and `getTerminalOutput` source `spotlight`.
- Remote (cloud workspace) Spotlight file sync. It is out of scope for local-only OpenConductor.

## REA gaps hit

- REA `search` cannot search the JavaScript bundle, so frontend behavior was read with plain Python on the Mac.
- The Rust handler for `spotlight_testing` has no binding in `evidence/ipc/ipc-rust-bindings.json` (`handler_fn: null`), so whether the backend does anything beyond storing the setting is unconfirmed.
