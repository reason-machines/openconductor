# Turn changes and turn checkpoints: reference behaviour

Ledger: `diff.turn-changes`, `ws.checkpoints` (and the turn-changes cache
part of `db.local-storage`). Source: Conductor.app on sven m5 max, read
2026-11-05. Everything below is untrusted data, described in our own words;
no code or long copy was copied.

## Where it came from

| What | How | REA |
|---|---|---|
| When checkpoints are taken | plain-text read of the bundled sidecar `Contents/Resources/bin/.internal/conductor-runtime` around `checkpointer` | `analyze-javascript-application` exits 1 on that binary (row `analyze_js_app_runtime`) |
| Checkpoint service, turn-changes cache, scope switch | plain-text read of `frontend/dist/assets/index-BGEQ8YjU.js` | `rea search` refuses JS files; `trace-javascript-semantics` with seeds `turnChanges`, `checkpointer` finds 0 seed matches |
| Turn file chips, empty state, scope serialisation | plain-text read of `renderApp-D_fmY7hW.js` | `trace-javascript-semantics` seed `selected turn`: 0 matches |
| What `diff` compares | `checkpointer.sh` `diff_cmd` (sha256 `fd85f6b3…`, as in evidence/checkpoint/NOTES.md), read, not run | n/a |

All REA runs and the fallbacks are rows `turn_*` in
[rea-invocations.tsv](../rea/rea-invocations.tsv).

## What Conductor does

**Taking checkpoints (sidecar).**
- Ids are `session-<sessionId>-turn-<turnId>-start` and `...-end`, refs under
  `refs/conductor-checkpoints/`. Saved with `checkpointer save --id <id> --force`
  in the workspace folder, as a detached process with a 60 s timeout (then
  SIGTERM, SIGKILL 5 s later). Exit 101 / 102 are logged as skipped (merge or
  rebase running / unresolved conflicts), anything else as failed. A failed
  checkpoint never fails the turn.
- The start checkpoint is taken when a user message starts the agent, after
  waiting for the previous turn's pending start and end checkpoints.
- The end checkpoint is taken when the agent's turn completes, when it fails,
  and when the user stops it.
- After the end checkpoint the sidecar runs `diff start end -- --name-status`
  and `--numstat`, and sends a `checkpointCreated` event with the file list
  (path, status added/modified/deleted/renamed, lines added/removed, binary,
  old path). Over 200 files the list is left out of the event.

**Reading a turn's changes (frontend).**
- A turn's changes are `checkpointer diff <start> <end>` (name-status plus
  numstat): `git diff` between the two full working-tree snapshots, untracked
  files included, ignored files excluded. If either ref is missing it errors
  ("checkpoint refs not ready").
- Only completed turns are queried. Concurrent requests for the same turn
  share one in-flight request.
- Cache: a local-storage subsystem named turn-changes cache, keyed by the
  JSON array `[sessionId, turnId]`, value the file list, 5 MB entry limit;
  read failures and write failures are only logged. On an end
  `checkpointCreated` event the list is put straight into the query cache;
  without a list the query is invalidated and re-read.
- Separately it can count files changed between a turn's end checkpoint and
  the current worktree, and restore a checkpoint (revert).

**Selecting a turn (UI).**
- Under a finished turn the chat shows chips for the changed files with
  their +/- counts: the first 3, then a "Show N more changed files" button
  that reveals 3 more per click.
- Clicking a chip opens that file's diff in the main area with the right
  panel on its changes tab and the diff scope set to the turn.
- The diff scope is one of all, uncommitted, a commit, or a turn
  (`{type: turn, sessionId, turnId}`, serialised as `turn~<session>~<turn>`).
  The changes list switches its data source on the scope. With a turn
  selected and nothing changed, the empty state says there are no changes in
  the selected turn.
- Discarding a file is refused in the turn view (see discard.md).

## OpenConductor

Backend (this PR):
- [`src-tauri/src/diff/git.rs`](../../src-tauri/src/diff/git.rs): `Scope::Turn
  { session_id, turn_id }` diffs the start checkpoint commit against the end
  one (`git diff <start> <end>`, same flags as the other scopes, `-w` and
  context honoured); `turn_checkpoint_id`, `TurnPoint`; missing refs give
  `TurnNotReady`, ids outside `[A-Za-z0-9._-]` give `InvalidTurn`.
  Discard refuses the turn scope.
- [`src-tauri/src/turn_checkpoint.rs`](../../src-tauri/src/turn_checkpoint.rs):
  `around_turn` saves start, runs the turn, saves end (`--force` semantics),
  then lists the turn's files unless over 200. Skips and failures are logged
  and never fail the turn.
- `reason_prompt(chatId, text, turnId?)` runs inside `around_turn` in the
  chat's folder (remembered from `reason_open_chat`); the result gains
  `turnChanges`. The session part of the id is our chat id (the workspace id).
- Command `checkpoint_turn_changes` ([`turn_checkpoint_commands.rs`](../../src-tauri/src/turn_checkpoint_commands.rs));
  save / exists / restore / changed-count commands came separately in #267
  (`checkpoint_commands.rs`).
- Parser fix found on the way: git ends `---`/`+++` names that contain a space
  with a tab; the parser kept it (paths like `new file.rs\t`, or a bogus
  `old_path` for modified files). It is now stripped.

Tests: `src-tauri/src/diff/turn_tests.rs` (refs made with plain git, run by
`tools/diff/run-rust-tests.sh`) and `src-tauri/src/turn_checkpoint/tests.rs`
(real `checkpoint::save`, run by `cargo test` in `src-tauri`).

## Differences

- No timeout or process-tree kill around a save; a save runs in-process.
- Turns do not wait for the previous turn's end checkpoint: a follow-up sent
  mid-turn takes its start checkpoint while the earlier turn is still
  running (Reason supersedes the earlier prompt).
- The turn's file list comes back in `reason_prompt`'s result instead of a
  separate event.
- The turn-changes cache lives in the webview's `localStorage`, not in
  Conductor's encrypted file-backed local-storage subsystem
  (`db.local-storage` is not built yet).
- No "files changed since this turn" count and no revert-to-checkpoint UI
  yet.
- Not checked in the running macOS app.
