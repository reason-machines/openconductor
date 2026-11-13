# Send-key save failure qualification

Conductor Rebuild qualified the unchanged original Send-key packet on 2026-11-13 against main `c79a81086c3a0e5ba81f1a9a53ec63a4f4dde7ba` in this Session's own checkout on Reason Cloud computer 356. This is the current execution record. The adjacent original README and source manifest are preserved historical source-only records, not current test status.

## Change and source

The General page did not forward its existing error notifier to `SendKeyRow`. That row ignored false override-write results and only logged rejected writes. The correction forwards the notifier and reports both failure paths with the retained Conductor message, `Failed to update message send key`. It does not change successful persistence, the optional-notifier contract, Custom mode, shared controls, Follow-up behavior, Reset, ConfigSync, or any provider or persistence service.

The exact original candidate is `07f2494fc0e1889c563ff8615ccb625d419a733a`. The eight-case fixture SHA-256 remains `9f98fe21f8731caf1533f336956c6d2f52c926af53fa41b7ce83e4913ad1c461`. All 15 frozen original files and all seven REA spans matched before execution and remained unchanged afterward. All 19 current-main input pins matched, including the unchanged package lock `0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a`. The protected Follow-up checkpoint was verified without applying or modifying it. The merged Settings search hint remains unchanged.

The retained original REA evidence is from Conductor 0.87.6. Its full asset hashes, byte offsets, and receipt are in `source.json`. The historical renderer semantic pass exhausted heap; only the retained shipped-asset spans were inspected here, with both asset identities and seven exact joins verified. Current installed-app equality and native behavior are not established by that source evidence. No full proprietary application asset is committed.

## Measured checks

The same fixture ran once against the frozen baseline, which matched current main byte for byte, then once against the exact retained candidate. No assertion, control, fixture boundary, or case map changed.

```bash
# RED: 8 tests, exactly 4 intended assertion failures and 4 passing controls.
# Exit 1; no skips, cancellations, TODOs, or setup failures.
SEND_KEY_ROW_BASELINE=1 NODE_OPTIONS=--max-old-space-size=768 \
  nice -n 19 node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/sendKeySaveFeedback.test.ts

# GREEN: the identical 8 tests all passed; exit 0.
NODE_OPTIONS=--max-old-space-size=768 \
  nice -n 19 node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/sendKeySaveFeedback.test.ts

# Adjacent: all 10 tests passed; exit 0.
NODE_OPTIONS=--max-old-space-size=768 \
  nice -n 19 node --experimental-strip-types --test --test-concurrency=1 \
  src/settings/composerSettings.test.ts \
  src/settings/notificationDenialFeedback.test.ts \
  src/settings/fullDiskAccess.test.ts

# Actual checkout typecheck: passed; exit 0. Local compiler verified first.
NODE_OPTIONS=--max-old-space-size=1536 \
  nice -n 19 npx --no-install tsc --noEmit
```

The four RED failures were the refused override, rejected override, rejected legacy-write, and failure-then-retry notification assertions. Successful persistence, both optional-notifier controls, and the Custom placeholder passed before and after. This is a component regression with real `GeneralPage` and `chooseSendKey`, but synthetic persistence and notifier boundaries—not installed-app acceptance. The four original reference-JavaScript cases were not executed in this allocation.

The own-root React and renderer 18.3.1 and TypeScript 5.9.3 matched the pinned lock. No installation or package fetch ran. The first resource observation showed 42 GiB free disk and 14,029 MiB available RAM; peak process-tree RSS was not sampled.

## Bounded execution and receipts

Direct allocation `ACC_49_SENDKEY8_20261113T0526` allowed one foreground sequential driver, nice level 19, concurrency one, no retries, and 1,560 seconds inclusive. Source preparation took 150.108 of 300 seconds. RED took 0.719 seconds, GREEN 0.625 seconds, adjacent checks 5.298 seconds, and typecheck 25.935 seconds, all within their individual bounds. Total elapsed time was 182.693 seconds. The candidate remained applied, frozen files and locks were unchanged, and all four owned process groups were confirmed absent. ACC received explicit RELEASE after the terminal timestamp `2026-11-13T05:30:49.692841Z`.

`qualification.tar.gz` preserves the foreground driver, original source-composition map, exact product patch, receipt, arguments, non-secret environment overrides, timestamps, exit statuses, and unmodified stdout/stderr. The original source packet and unpublished refs remain intact.

## Acceptance gaps

Build, browser, native, provider, Rust, package, full-CI dispatch, and screenshot checks were not run: the serialized allocation explicitly excluded them. No screenshot exists for that reason. Actual notification presentation, real disk-save failure, installed-app behavior, package inclusion, and side-by-side parity remain unverified with the existing ACC/992/E1 owners. No duplicate runtime or package/native route was started. Automatic exact-head checks must pass before protected merge.
