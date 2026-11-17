# COMPOSER-PASTE-LIFETIME-135

Conductor Rebuild, 2026-11-17. Source-only successor after #1432 and #1446, independently based on fresh `main` **217498aae38dfd63b97919b1a0ab4097462c691e**. #1432's branch and historical evidence were not modified.

## Change and reproduced failure

`Composer.tsx` captures its editor handle before an asynchronous clipboard read. Actual `ComposerEditor.tsx` cleanup detaches that handle before destroying the editor. The callback previously focused, selected and inserted through the stale handle after unmount.

The only production edit is the resolution guard:

```diff
-        if (!text) return;
+        if (!text || inputRef.current !== box) return;
```

This preserves the current live editor's focus and selection-time insertion, whitespace content, empty/null handling and the existing reader. It also checks editor-handle identity, rather than substituting the current editor for an old pending request. No reader/editor/native/provider/settings change or new rejection/cancellation policy.

## Frozen test-first evidence

The qualification archive's original bytes have SHA-256 `5d7c653ba29d2d566153f54ce2b7d68d4a6b26bad11bf7e7b1092b7c84ca044e`. Its new dedicated test was copied byte-for-byte to `src/features/chat/composerPasteLifetime.test.ts`:

- Fixture SHA-256 **fd1a42f871d8324250ba1ae886cd772bd74ce4c7c5ca66eedd419336ea93b301** before RED, after RED and after GREEN.
- Baseline Composer SHA-256 **d110236404a7916fcb9de706eed42df54bcc87953a7358198e0b2974243789ae**, matching both fresh main and the packet snapshot.
- Test-first local commit `7a7b420b` preceded the production edit. Publication may consolidate local commits; the retained logs and hashes identify the actual baseline and fixture.
- `node --experimental-strip-types --test src/features/chat/composerPasteLifetime.test.ts`: **6 pass / 1 intended assertion failure / 7 total**, exit 1 before the edit; **7/7 pass**, exit 0 after. Zero skips/cancellations in both.
- Failure: after mounted Composer cleanup detached the handle, deferred clipboard resolution produced `focus` and `replaceRange` instead of no events. No setup failure.
- All six controls remain unchanged: live focus/exact selection insertion, null, empty string, whitespace, absent handle/no clipboard read, and isolation from another mounted Composer.

The fixture mounts the actual TypeScript-transpiled Composer with React test renderer, real queue/document/shortcut helpers, an inert editor boundary and a deferred clipboard adapter. Its editor cleanup clears the same ref that the actual editor clears. The retained vendor code is never executed. This does not simulate the full TipTap/browser/native editor.

`baseline.tap.gz` (lossless gzip) and `green.tap` are this successor's actual runs. `qualification/parent-baseline.tap.gz` is explicitly historical parent evidence, not a new run. Both RED logs preserve their exact original bytes in gzip because Node assertion output includes whitespace-only lines that fail the repository diff whitespace check; no output or assertion was edited. The original parent's initial class-extractor failure is retained as `qualification/parent-extraction-error-v1.txt`; the corrected source verifier and this successor's rerun passed without changing the frozen regression fixture.

## Original REA source qualification

Existing complete retained Conductor 0.87.6 renderer: **11,600,457 bytes**, SHA-256 **5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde**. No reacquisition. The full parent remained available in this checkout and was rehashed locally; no held-parent limitation applies to this run. It is not committed here.

Nine complete inert declarations are retained under `reference/`; `qualification/qualification.json` preserves their exact original UTF8/UTF16 ranges, lengths and hashes. Fifteen binding assertions connect actual `ITo` composer → `DNi` capture → async `bwo` read → captured editor `!isDestroyed` gate → `XQ` current-selection replacement. `lHt` → `n4o` → complete `t4o` connects editor readiness and lifecycle cleanup/scheduled destruction. Original `aRt`/`vwo` readers differ from our adapter and remain out of scope; no reader/native parity is claimed.

The original inspected qualification script is retained unchanged as `qualification/qualify-source.mjs`. It uses its parent's scratch layout, not this directory. For this successor it was rerun after copying the packet to `.qa/composer-refill-1500`, including the exact frozen test at `worktree/src/features/chat/`:

```bash
node .qa/composer-refill-1500/qualify-source.mjs
```

**PASS: 9 complete exact-parent declarations and 15 explicit bindings**; generated qualification JSON matched the original packet byte-for-byte. The portable verifier below also reparses all complete declarations as inert data, checks their hashes and joins, the frozen fixture, baseline/current read-only source boundaries, exact one-line treatment and leased diff, and TAP totals:

```bash
node evidence/chat/composer/paste-lifetime/verify.mjs \
  .qa/create-suggestions-135/retained/renderApp-D_fmY7hW.js
sha256sum -c evidence/chat/composer/paste-lifetime/SHA256SUMS
```

Both **passed**. Without the optional parent argument, the verifier explicitly reports full-parent range verification NOT_RUN rather than inventing proof. `qualification/frozen-before-run.sha256` is the original **baseline** manifest: it passed before and after RED, and intentionally does not describe the treated Composer.

## Validation on Reason cloud

Exact commands and exit codes are retained in `commands.json`; full logs are in this directory.

- Dedicated frozen fixture: **6P/1F RED → 7/7 GREEN**, unchanged SHA above.
- Adjacent clipboard/long-paste/cancel/async-submit/submit/attachments/session/suggestion tests: **124/124 PASS**, no failures, skips or cancellations.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**, branding + TypeScript + frontend Vite build. Existing dynamic-import/chunk-size advisories remain; these are not errors.
- `npm run lint:colors`: **PASS**, six checker tests plus source scan.
- Source/range/integrity/lease verifier, SHA manifest and `git diff --check`: **PASS**.

Existing JavaScript dependencies were reused; package and lock files were not changed. No native build or workflow dispatch occurred. The local results are not a claim about final published-head CI. Merge waits for every executed check on the exact published head to pass; conditional skipped jobs are not passing executions. Parent SAME135 retains independent integrated verification and the existing qualification page; no duplicate page is created.

## Explicit acceptance gaps and exclusive custody

**No screenshot or recording:** native/browser/runtime custody was not used or admitted in this source-only lane. These mounted inert-boundary tests are **not OS clipboard, real focus/selection, real destroyed-editor exception, full-app/TipTap, native shortcut, normalized path, provider final-input, installed-package inclusion or side-by-side parity proof**. The seven frozen cases exercise unmount/detachment, not an independently simulated handle-replacement transition.

No app/browser launch, original asset acquisition, vendor execution, native/package build, provider request, installation, release dispatch or new watcher. Existing serialized native/release custody remains exclusive. That custodian must prove the actual merge is contained in a later admitted package and test pending paste → editor close/switch → delayed clipboard result, plus live-editor insertion controls; this checkout's frontend build is not package containment or installed behavior. Historical package #1791 is not claimed to include this successor.
