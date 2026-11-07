# Reason browser sign-in

## Scope

This change belongs to OpenConductor. It does not reproduce a Conductor account protocol. Conductor has no Reason agent, so there is no new Conductor behavior claim or new REA result in this change.

Settings, onboarding, and the chat sign-in action use one app-wide browser-pairing attempt. The native owner remains Session `d8e894e9-2c63-4ec3-9a11-f28722af996d` on the authorized `sven m5 max`. This cloud implementation Session does not launch another native instance.

## Verified CLI contract

Cloud runtime inspection used installed Reason CLI `0.2.673` with no terminal and an isolated HOME. Plain `reason login` exited successfully and printed an HTTPS browser link and confirmation code. A second invocation while pending also returned the link. No browser approval or Reason inference ran in this check.

Current CLI source was inspected read-only at [monorepo 6677412104358d1becb9fd3c9d2312142dcd258e](https://github.com/reason-machines/monorepo/tree/6677412104358d1becb9fd3c9d2312142dcd258e/cli).

- `main.ts` uses short-lived device pairing for noninteractive `login`. It prints a link and starts a background finisher. There is no machine-readable login result in the inspected implementation. The app does not invent `--json`, `--non-interactive`, or legacy `--loopback` login flags.
- `device-oauth.ts` can wait 20 seconds on the pairing token endpoint before a repeated pending invocation returns its link. The request has a 30-second transport timeout.
- The generic browser page lets the person select and approve a workspace. A global `--workspace` argument supplies a workspace hint. OpenConductor passes its configured workspace through that supported argument.
- The CLI owns credentials, refresh, and the browser callback. The app never reads tokens or pending-pairing secrets. No OpenConductor deep link is needed by this flow.
- `reason logout` removes saved credentials and disconnects devices as well as stopping pending sign-in. Cancel must not call it.
- Current `canonicalUserHome()` resolves the account-database home rather than trusting HOME alone. Release tests need the CLI's explicit `REASON_TEST_ACCOUNT_ROOT` isolation, if the tested installed version supports it. The directory must be canonical, owned, mode 0700, and different from the real account home. A fresh HOME alone does not prove credential isolation on that implementation.

The sole native driver later verified installed CLI 0.2.701 on `sven m5 max`. The running stable app's actual PATH begins with the installed CLI directory and includes the Homebrew/local directories. Missing PATH is therefore not established as the cause. Only 0.2.700 and 0.2.701 remain in the canonical installed versions directory. Sven's original built-app failure and the earlier 0.2.69x behavior remain unknown.

The native driver created a canonical mode-0700 account root and a separate owned single-link mode-0600 keychain outside the real keychain directory. The default and search keychain lists stayed unchanged. After the fixture's first managed-runtime install completed, `status --json` returned no account, account error, organization, workspace or connection. This establishes a signed-out isolated fixture, not a successful app sign-in. A prior 15-second preflight cutoff interrupted that first install and is not evidence of a pairing failure.

## Reproduced deadline defect

The old `LaunchConfig::login` reused the 20-second status timeout. Its `run_for` abandoned the command output on timeout without terminating the child.

A regression test runs the actual launch implementation with a synthetic executable that returns the pairing URL after 21 seconds. Before the fix, it failed after 20.01 seconds.

```text
a supported device long poll lost its URL: Err("`reason login` did not answer")
test result: FAILED. 0 passed; 1 failed
```

After the fix, the same check passed after 21.01 seconds.

```text
test account_tests::login_retains_a_link_returned_after_a_device_long_poll ... ok
test result: ok. 1 passed; 0 failed
```

This proves the deadline mechanism with a synthetic delayed CLI. It does not establish that the same mechanism caused Sven's original failure.

## Lifecycle and ownership

`reason_acp/login.rs` owns one typed attempt. `reason_login_start` joins an active attempt or starts another after a terminal state. `reason_login_status` returns active/terminal attempt snapshots; while idle or connected it refreshes the actual CLI account off the UI thread. A generation and state comparison prevents a slow account read from overriding a newer start, cancel, retry or explicit sign-out. `reason_login_cancel` accepts an attempt ID, so stale cancellation cannot stop a retry. Cancelled and timed-out attempts stay frozen until explicit retry even if the CLI later completes.

The CLI runs with null stdin, captured output, and no shell. Startup has a separate 60-second deadline. The app waits at most ten minutes for browser approval. Cancel and timeout stop app polling and terminate and reap an active foreground subprocess. Existing login short-circuits pairing and returns the account and workspace. No cancel path logs out or deletes credentials.

Cancel does not revoke the browser link or stop the CLI's detached finisher. A later browser approval can still sign the CLI in until its link expires. The UI tells the person to close the browser page if they no longer want to sign in. Retry can reuse the pending CLI pairing or discover that login has completed. This is a limit of the inspected CLI interface, not a fake-server guarantee of remote revocation.

Production accepts only Reason HTTPS pairing links. Local HTTP pairing URLs require explicit `LoginOptions.allow_loopback` in the isolated test executable. Webview IPC cannot enable that option.

The shared typed lifecycle follows model-the-domain. Keeping the separate startup deadline and owned subprocess cleanup follows fix-root-causes instead of hiding the failure with terminal instructions.

## Checks

Run the module suite and clippy.

```bash
REASON_ACP_HARNESS_DIR=/tmp/openconductor-reason-tests bash tools/reason-acp/run-rust-tests.sh
```

On this cloud computer, all 74 Rust tests and clippy passed. The nine lifecycle tests exercise one shared attempt, approved account and workspace, existing login preservation, cancel and late-result protection, stopped polling, timeout and retry, stale cancel, foreground process termination and reaping, production versus fake URL validation, existing-account discovery on a fresh app, external expiry, explicit sign-out reset, and slow-refresh/reset protection. The delayed-link regression also passed.

The fresh-app saved-account regression failed against the old snapshot-only status method, then passed after the canonical refresh fix. Refresh never launches login or logout.

Rust formatting passed. The system Rust installation did not include rustfmt or clippy and was read-only, so these tools ran from a private temporary Rust installation rather than modifying shared tooling.

A full Linux `cargo check --manifest-path src-tauri/Cargo.toml --lib` failed before compiling app code because the cloud host lacks `glib-2.0` and `gobject-2.0` development libraries. macOS package CI must check Tauri integration.

The shared frontend has passed 22 synthetic UI cases across the actual onboarding, Settings and chat entry components. A separate approval-gated HTTP server and fake CLI drive the production Rust lifecycle through 17 browser cases, including real-time 21-second URL waits for fresh and existing-pending sign-ins. All six server/CLI boundary tests passed. See [the runnable fake-server contract and viewed evidence](../../../tools/reason-pairing/README.md).

The integrated frontend passed `npm run typecheck`, `npm run build`, all 1,311 tests from `node --test "src/**/*.test.ts"`, and `npm run lint:colors` on this cloud computer. The combined browser suites and exact-head CI are checked again after the final test increment.

The native signed-out preflight receipt is [recorded separately](native-macos-preflight.json). Native fresh-account browser approval, a real Reason turn, and the containing main-branch package are not proved by the synthetic or preflight results. The sole native driver owns those remaining observations.
