# COMPOSER-ATTACH-FOCUS-135

Conductor Rebuild, 2026-11-17. Independent successor against `main`; not stacked on #1432/#1447. Fresh default head inspected: `2ada6e3e186391695cae1ce5694ac251a6323079`, the confirmed actual #1447 squash. Frozen #1432 branch and earlier evidence remain untouched.

## Minimal change

Only the `WorkspaceView.attachFiles` callback changes in production:

```diff
 async function attachFiles(files: File[]) {
+  const box = inputRef.current;
   await session.attach(files, reason ? (relativePath, data) => draftAttachmentsApi.write({ draftWorkspaceId: workspace.id, relativePath, data }) : undefined);
+  if (files.length > 0 && inputRef.current === box) box?.focus();
 }
```

A nonempty attachment attempt refocuses its captured editor only after the existing attachment promise settles and only if that handle is still current. Empty selections, detachment, handle replacement and missing initial editors do not acquire focus. Existing attachment state, rejection behavior, reader/editor/native/Composer APIs are unchanged. The existing settlement test gains only `inputRef: { current: null }` in its callback evaluator ports; all test bodies/assertions remain byte-unchanged.

## Frozen RED → GREEN

The final qualified fixture was copied byte-for-byte to `src/features/chat/composerAttachmentFocus.test.ts`. SHA256: `abd563456f9d1013f73f82fdf370d4efade85a689bbeb12318cbc1f738b44c56`. Test-first local commit `c66eaefc` precedes production edits; server-side publication may consolidate local commits.

Before the patch, all fresh-main WorkspaceView/ComposerSession/ComposerEditor bytes matched the qualified `217498aa` baseline. The only difference in Composer was #1447's already-merged clipboard lifetime guard; Composer is read-only in this change.

```bash
sha256sum -c .qa/composer-attachment-focus-qualified/frozen-before-run.sha256
node --experimental-strip-types --test src/features/chat/composerAttachmentFocus.test.ts
```

- **Baseline:** 7 PASS / 1 intended assertion FAIL / 8 total, exit 1; zero skips/cancellations. Observed `[]` instead of `["original"]` focus after nonempty local read/attachment settlement. One attachment and the draft were otherwise retained. Frozen hashes rechecked unchanged before and after RED.
- **Treatment:** same fixture/command, **8/8 PASS**, exit 0; zero skips/cancellations, fixture hash unchanged.
- Seven controls retained: empty selection; swallowed local read-error/draft state; detachment while read pending; replacement handle; absent initial editor; separate composer isolation; adapter rejection. Pending work remains with its original session. The positive case rejects eager focus. The swallowed-error case deliberately does **not** invent a native-write-error focus policy.

`baseline.tap.gz` is the exact local RED output in lossless gzip (Node assertion output contains whitespace-only lines); `green.tap` is the actual treated run. The complete original packet, including historical v1 fixture/typecheck failure and final freeze, is retained byte-exact as `qualification/qualified-input.tar.gz` (SHA256 `b70b7a0a3f9a42eba05ea5d638c7ed1a0c7c387351821b8266a9dd6af0f1d4d4`). In v1 only an unused store.clear return type was corrected; parent verified all eight test-case ASTs unchanged before refreezing/replaying RED. No fixture assertions changed in this implementation.

## Adjacent validation

```bash
node --experimental-strip-types --test --test-concurrency=2 \
  src/features/chat/composerPasteLifetime.test.ts \
  src/features/chat/composerPasteFilePaths.test.ts \
  src/features/chat/composerLongPaste.test.ts \
  src/features/chat/composerCancelFocus.test.ts \
  src/features/chat/composerAsyncSubmit.test.ts \
  src/features/chat/composerSubmit.test.ts \
  src/features/chat/composerAttachments.test.ts \
  src/features/chat/composerAttachmentPreview.test.ts \
  src/features/chat/composerAttachmentSettlement.test.ts \
  src/features/chat/composerSession.test.ts \
  src/features/chat/composerSuggestionKeys.test.ts \
  src/features/chat/composerSuggestionPointer.test.ts
```

**131/131 PASS**, zero failures/skips/cancellations. `adjacent.tap` retains the output. Together with the unchanged dedicated fixture, **139 tests passed**. Existing JavaScript dependencies reused; no dependency/lockfile edits, package acquisition or native build.

`npm run lint:colors`: **PASS**, six checker tests and source scan. The single admitted serialized foreground sequence then ran `npm run typecheck`: **PASS**, followed by `npm run build`: **PASS** (branding, TypeScript and Vite, built in **39.38s**). Chunk-size advisories remain visible in the lossless logs. No tests/build/typecheck ran in parallel; post-sequence process readback found no remaining own build/tsc process and the shared slot was explicitly released. `typecheck.log.gz`, `build.log.gz` and `commands.json` retain these local receipts, distinct from CI on the eventual published head.

## REA-retained source, static only

Already-held Conductor 0.87.6 renderer: 11,600,457 bytes; SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. No reacquisition. Nine complete original declarations/expressions: `ITo`, `PNi`, `IIr`, `SIr`, `Yoi`, `a7i`, `lHt`, `n4o`, `t4o`. Exact UTF8/UTF16 ranges, hashes and lengths are in `qualification/qualification.json`; exact spans in `reference/`. Vendor JavaScript is untrusted inert data: parsed/compared, never executed.

Actual `ITo.W9` awaits `PNi`, rejects empty selection, awaits the bound `IIr.mutateAsync`, then calls captured live-editor focus `de`; button and shortcut reach W9. Complete `lHt/n4o/t4o` closes managed editor readiness/lifetime. **Timing limitation:** complete `IIr` local handling calls `Yoi` and returns `Promise.resolve()` without awaiting processing; complete `Yoi/SIr` preserves that fire-and-forget dispatcher. This proves a nonempty-selection/mutation-settlement focus contract, **not native staging-success timing or native write-error focus behavior**.

The original qualifier was rerun locally with only its output/snapshot directory rebound to `.qa/composer-attachment-focus-qualified`: **9 declarations / 17 bindings PASS**, and its generated qualification remained byte-identical to the original packet manifest. Complete-parent ranges were rechecked from the existing retained renderer. The historical initial extractor's Yoi function/factory assumption error remains in the original packet; it was not a new REA failure.

```bash
node .qa/composer-attachment-focus-results/qualify-reference-local.mjs
node evidence/chat/composer/attachment-focus/verify.mjs \
  .qa/create-suggestions-135/retained/renderApp-D_fmY7hW.js
sha256sum -c evidence/chat/composer/attachment-focus/SHA256SUMS
git diff --check
```

The portable verifier checks all nine complete spans/syntax/ranges and 17 bindings; final fixture identity; fresh-base/qualified identities; the exact whole-file two-line callback treatment; the exact one-port-only adjacent harness change; frozen TAP totals; unchanged read-only boundaries; lease-confined diff. Its optional argument checks the complete parent locally; absence reports that part NOT_RUN, not a fabricated PASS. No full vendor renderer is committed. The unmodified original qualifier and its manifest remain under `qualification/`; unpack `qualified-input.tar.gz` into an isolated scratch directory to inspect all frozen source snapshots/historical inputs without touching production source.

## Explicit acceptance gaps and custody

**No screenshot or recording:** no browser/native/runtime admission was used. The fixture extracts the actual parent callback (it does **not** mount WorkspaceView), uses real ComposerSession and inert storage/file-read/editor ports. This is not full-app/TipTap, native picker, real macOS focus, OS attachment delivery, native staging timing, reader/normalizer/final agent input, provider, signed/installed package or final side-by-side behavior proof. Native write-error focus policy is not asserted.

Package #1791/EEF does not contain this successor. Existing exclusive release/native custody must separately prove the actual merge is included in an admitted successor package, then verify nonempty attachment focus and empty/detached/replaced-editor controls on that build. No native/browser/app/provider/package execution/acquisition, release dispatch, installation, watcher or duplicate qualification page was started. SAME135 retains the source qualification page and independent integration. All executed checks on the exact published head must pass before merge; skipped jobs are reported separately, not treated as passing executions.
