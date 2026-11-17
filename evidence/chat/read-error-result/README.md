# Exact Read failed-result correction

Conductor Rebuild owns this standalone change against qualified main `d2602d267460dd67e467e7622f1ee357c085bca2`. BE7 retains source oversight. Frozen #847, its branch and history are untouched. The [source binding](source-binding.json) records the original attachment identity and current-main reconciliation.

## Cause and correction

The accepted string result and failed status survive the Reason adapter, reducer and view. `Row` suppresses its shared `output` on errors. Exact Read consumes that suppressed value but has no independent error row, leaving a `Reading` header without reachable failure text.

The sealed correction changes only the Read arm, with three added and two removed lines. `readResult = name === "Read" ? result : output` supplies the existing cleaning and label functions. NotebookRead, the shared output binding, helpers, shell, image gating, syntax highlighter, providers, persistence and I/O remain unchanged. It adds no forced-open state or retry.

The [immutable source proposal](source-packet/README.md) explains the producer-to-consumer trace and the bounded #1004/#1200 provenance. Those proposal files describe their historical unexecuted state, not later validation results.

## Retained Conductor evidence

[The original REA receipt](reference/source-receipt.json) identifies Conductor 0.87.6 evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. During this delivery the two retained full assets and fourteen reference spans were hash-checked and each span was rejoined to its exact UTF-8 byte range. Only those small spans are committed, not full proprietary assets.

[O0o](reference/O0o.txt) consumes the original string result without suppressing it by error status. [L0o](reference/L0o.txt) cleans text, [w0o](reference/w0o.txt) displays numbered lines and [Mu](reference/Mu.txt) controls disclosure. The remaining spans retain routing, producer and image-predicate evidence.

These are retained shipped-byte observations, not a fresh installed-app capture. The historical REA semantic pass exhausted heap and skipped the renderer. This delivery introduces no semantic rerun or new REA observation. Native visual parity, a genuine provider failure, installed behavior and package inclusion remain unverified.

## Explicit assertion successors

The [three original control files](archive/) remain byte-for-byte unchanged in the archive. Only two ordinary failed-text expectations migrate. The syntax test now checks the reachable retained error, status, line offset, collapse and reopen. The image fixture changes only `failed-text` plus its sealed digest. Its other twenty-seven cases, failed-image gating and every earlier syntax assertion remain unchanged.

The twelve-case regression imports the actual Reason adapter, reducer, view and production ConductorToolRow module with real React and highlighting. It checks retained results and status, cleaned literal text, labels, offsets, controlled disclosure and file navigation. GREEN additionally reaches the unchanged NotebookRead and structured-raw-result controls. The source packet's [finite validation instructions](source-packet/VALIDATION.md) predict exactly five label failures and seven controls before the correction, then twelve passes. Predictions are not measurements.

## Verification state

Passed on Reason Cloud using Python/git only:

- Original attachment SHA-256 and all thirty-six versioned packet file identities.
- Both retained asset hashes and fourteen exact span joins.
- All eighteen current-main source identities, including package and lockfile, match the source proposal.
- `python3 evidence/chat/read-error-result/verify-source.py baseline`.
- `git diff --check`.

ACC directly admitted the same Read interest as `ACC_READ12_2CFF_20261113T0315`. On the actual Reason Cloud checkout, one lock-matched `npm ci --ignore-scripts --no-audit --no-fund` completed with React 18.3.1, react-test-renderer 18.3.1 and TypeScript 5.9.3. The immediate source and dependency check retained all eighteen baseline identities and the original attachment digest.

The immutable twelve-case command reproduced exactly five `READ_ERROR_LABEL_*` assertion failures and seven passing controls. Only then were the two retained patches applied. The identical command passed all twelve cases with no failures, skips, cancellations or TODOs. The unchanged failed NotebookRead and structured-raw-result supplementary controls were reached in GREEN, not baseline.

The seven adjacent files collected 106 tests. Of these, 105 passed and one failed before its replay because `disclosureRemount.test.ts` requires every current source byte to match its committed Git blob. The exact candidate was still uncommitted, so the actual `ToolRows.tsx` blob differed from HEAD. The guard and every other adjacent expectation remain unchanged. Execution stopped without a retry; actual-checkout typecheck was not reached. The [raw receipt](validation/receipt.json), unmodified phase output and [bounded driver](validation/run-admitted.py) preserve this partial result.

All eight owned process groups were absent on terminal RELEASE at `2026-11-13T03:17:43.642139Z`. The newly installed own-root dependency tree was removed. That first failed partial receipt is preserved, not relabeled. A second admission stopped at source preflight before any setup or test when main advanced. After source-only reconciliation, ACC admitted the fixed effective tree as `ACC_READ12_2CFF_BOUND_INPUTS_20261113T0325`.

On committed candidate `a4182d5ae1529219e5f183c56885b1cab759bd36`, the unchanged full seven-file adjacent command passed all 106 tests, including the guarded baseline/candidate remount replay. Actual-checkout `npm run typecheck` passed with a 1024 MiB heap. Source and dependency guards retained all eighteen original manifest bytes, all 1,146 current source blobs matched HEAD, and no source module was untracked. RED/GREEN was not rerun. The [remaining-check receipt](validation/bound-0325/receipt.json) preserves exact argv, source blobs, counts, status, timestamps and raw output. Terminal RELEASE was `2026-11-13T03:26:04.489556Z` after 56.424917 seconds; all four owned groups were absent and the newly installed own-root dependencies were removed.

No new queue entry, ordinal, runner, browser, server, native, provider, Rust, build, package or full-CI dispatch was created. There is no screenshot because browser/native execution is outside these allocations. A ready standalone PR against main must pass every applicable exact-head check before protected merge; native and package observations stay with the existing ACC/992 route.

The sole ledger owner receives area evidence through the coordinator. This change does not edit aggregate ledgers or rescore native parity.
