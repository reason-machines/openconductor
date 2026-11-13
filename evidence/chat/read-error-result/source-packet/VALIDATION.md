# Validate the Read-error successor under the existing ACC allocation

These commands are prepared, not run. They do not grant an execution slot. ACC must first bind this same Read ownership to its existing serialized runner, exact effective main, dependencies, setup bound, phase timeouts, memory bound, and release procedure. No second runner, native process, install, build, package, or provider call is requested.

## Before execution

Keep #847, its branch, original cfc2fe64, and every unrelated worktree change untouched. Do not change the Session's branch or publish to #847. If no matched current-main execution surface is available without those changes, stop and report that binding blocker to ACC.

Compare the selected execution surface with `main-manifest.json`. Reconcile source drift before running. The effective main in this proposal is `b35aeedc5ff71381e2f740367233462b500810c9`; the sealed input tree has the original Read suppression and both historical control files. Preserve all raw source and input hashes in the grant's existing receipt. A newer main requires an explicit reviewed binding, not a silently relabeled baseline.

Mount only these two new files before baseline:

- `successor/src/features/chat/readErrorResult.test.ts` at `src/features/chat/readErrorResult.test.ts`.
- `successor/src/features/chat/readErrorResult.inputs.json` at `src/features/chat/readErrorResult.inputs.json`.

Use the current runner's already-installed lock-matched dependencies. Do not install or fall back to another prefix. Preserve originals of every existing file that the two unapplied patches name.

## RED, then the identical GREEN command

From that matched actual checkout, use the identical command for both phases:

```bash
env NODE_OPTIONS=--max-old-space-size=768 nice -n 19 \
  timeout --signal=TERM --kill-after=5s 180s \
  node --max-old-space-size=768 --experimental-strip-types --test \
  --test-concurrency=1 src/features/chat/readErrorResult.test.ts
```

Record full unmodified stdout, stderr, exit status, timestamps, source and fixture hashes. Predict five intended `READ_ERROR_LABEL_*` assertion failures and seven passing controls on unchanged product, twelve collected cases, no skips, cancellations, or TODOs. A loader, compiler, missing dependency, timeout, exception, or different failure is not the intended RED. Diagnose and reconcile it under the existing owner instead of silently retrying or altering expectations.

Only after the intended RED, apply exactly `read-only-result-selection-UNAPPLIED.patch` and `historical-assertions-successor-UNAPPLIED.patch` to that same target. The first changes three lines in the exact Read arm. The second migrates the two historical failed-text controls plus the corresponding image input digest. No other product or control changes are authorized by this packet.

Run the identical command again. All twelve cases must pass with zero failures, skips, cancellations, or TODOs. The failed-permission case also executes unchanged failed NotebookRead and structured-raw-result retention controls after its new primary expectation passes. Do not describe those supplementary baseline assertions as executed when the earlier baseline assertion stopped that case.

## Adjacent contracts

Run once under the same finite allocation, capturing its own status and raw output:

```bash
env NODE_OPTIONS=--max-old-space-size=768 nice -n 19 \
  timeout --signal=TERM --kill-after=5s 180s \
  node --max-old-space-size=768 --experimental-strip-types --test \
  --test-concurrency=1 \
  src/features/chat/readSyntaxHighlight.test.ts \
  src/features/chat/readImageDisclosure.test.ts \
  src/features/chat/conductorTools.test.ts \
  src/features/chat/toolErrorRetry.test.ts \
  src/features/chat/writeRows.test.ts \
  src/features/chat/disclosureRemount.test.ts \
  src/features/chat/imageGenerationFallbackDisclosure.test.ts
```

The migrated image input keeps exactly 27 other cases identical, including failed-image disclosure. Every syntax assertion before the final empty/error control remains unchanged. The real syntax suite and Write fixture retain their established actual highlighter seam. No preview assertion migration belongs in this packet. If preview owner141 has since changed the fallback loader, reconcile its independently landed module seam without touching its expectations or assuming this original binding is still exact.

Typecheck the same actual checkout:

```bash
env NODE_OPTIONS=--max-old-space-size=1024 nice -n 19 \
  timeout --signal=TERM --kill-after=5s 180s npm run typecheck
```

Check the final patch and preserve the runner's existing proof/release records:

```bash
git diff --check
```

Record a distinct failure if any phase fails. Confirm owned process groups and support are empty through the established ACC procedure before release. No retries, parallel phase, server, background watcher, package build, or native inspection is implied.

## Delivery after runtime qualification

Source ownership stays with BE7. A ready standalone main PR still needs a supported fresh-main publication binding that does not adopt frozen #847 or change its assigned branch. Preserve all unpublished commits. Once that binding is available, commit only the minimal product change, new regression pair, justified successor assertions and evidence. Do not include retained full proprietary app assets or unrelated .rea-work files in a commit. Open ready against main and merge only after every applicable exact-head workflow passes. An unrun workflow is not green.

There is no browser/native screenshot because that allocation has not been admitted. Native, package, provider, and containing-release behavior remain unverified unless the existing respective owners supply actual evidence; neither source checks nor mounted React execution substitutes for those observations.
