# FDA notification guard compatibility

Conductor Rebuild corrected PR #1189's two hosted FDA guard failures without changing production, the pinned FDA baseline, the seven-case FDA fixture, the eight-case mention regression, previous notification evidence, dependencies or root lock. Checked main: `2ffcb278ff76c92716e98c5f9de6f90b49027b39`. The current-main General page still differs from this branch only by the previously qualified mention permission-gate import and row.

## Failure and smallest correction

Exact-head CI `438d2fea9b5cd77a59e0a91b4e61f20cf4858277` passed typecheck but failed the FDA notification mutation wrapper and frozen baseline/candidate wrapper. Build did not run after the unit-test failure. `hosted-failure.json` preserves the check identity and failure lines.

The FDA verifier used the removed generic mention row as its Agent-block end marker. Its mutation suite also assumed shared permission/denial statements occurred only once in the whole page. Both assumptions became false when the mention control gained the required permission gate.

Only these three files change in this corrective continuation:

- `evidence/settings/full-disk-access/verify.py`: retain the hash-pinned baseline and compare the whole Agent-plus-mention span through the unchanged Completion sound boundary. Permit only the exact prior denial-feedback delta and exact qualified mention-row delta; reject every other difference in that span.
- `evidence/settings/full-disk-access/notification_guard_test.py`: scope each existing mutation independently to Agent and mention rows. Add three tests rejecting rollback to the ungated mention row, a wrong mention preference and extra row content. The expanded suite contains nine tests, with row-specific subtests.
- `src/settings/fullDiskAccess.test.ts`: change only the mutation-suite count assertion from six to nine. This wrapper is **not byte-identical**; reversing that one count change reproduces the original bytes exactly. All remaining wrapper assertions are unchanged.

`originals/` retains the original three files. `before.json` records their hashes, production/frozen-input pins, runtime version and all forty matching installed direct-dependency versions. `prepared-correction.json` remains the original unapplied preparation record; execution supersedes its historical status.

## Measured baseline and corrected results

All phases ran once, sequentially in the foreground on Reason Cloud352 under existing request `6238a3c9` and direct grant `09a5dc6b-8484-4575-b6a9-92148b1bcad1`. Every phase used nice 19, a 180-second timeout, a five-second kill allowance, Node heap at most 1024 MiB and test concurrency one. Matching dependencies were already present: no install, restore, retry or additional runner ran.

The identical FDA baseline/corrected command was:

```bash
NODE_OPTIONS=--max-old-space-size=1024 nice -n19 timeout --kill-after=5s 180s node --experimental-strip-types --test --test-concurrency=1 src/settings/fullDiskAccess.test.ts
```

- **Baseline reproduced:** two failed and two passed wrapper tests, exit 1. The observed missing-boundary and duplicate-token failures match hosted CI. These are guard incompatibility failures, not new product RED.
- **Corrected passed:** four of four wrappers, exit 0. The unchanged seven-case FDA behavior still produces its expected baseline two passes/five intended assertion failures, followed by candidate seven passes. The opener rejection and Config Sync controls also pass.

The identical direct Python baseline/corrected command was:

```bash
NODE_OPTIONS=--max-old-space-size=1024 nice -n19 timeout --kill-after=5s 180s python3 evidence/settings/full-disk-access/notification_guard_test.py
```

- **Original baseline reproduced:** six tests, four assertion failures and two missing-boundary errors, exit 1.
- **Expanded corrected passed:** nine tests, including independent row mutations and all three additive rejection tests, exit 0. The suite was deliberately expanded; its source is not claimed byte-identical.

Retained behavioral controls and static check:

```bash
NODE_OPTIONS=--max-old-space-size=1024 NOTIFICATION_DEPS="$PWD" NOTIFICATION_SOURCE_ROOT="$PWD" nice -n19 timeout --kill-after=5s 180s node --test --test-concurrency=1 evidence/settings/notification-permission/mention-gate/replay.test.cjs
NODE_OPTIONS=--max-old-space-size=1024 NOTIFICATION_DEPS="$PWD" NOTIFICATION_SOURCE_ROOT="$PWD" nice -n19 timeout --kill-after=5s 180s node --test --test-concurrency=1 evidence/settings/notification-permission/replay/notificationGate.test.cjs evidence/settings/notification-permission/replay/concurrentSettings.test.cjs evidence/settings/notification-permission/denial-feedback/replay.test.cjs
NODE_OPTIONS=--max-old-space-size=1024 nice -n19 timeout --kill-after=5s 180s node node_modules/typescript/bin/tsc --noEmit
```

- **Mention passed:** all eight original frozen rendered-checkbox cases, exit 0.
- **Adjacent passed:** all sixteen retained notification/denial/concurrency cases, exit 0.
- **Typecheck passed:** one invocation, exit 0, no diagnostics.
- **Static integrity passed:** all 54 untouched before-pins match, including production, FDA fixtures/baseline/replay, mention inputs and root lock. All three edited files exactly match the prepared correction. `git diff --check` passed.

`execution.json`, raw losslessly compressed TAP, Python logs and per-phase command/exit/timestamps record actual execution separately from static integrity. `SHA256SUMS` pins these artifacts. There are no skipped/cancelled cases in the executed Node suites.

Runtime was explicitly released at `2026-11-12T16:49:17Z`, with no own jobs or Node/npm/Python/Vite/Cargo/Rust/Playwright processes. The generated Python cache was removed before release. Publication and exact-head hosted CI do not hold that runtime slot.

## Limits and existing ownership

The React checks substitute permission and persistence APIs. They verify rendered-checkbox writes, denial feedback and preservation of concurrent settings under those inputs, not a real macOS permission prompt, disk persistence, native notification delivery, screenshot/visual parity or package inclusion. No browser, server, native, provider, authentication, local build or package work ran under this grant, so no screenshot exists. Hosted CI on the newly published head remains a separate required merge gate.

REA provenance and its retained semantic-analysis heap limitation remain recorded in the parent evidence. This corrective continuation makes no new claim about Conductor behavior. Toast files, Agent product behavior, the frozen #992 package scope and existing release/native owners remain unchanged. No watcher, queue entry or executor was added.
