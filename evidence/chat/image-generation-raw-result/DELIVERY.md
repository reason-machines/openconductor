# Generated-image raw results — standalone delivery

Author: Conductor Rebuild. Contract: IMAGE-GENERATION-RAW-RESULT-BE7.

## Fresh-main integration

This successor is based directly on actual #1431 squash `9fec58cb697ab6947c4c9acd0e8ebd9295f1aab3` on main, not appended or stacked on the former open PR. Source/test commit: `18444562a1c6f3e560903384bc6983dd1ed1025c`. The earlier qualification, V1 correction, baseline and non-passing attempts in QUALIFICATION.md remain historical, not current delivery state.

Fresh current-default source still selected flattened `result` in the generated-image arm. Complete retained real-Conductor `D1o/Qpo/hIt → Vpo → yZe/Mu` bindings show selection of original `toolResult.content`, existing conversion and trimming. The production change is exactly two additions/one removal in that arm: select `rawResult` with undefined-only legacy fallback, then use unchanged `resultText` and trim. Labels, default-open behavior, extension/path classification, image fetching/preview, copy/open actions, shared helpers/styles, other row arms, backend and providers do not change.

## Before / after on current main

Frozen final V2 fixture SHA256 is unchanged: `267a2f2e09ba9c7bf87cce71f7ac622ac46baa53a9864f166b0493069c537edb`.

Before editing production, on untouched actual #1431 merge:

```bash
node --test --test-concurrency=2 src/features/chat/imageGenerationRawResult.test.ts
```

**Reproduction passed:** 12 passing controls / exactly 12 intended `ERR_ASSERTION` failures, exit 1; 24 cases executed, zero skipped/cancelled. No import/setup failure counted as RED. After the scoped change the identical frozen fixture passes all 24 cases as part of the focused command below.

**Focused passed 159/159**, exit 0, zero fail/skip/cancel:

```bash
node --test --test-concurrency=2 \
  src/features/chat/imageGenerationRawResult.test.ts \
  src/features/chat/imageGenerationFallbackDisclosure.test.ts \
  src/features/chat/typedSubagentRawResult.test.ts \
  src/features/chat/genericStructuredResult.test.ts \
  src/features/chat/prefixMcpStructuredResult.test.ts \
  src/features/chat/subagentFallbackStructuredResult.test.ts \
  src/features/chat/nodeReplResultTruthiness.test.ts
```

This includes byte-identical Node24 (`20b16994…`) and typed V3 (`dea7a1df…`) controls, in addition to nine original frozen controls checked against current main. No existing test is edited.

The mounted path is real Reason adapter → reducer → buildRows → ConductorToolRow → MoreRows → RowShell. Assertions inspect exact content bytes, original content carriage, labels/status, default-open policy, real disclosure callbacks, controlled closing and absence of image/script execution. External/native/Markdown leaves throw if reached. This is a source-contract regression, not browser or native observation.

**Full chat passed 1,873/1,873**, exit 0, zero fail/skip/cancel on committed source `18444562a`:

```bash
node --test --test-concurrency=2 src/features/chat/*.test.ts
```

The first precommit full run failed 1 of 1,873 cases because the unchanged disclosure-remount integrity guard requires every candidate source byte to equal its HEAD Git blob, and this candidate was not committed yet. That result is retained as failed, not passed. Committing the same source/test bytes satisfied that existing precondition; the complete unchanged suite then passed. No production/test changes were made between those full runs.

**Typecheck passed** (`npm run typecheck`) and **build passed** (`npm run build`), exit 0; only the existing large-chunk advisory. Those commands ran on the same source/test bytes before their commit. No Rust/full-repository or manual/native checks are claimed.

**Source/integrity passed:**

```bash
python3 evidence/chat/image-generation-raw-result/verify-source.py \
  --renderer .ara-state/tmp/chat-next-gap/renderApp-D_fmY7hW.js \
  --index <retained-original-index-BGEQ8YjU.js> \
  --root . --baseline 9fec58cb697ab6947c4c9acd0e8ebd9295f1aab3
git diff --check
```

The verifier checks both entire retained parent hashes, 11 complete byte-bound declarations, 15 consumer joins, final frozen V2, nine unchanged controls against current main and the exact image-only hunk. Vendor code is never executed. `fresh-main.json` pins baseline, source, counts, unchanged successor-control hashes and six losslessly compressed raw logs. `delivery.patch` is the exact refreshed-main production delta.

## Acceptance and release limits

Browser/native/provider/package acceptance is **NOT_RUN / UNVERIFIED**. No screenshot exists because app/browser/native execution is excluded from this source-only lane. Real image loading, raw-only result events without flattened output, malformed non-string text fields, provider compatibility, persisted mutation, installed identity and containing-package inclusion are not exercised. Historical REA semantic heap exhaustion is a tooling gap, not native parity.

#1431's actual merge receipt and Node replay controls were sent to the existing ledger and serialized release custodian. Existing runtime/native/package owners retain that acceptance. No duplicate server, provider call, package dispatch, native action or watcher was created. Hosted exact-head CI must clear before this separate ready PR merges; skipped conditional/manual jobs are not passing executions.
