# Reason sign-in boundary diagnostics

This is test-only observation, not a sign-in repair or a Conductor parity claim.

## Trigger

PR #1071 baseline `5905b3873b2be2153b7b1c6297bed51b603acdb6` failed in automatic hosted run [43068992778, job 130691478819](https://github.com/reason-machines/openconductor/actions/runs/43068992778/job/130691478819). The `agents-reason` flow timed out waiting for the pairing code. Artifact `13877247851` shows the idle sign-in button without a prompt or error.

The later `account-reason-sign-out` failure depends on that first failure. The flow removes its signed-out marker only after observing the code, so the failed run never reaches that step.

The thirteen auth, fixture and click-boundary source files checked at main `c25670504400771e2fb31e01560db249ea4bd06c` matched the failing baseline. Existing logs did not identify whether the click reached the sign-in handler and IPC command.

## Observation contract

`tests/e2e/reason-login-diagnostics.mjs` temporarily observes only the existing sign-in click and pairing-code wait in `tests/e2e/flows.mjs`.

- Button snapshots contain fixed identity and state labels, plus disabled and connected flags.
- Document capture and bubble listeners record fixed target labels and the trusted-event flag. Icon descendants map to the primary button. Missing bubble delivery does not establish that no click occurred.
- The temporary Tauri invoke wrapper records only four fixed Reason command names, call/completion labels and allowlisted state tags. It forwards the same receiver and argument objects and returns the original Promise. Arguments, responses and errors are never retained in observations.
- Unknown states become a fixed sentinel. URLs, pairing codes, account fields, credential values, DOM text, markup and error messages are not recorded.
- Records are bounded at 256. Restoration removes listeners, prevents late responses from adding records and restores invoke only if this observer still owns it.
- Observation and logging failure do not replace the original flow result. The original click, selectors, assertions and 20-second code wait remain unchanged. No IPC, retry, extra poll or authentication action is initiated by the diagnostic.

Observing Promise completion attaches a rejection observer. This can affect unhandled-rejection reporting, even though callers receive the original Promise and error. The diagnostic is limited to this test boundary and is not installed in shipped application code.

## Reading hosted output

The automatic built-app job prints a `[reason-login-diagnostics]` JSON record whether the code wait succeeds or fails.

A trusted document click establishes event delivery, not React handler execution. An IPC `call` establishes that the JavaScript invocation wrapper was reached, not that Rust admitted it. A `reason_login_start` completion with `starting` establishes the returned command state. Compare those observations with the allowlisted UI state snapshots rather than inferring a product defect from a missing code alone.

## Verification limits

The companion mock-only unit tests cover forwarding, Promise/error identity, redaction, bounded retention, cleanup and preservation of the original click/wait result. They run through the existing automatic hosted WebDriver transport/startup test step. They do not establish real Tauri command wrapping or actual click delivery.

Local Node, browser, native, provider and credential execution were not run. Native macOS, real-provider and real-IPC behavior remain unverified. Hosted results must be attributed to their exact commit and job before drawing a causal conclusion.
