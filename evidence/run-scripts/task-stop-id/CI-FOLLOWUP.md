# Stop-target successor tests after PR #1217 CI

Conductor Rebuild inspected [the failed frontend job](https://github.com/reason-machines/openconductor/actions/runs/43353649178/job/131650394999) for head `9a7289679aa9cf6b65e3e63c0e2159307871419d`. Its frontend unit step reached 4,129 tests: 4,127 passed, two failed, none skipped, cancelled or todo. Typecheck passed; the build was skipped after the test failure.

Both failures were strict Stop IPC expectations: the tests expected `scriptId: null`, but the corrected ordinary Run consumer sent `scriptId: "dev"`. The retained REA producer/consumer proof in [source.json](source.json) establishes why the displayed task ID is intentional. No production change is made in this follow-up.

## Explicit original-to-successor identities

The original source bytes remain in Git at the failed head and in the owner's inert source packet. These are successors, not unchanged-original passes. No case, fixture action or other assertion is removed, relaxed, skipped or made conditional.

- [Original completion source](https://github.com/reason-machines/openconductor/blob/9a7289679aa9cf6b65e3e63c0e2159307871419d/src/scripts/runCompletion.test.ts), SHA-256 `3fb1b9bad41e2e2ece03b844a6c6b5410d1a939c12cd3fbedb00c7f8bb0b3234`: `actual Run panel displays a busy Dev admitted after the picked Test finishes and Stop keeps the pick` becomes `actual Run panel stops only the displayed busy Dev and keeps the picked Test`. Only that title and the Stop operand expectation change (`null` to `"dev"`). All 13 executed cases remain (11 literal cases plus two parameterized natural-exit cases). Successor file SHA-256: `0beacef84397ad22e65d674fc56ebdc446a34a600faac165a357ca8ea2601fee`.
- [Original task-menu source](https://github.com/reason-machines/openconductor/blob/9a7289679aa9cf6b65e3e63c0e2159307871419d/src/scripts/runTaskMenu.test.ts), SHA-256 `0e22db36d28e32759a4d50ae81a3f2c2ce62758db3eb8b3eca03a2a1c3d22336`: `actual primary Run and Stop retain their existing script commands` becomes `actual primary Run retains its command and Stop targets the displayed task`. Only that title and the Stop operand expectation change (`null` to `"dev"`). All eight cases remain. Successor file SHA-256: `46b95bf14fa8486bfa8537ef07c9b8fcc5322b39b8f246756efc26a3f5fba01e`.

The completion successor still verifies admission of busy Dev over the picked Test, absence of old output while Dev is shown, no unintended start, restoration of the original pick after Stop, and restoration of Test output. The task-menu successor still checks the complete start and stop command envelopes. Spotlight's separate commands remain unchanged. The replacement-task preservation cases in `runActionErrorContext.test.ts` remain unchanged.

## Source qualification and validation status

Fresh main `b35aeedc5ff71381e2f740367233462b500810c9` was incorporated through a normal merge on the existing assigned branch. A Python equality check proved that each successor differs from its preserved original by exactly the named title and Stop-target expectation; every other source byte and case count is unchanged. `git diff --check` passed.

The product SHA-256 remains `092f31ca358a04510d9fd77e56dd0a6b65eed9e883d11d9208639ef13f9444f5`; the Stop eleven-case successor remains `604e459b1186bad03190014a970473a564341fa9f18414d9d33253fd4cea30cb`. Package and root lock files are unchanged. Capacity v2, Copy13 and input21 are excluded.

The matched corrective allocation `ACC_1F_STOP1217_CI2_20261113T0250` ran one unchanged-root-lock setup, exit 0, then the exact five-file command, exit 0 with **43 tests passed**, zero failures, skips, cancellations or todos. The 43 cases are 11 action-error, 13 completion, six selection-history, five Run-tab and eight task-menu cases.

The receipt helper incorrectly expected 41 cases, counting only the literal completion cases. Its own post-TAP equality assertion stopped the sequence before typecheck. This was a bookkeeping failure, not a frontend test failure. The helper was not retried and the original receipt is retained. At that partial checkpoint, refreshed typecheck had not run. The allocation explicitly released at `2026-11-13T02:52:05.146163Z` after 13.771 seconds within its 900-second bound, with `ownjobs: []`; a later process-group check found both owned groups absent. Source and package/lock hashes remained unchanged. The sole ACC then admitted a separate typecheck-only continuation, recorded below; the earlier allocation was not reused.

[Raw receipt, argv, stdout, stderr and executed helper](ci-validation/) retain the actual partial sequence. The separate matched `ACC_1F_STOP1217_TSC_20261113T0254` continuation subsequently ran typecheck once, exit 0 with empty stdout and stderr, in 33.936 seconds. Exact source hashes and installed own-root dependency presence qualified in 0.002 seconds. It explicitly released at `2026-11-13T02:57:04.784850Z`, 33.938 seconds after actual start within the 240-second bound, with `ownjobs: []`. [The typecheck receipt and raw streams](tsc-validation/) retain its exact argv, timestamps and hashes. No setup or tests were repeated.

Commands actually run in these two separate allocations:

```bash
NODE_OPTIONS=--max-old-space-size=1024 nice -n 19 \
  timeout --signal=TERM --kill-after=5s 600s \
  npm ci --ignore-scripts --no-audit --no-fund

NODE_OPTIONS=--max-old-space-size=512 nice -n 19 \
  timeout --signal=TERM --kill-after=5s 60s \
  node --test --test-concurrency=1 --test-reporter=tap \
  src/scripts/runCompletion.test.ts src/scripts/runTaskMenu.test.ts \
  src/scripts/runActionErrorContext.test.ts \
  src/scripts/runSelectionHistory.test.ts src/scripts/runTab.test.ts

nice -n 19 timeout --signal=TERM --kill-after=5s 120s \
  node --max-old-space-size=2048 node_modules/typescript/bin/tsc --noEmit
```

No build, native/browser/provider execution, workflow dispatch, retry or alternate dependency tree is included. Native signal delivery, event ordering, visual parity and installed-package behavior remain unverified. The existing ready PR stays unmerged until every enabled exact-head workflow passes.
