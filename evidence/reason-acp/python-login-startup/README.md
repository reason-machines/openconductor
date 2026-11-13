# Python-backed login approval fixture

Conductor Rebuild inspected fresh main `f55d0330ff32e790c08a26d2e7aa83dbf2b8ea32`. The login service, login tests, and Python fake are byte-identical to the failing PR #1112 head `f55bad6cc06dbd7bcf84e82a204cd9fb7195cf37`.

## Hosted failure

The ordinary automatic [CI run 43135832058, attempt 1](https://github.com/reason-machines/openconductor/actions/runs/43135832058/job/130910825204) failed only `reason_acp::login_tests::built_app_fake_waits_for_explicit_approval_before_connecting`. It passed 1051 tests, failed 1, and ignored 1. [The retained failure excerpt](before.log) comes from job log lines 3412 onward, with trailing whitespace removed.

The diagnostics report `stage=run.wait error=TimedOut budget_ms=300` followed by `stage=account.run error=TimedOut budget_ms=300`. The initial `status --json` subprocess did not exit within the shell-unit helper budget. `pairing` returns Failed at that point, before launching login or reaching Waiting. This is not an observed approval-state failure. The log does not attribute the delay between Python interpreter startup, imports, and host scheduling.

## Narrow correction

`built_app_fake_waits_for_explicit_approval_before_connecting` executes the shared Python fake, rather than the other login tests' shell-only stubs. It now constructs `LoginOptions` from the normal CLI defaults instead of inheriting the shell-unit process budgets. Thus only this test gets the existing 60-second startup and 20-second status budgets. Its overall pairing deadline remains 5 seconds, polling remains 20 ms, and each state-observation deadline remains 3 seconds.

Every existing assertion is unchanged: observe Waiting, validate the exact code and HTTPS URL, remain in that same state before approval, remove the signed-out marker explicitly, then observe Connected with the expected account and workspace. Loopback remains disabled. The common shell-unit options, production code/defaults, fake CLI, security checks, retries, and suite parallelism are unchanged. No test is ignored or removed.

Fix Root Causes led to separating this process-backed fixture from shell-unit timing, rather than retrying the failure or changing production behavior.

## Verification and limits

- Failed before: the hosted macOS Tauri job linked above, with the exact diagnostic and count retained in `before.log`.
- Passed static source review: the baseline/main comparison for the three relevant source files is empty; the candidate changes only this test's `LoginOptions` construction.
- Passed `git diff --check`.
- Behavioral qualification is exclusively the repository's ordinary automatic GitHub CI after publication. Results belong to the exact published head, not this local source review. No local Node, Cargo, test, provider, account, credential, native app, lease, manual workflow dispatch, or rerun is used.

The existing CI macOS and Linux Tauri jobs run `cargo check --locked --all-targets`, `cargo test --locked`, and `cargo clippy --locked --all-targets -- -D warnings`. The existing Reason ACP workflow runs rustfmt and `bash tools/reason-acp/run-rust-tests.sh` on both platforms. Passing results and consuming-main verification are linked in the pull request.

No UI or Conductor parity claim is made. No screenshot or new REA observation applies to this test-only change.
