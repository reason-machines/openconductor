# Deterministic login expiry and retry

Conductor Rebuild investigated the unrelated login-test failure blocking terminal PR #770 at `62eea7352d021fea702cbb6dce9117b9aba59ae4`.

## Cause

The [macOS Tauri job](https://github.com/reason-machines/openconductor/actions/runs/42404741190/job/128499896085) passed 827 tests and failed `expired_app_wait_can_be_retried_without_a_stale_attempt_cancelling_it` with `unexpected login state: TimedOut`.

The test gave both attempts 150 ms of wall time. After the first expiry, it assumed its polling observer would see the retry's transient Waiting state before the retry expired. Scheduling or subprocess startup can consume that window. TimedOut is legitimate in that case; the observation assumption is wrong.

On Reason Cloud, adding a 200 ms observer delay after starting the retry reproduced the exact failure. [Before log](before.log). This is a controlled reproduction of the scheduling dependency, not a claim to reproduce macOS scheduler load.

## Fix

A `cfg(test)` clock supplies the overall pairing deadline. Non-test builds still read `Instant::now()` at every original deadline check. Process startup/status timeouts and poll sleeps retain real time in both builds.

The regression keeps the original 150 ms timeout. It observes the first Waiting state, advances the clock exactly 150 ms, observes expiry, then starts a new attempt. It retains the 200 ms observer delay that failed before. With logical time frozen, it verifies a fresh attempt ID and that cancellation using the old ID preserves the retry's Waiting state. Advancing another 150 ms must expire the retry too.

No retry, ignored test, increased timeout, global clock, production state-transition change, or CI rerun was added. Fix Root Causes led to removing the test's scheduler dependency instead of changing valid production expiry behavior.

## Verification

- Failed before with the controlled observer delay. See [before.log](before.log).
- Passed after with that same delay and the controlled clock. See [after.log](after.log).
- Mutation check failed as expected when attempt ownership also accepted nonempty stale IDs. The test saw Cancelled instead of Waiting. The mutation was reverted. See [mutation.log](mutation.log).
- Passed all 75 standalone Reason Rust tests and Clippy with warnings denied after reverting the mutation. See [suite.log](suite.log).
- Passed `rustfmt --edition 2021 --check src-tauri/src/reason_acp/login.rs src-tauri/src/reason_acp/login_tests.rs` and `git diff --check`.

Re-run the suite with `REASON_ACP_HARNESS_DIR="$PWD/.qa/login-harness" tools/reason-acp/run-rust-tests.sh`. For the focused regression append `login_tests::expired_app_wait_can_be_retried_without_a_stale_attempt_cancelling_it -- --exact --nocapture`.

The initial local invocation used an unqualified test filter with `--exact` and selected zero tests. That invocation is not verification; the retained focused logs use the fully qualified harness name.

## Limits

The full Tauri/macOS suite remains for CI. No native app, WebKit, sign-in, account, keychain, preserved process, or user data was touched. This is an OpenConductor regression-test correction, not a claim about Conductor behavior or native parity. It needs no new REA reference claim or screenshot.
