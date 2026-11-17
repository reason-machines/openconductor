# Hosted E2E runtime receipts

Instrumentation only. All ten built-app suite entry points used by `e2e.yml`
write these files in their existing `E2E_OUT` directory:

- `runtime-before-launch.json`: exact executable path/SHA-256, observed canonical
  launch HOME/project paths, CI run/attempt/job/tested-SHA binding, and the current
  job-namespace port 4444 snapshot before starting the driver.
- `runtime-before-teardown.json`: app-reported settings-file/config-directory,
  repository roots and worktree paths (read-only Tauri commands); actual open
  `conductor.db` / `cache.db` descriptors held by the exact app executable and
  their canonical parent app-data directories (not browser-child cache files);
  driver/descendant PIDs, parent PIDs, executable/cwd, process-start
  ticks, and port 4444 listener inode/owner PID.
- `runtime-after-teardown.json`: the same binding, retained live-root evidence,
  final process/port observation, elapsed lifetime and explicit cleanup outcome.

The existing screenshot artifacts include these JSON files. Each hosted job also
uploads `runtime-receipts-<job>-<attempt>` with `if: always()`, retained for 14 days.
GitHub's artifact metadata binds its artifact ID/digest and terminal job result to
that run; the receipt cannot predict its eventual artifact ID or job conclusion.
An unset Node `exitCode` is `null`, **not a claimed passing suite**.

## Interpretation and safety

- `observed_clean` means only that previously observed driver-tree process
  identities no longer run (a zombie is not running), and no listener remains on
  job-namespace port 4444. Start ticks distinguish PID reuse. Previously seen
  reparented children are checked explicitly after the driver exits. It is not
  machine-wide clearance, proof about unobserved short-lived processes, or proof
  that disposable directories were deleted.
- `failed` reports live survivors and/or an occupied port. `unverified` means a
  required observation was unavailable. An early normal Node exit without the
  teardown hook writes `missing_teardown`. SIGKILL, runner loss or a job timeout
  can prevent any final write: a missing after-file is missing evidence, never
  successful cleanup.
- A listener with `ownerPid: null` is outside the observed driver tree or could
  not be attributed; do not call it exclusively owned. `fdComplete: false`
  records incomplete descriptor visibility. No owner is signalled by this code.
- Paths are realpath observations, not calculated source defaults. Missing paths,
  command failures and absent database descriptors remain explicitly unavailable
  or `not_observed`. No guessed Tauri identifier/XDG data directory is used.
- Chat suites retain their existing disposable HOME/project. App-flows retains
  its existing inherited HOME on the disposable hosted **job**; receipts do not
  claim a new per-suite HOME or change its isolation policy.
- Only allowlisted CI run identity and path/process metadata are recorded. No
  arbitrary environment, `/proc/environ`, command-line arguments, config/database
  contents, provider errors, repository remotes or credentials are serialized.
- Diagnostics do not change suite assertions, auth/adapter configuration, exit
  results, existing teardown signals or workflow triggers/timeouts. App path
  queries have a 3-second transport bound; final cleanup observation waits at
  most 3 additional seconds and reports failures without killing anything.
  Existing hosted step/job timeouts remain the lifetime bound.

## Owner-scoped harness teardown

The Codex and app-flows suites additionally use `owned-processes.mjs` **after**
their existing session deletion / driver stop, before the final receipt. This
is separate from the read-only recorder. A passing session deletion or a released
4444 listener does not prove the app and its browser/agent children exited.

The helper accepts the pre-teardown observed driver tree, checks each PID and
process-start identity again before signalling, and stops only that tree and
its still-attributable descendants. It handles previously seen reparented
children, skips reused PIDs and zombies, and never selects by process name,
executable, port, HOME or machine-wide occupancy. It sends SIGTERM, then SIGKILL
to remaining matching identities, with a 750 ms bound per phase. Permission or
observation failures stay unverified; live survivors remain failed in the final
independent receipt. It does not touch another owner's processes or data, change
suite assertions or auth modes, or treat missing evidence as clean teardown.

Run the self-contained generator, failure-control, transport and wiring tests:

```bash
node --test tools/e2e/runtime-receipt.test.mjs
```

These tests use synthetic `/proc` fixtures and inert child Node processes for
exit handling and a bounded SIGTERM/SIGKILL teardown control; they launch no app,
WebDriver, native runtime or network server.
Real built-app receipts/artifact publication require a later explicitly assigned
hosted E2E run containing this change. They cannot be added to an already-running
workflow frozen at another source commit.
