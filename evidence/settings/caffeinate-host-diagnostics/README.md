# Caffeinate host setup diagnostics

Conductor Rebuild / SAME49. Diagnostic-only lease granted by ledger ddfc6518; this is a repair to OpenConductor's test harness, not a Conductor parity or product repair.

## Observed problem and source

The Frontend typecheck + build job for #1381 at `4992c77a4111287f53d93c0f2a746c7513009c4e` reported 4,597/4,599 tests passing. Both Caffeinate graph tests failed during setup with only:

```text
Whole-main host failed before product assertion: {"errors":[],"blocked":[],"unexpected":[]}
```

[Failing job](https://github.com/reason-machines/openconductor/actions/runs/44030187035/job/133859978013), lines 18173–18316. The failure was handed over by the original PR owner; its underlying cause is **UNVERIFIED**. No timing, product, resource, native or IPC cause is inferred from the empty arrays.

Fresh default main `cd5d2064765b8698f1c64795c703254053523cb9` and the pre-edit local harness were byte-identical. The source pins and original graph/archive hashes are in [source.json](source.json).

## Narrow change

Only `tests/settings/support/caffeinateHost.mjs` setup stage labels and the original caught error name/message in its existing JSON failure message change. The original `Error.cause`, snapshot collection, context cleanup, browser/server cleanup and diagnostic `errors`, `blocked`, `unexpected` arrays remain.

No graph product assertion, wait/deadline, native boundary, archived graph, browser API call or product source changed. Removing only the stage assignments and new serialized error fields reproduces the entire pre-edit host byte-for-byte; see [preservation result](validation/preservation.json).

## Frozen regression and checks

The exact original six-case fixture was recovered from this Session's retained tool input, source `ec27838f-a656-42b7-96e5-87e4efbdf52c`, revision 29838404. Its full original bytes plus final newline are [frozen-regression.mjs](frozen-regression.mjs), SHA-256 `1777b03a07ce45e70b29cd087a19203b24aaec86e775608415ce2df82559eb1e`.

The permanent typed six-case test was independently frozen **before host edits**, SHA-256 `c4ee00eac6edd3c88761d3e8a2f7d0902d150e23062fe43189ab8146e7f8b4ba`. It retains the original sentinel/cause/cleanup assertions and also checks exact stage, error name/message and unchanged array fields. Both fixture hashes remain unchanged through RED/GREEN.

All browser, page, server, filesystem-existence and native boundaries in the evaluated `startHost` are mocked. No browser evaluation callback or native boundary is executed. The only evaluated source is our own OpenConductor harness; no extracted Conductor text is evaluated.

- **RED reproduced:** `node --test evidence/settings/caffeinate-host-diagnostics/frozen-regression.mjs` — 0 passed / 6 intended missing-diagnostic failures / 0 skipped, exit 1. [Original RED](validation/original-red.tap).
- **RED reproduced:** `nice -n 19 node --max-old-space-size=512 --experimental-strip-types --test --test-concurrency=1 src/features/settings/caffeinateHostDiagnostics.test.ts` — 0 passed / 6 intended missing-diagnostic failures / 0 skipped, exit 1. [Permanent RED](validation/permanent-red.tap).
- **GREEN passed unchanged:** the identical commands after the harness repair — each 6 passed / 0 failed / 0 skipped, exit 0. [Original GREEN](validation/original-green.tap), [permanent GREEN](validation/permanent-green.tap).
- **Adjacent checks passed:** `nice -n 19 timeout --kill-after=5s 90s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/features/settings/caffeinateHostDiagnostics.test.ts src/settings/agents/secretSavePending.test.ts src/settings/agents/secretRemovePending.test.ts src/settings/agents/secretRevealLabel.test.ts src/settings/agents/secretEditorKeyLink.test.ts src/settings/agents/kitModel.test.ts` — 29 passed / 0 failed / 0 skipped, exit 0. [TAP](validation/adjacent-green.tap).
- **Scoped typecheck passed:** `nice -n 19 timeout --kill-after=5s 60s node --max-old-space-size=768 node_modules/typescript/bin/tsc --noEmit --target es2021 --module esnext --moduleResolution bundler --lib es2021,dom --strict --skipLibCheck --noUnusedLocals --noUnusedParameters src/features/settings/caffeinateHostDiagnostics.test.ts` — exit 0.
- **Full typecheck passed on retry:** `nice -n 19 timeout --kill-after=5s 180s node --max-old-space-size=1536 node_modules/typescript/bin/tsc --noEmit` — exit 0. The first same-command attempt with a 120-second deadline timed out, exit 124, with no compiler diagnostic while the shared cloud computer reported CPU pressure. No source or dependency change was made for the retry. Both logs are retained; CPU pressure is observed context, not a proven cause of that timeout.
- **Passed:** `node --check tests/settings/support/caffeinateHost.mjs`, fixture SHA-256 equality, preservation comparison, `git diff --check`.

[Machine-readable commands/results](checks.json). All checks ran on Reason Cloud using existing dependencies. Full app build and the real whole-main browser graph were **NOT_RUN** locally because this lease excludes app/browser/server runtime and installation. No screenshot is applicable: there is no visible product change or permitted product runtime. No Mac/native/provider/credential action, manual workflow dispatch, extra watcher, executor or package build occurred.

## Delivery and remaining question

This diagnostic repair is saved separately and must not be published into pending-Save #1391. Its ready main-base publication follows that PR's confirmed merge on the supported assigned branch. Every exact-head applicable hosted workflow must pass before merge. A hosted graph failure on a head containing these diagnostics is still needed to identify any recurring #1381 setup cause; six mocked GREEN tests do not identify or fix that cause.

#1386/#1391 package inclusion remains with the existing source-manifest/package owners and single bounded package lookup. Actual containment is unverified; native/visual acceptance is NOT_RUN. This harness-only repair does not ship a running-product behavior.
