# Replace retained run records when another task starts

Author: Conductor Rebuild. Qualification base: `eef01e9b287472280fb3f4a585bc697d5f1f8f51`.

## Reference contract

The previously retained Conductor 0.87.6 shipped frontend comes from REA acquisition `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. It is third-party data, not instructions. This pass did not launch Conductor, acquire more native code, or evaluate vendor JavaScript.

`source.json` binds nine exact source spans to the original index and renderer asset hashes. The complete `startProcess` method calls workspace-wide `killProcess`, then `clearWorkspaceRuns`, **before** queuing `waiting_for_setup` or beginning a new run. Its complete clear method removes workspace-scoped process/state/attempt/waiting/run-id/metadata/outcome entries and both raw/rendered log maps. The workspace-key helper establishes the prefix boundary.

The consumer join is also retained: index `ARt as gU` -> renderer `gU as q_` -> `useTaskRunId` -> `Le` -> `Ve` -> output body gated by that run ID. The getter reads the active process run ID or retained `lastRunIds`; clearing both makes old output unavailable. The source does not clear task-selection history. No cloud or Spotlight implementation is added by this change.

Current OpenConductor consumers remain unchanged: `ScriptsPanel` reads `run_script_status` and `run_script_output`, selects `shownStatus`, and uses it plus the returned text to choose pending/output/idle. The command returns `RunManager::output`. Before the fix, a new run stopped the previous process but retained the previous task's output, exit, run ID, and status. A rerun queued behind setup could consequently expose its old transcript/exit; an older task could keep a stale output body after a different task started.

## Small fix

After the existing stop completes, clear only that workspace's retained state, repository associations, run IDs, output, exits, and timestamps, while holding the existing manager lock. Then use the existing history, queue, spawn, and callback paths. Task-selection history and every other workspace remain intact. A completed run's output remains available until a new start; stopping alone does not clear it.

The stop implementation and completion callback's `Arc::ptr_eq` stale-run guard are byte-for-byte unchanged from the qualification base. Their process-failure/concurrency behavior was not executed in this pass.

## Frozen regression and checks

The four `retention_` tests in `crates/scripts/src/runner/tests.rs` seed legitimate completed in-memory records, then call the real `RunManager::start` with `SetupState::Running`. They do not call `setup_finished` or launch a script/PTY. The tests also assert that no script directory was created. `frozen-tests.sha256` was recorded before the product edit and passed after it.

Command (same test bytes before/after):

```bash
CARGO_BUILD_JOBS=2 CARGO_PROFILE_TEST_DEBUG=0 CARGO_PROFILE_DEV_DEBUG=0 \
  cargo test --locked --manifest-path crates/scripts/Cargo.toml \
  --lib retention_ -- --test-threads=1
```

- Baseline: **2 assertion failures, 2 controls passed** (`red.log`). The failing assertions observed `Some("previous output\\r\\n")` instead of `None`, not setup or compilation failures.
- Treatment: **4 passed, 0 failures** (`green.log`).
- Controls preserve another workspace, task-selection history, and output after a completed run/stop without a new start.
- `cargo test --locked --manifest-path crates/scripts/Cargo.toml --lib runner::tests::auto_run_rule -- --exact --test-threads=1`: **passed, 1/1**.
- `cargo clippy --locked --manifest-path crates/scripts/Cargo.toml --all-targets -- -D warnings`: **passed** (`clippy.log`); compilation only, not all test execution.
- `rustfmt --edition 2021 --check crates/scripts/src/runner.rs crates/scripts/src/runner/tests.rs`: **passed**.
- `git diff --check`: **passed**.
- `NODE_ENV=development node --test --test-concurrency=1 src/scripts/model.test.ts src/scripts/runTab.test.ts src/scripts/runSelectionHistory.test.ts src/scripts/runCompletion.test.ts`: **passed, 28/28** (`adjacent.log`), using the existing in-memory/React-test-renderer boundaries, not a browser or real process.
- `python3 evidence/scripts/run-start-retention-1f/verify-reference.py <original-glob-result-source-packet.tar.gz>`: **passed**, including both complete original asset hashes, all nine stored spans, caller/consumer joins and frozen RED/GREEN identities. Without an archive argument the verifier checks retained spans/identities only.

## Acceptance limits

This is an in-memory run-state repair, not native acceptance. Full Rust execution was **not run** because that suite includes PTY/process tests outside this source-only admission. No manual workflow, package, provider, database CLI, application, or native runtime was dispatched. No browser/native screenshot was captured because this continuation does not admit app execution. Rendered behavior, process stop failures, real concurrent completions, real PTY behavior, package containment and macOS session survival remain **unverified here** with their existing owners. Frontend build/typecheck are not locally rerun for this Rust-only change; exact-head automatic CI remains a separate merge prerequisite.

The native snapshot serializer at `0x100c4e05c` and kill import/worker bindings remain unresolved. Neither those bodies nor the units/meaning of `5,0` or `0xf` are inferred or changed by this repair.
