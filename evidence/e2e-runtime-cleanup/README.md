# Hosted E2E teardown repair

## Observed failure, not a passing receipt-qualified candidate

[Run 44043865749, attempt 1](https://github.com/reason-machines/openconductor/actions/runs/44043865749)
ran main SHA `6ceaa15f6d4bb5efb0ad5aa23acff3a6d8ae5ca9`. Both hosted jobs and
all scheduled suite steps passed, but three final receipts reported failed
cleanup. The receipt-qualified streak therefore remains **0/10**.

- Codex job `133904666840`, artifact `14311510050`: Codex chat retained 15 live
  previously observed identities, including the app, a fake adapter and browser
  descendants after the driver exited.
- Reason job `133904666472`, artifact `14311476080`: Codex chat retained 9 live
  browser/wrapper identities; app-flows retained 23.
- All eleven executions (ten suite types) observed port 4444 released afterward.
  Port release alone was not full process teardown.
- The exact executable and observed live executable hash was
  `679c9c4863a462045c9b49eb854808f44412be96c9955ac85659b9761505816c`.
- Receipt app-data classification incorrectly included descendant browsers'
  `cache.db` directories. This was a metadata attribution bug, not evidence that
  those browser caches were Tauri's application-data directory.

Both artifact archives were downloaded through the supported Actions tool and
SHA-256 verified. `observed-run.json` preserves their IDs/digests, run/job/source
bindings, canonical path observations, listener attribution and failed-survivor
metadata. It contains no environment/config/database contents or credentials.

Current main was re-read at `c4089fef7d3e64c7a2de445c3bac5545cc5e7932` before
the repair; the affected sources were unchanged from the tested source.

## Smallest repair

- Keep the recorder read-only and return its captured pre-teardown identities.
- Add explicit owner-scoped teardown to only the two affected suite entry points,
  after their existing session deletion/driver stop. Stop only PID/start-tick
  identities in the captured tree and their attributable descendants; handle
  reparenting, reject PID reuse, skip zombies and bound TERM/KILL waits.
- Preserve final independent observations: unavailable data is unverified and
  surviving processes still fail cleanup. No global/name/port-based kills.
- Attribute application databases only to file descriptors held by the exact
  app executable, not browser descendants with coincidentally named cache files.

Product code, auth/adapter modes, assertions, suite ordering, workflow triggers,
timeouts and native boundaries are unchanged. App-flows still uses the disposable
hosted job HOME; first-run legitimately reports no project/worktree before any
repository is created. No protected app/data or another owner's process was
accessed or changed.

## Verification

- Before: the expanded receipt regression suite **failed 2/14** tests: no
  captured ownership returned and browser caches misclassified as app data.
  `regression-red.tap.gz` retains that run.
- After: **57/57 passed** with:
  `node --test tools/e2e/runtime-receipt.test.mjs tests/e2e/webdriver.test.mjs tests/e2e/startup.test.mjs tools/e2e/reason-chat-settings.test.mjs`.
  See `combined-green.tap`.
- Includes synthetic controls for reparenting, late descendants, reused PIDs,
  zombies, denied/missing observations and failed signals, plus actual bounded
  termination of an inert child Node process that ignores SIGTERM.
- Syntax and whitespace checks passed for the changed modules and suite entries.
- Built-app execution of the repair is **not yet run**. It requires the next
  serialized hosted main E2E run after merge; nothing was redispatched for this
  audit. No local/native app, WebDriver or network server launched. No UI change,
  hence no new UI screenshot.
