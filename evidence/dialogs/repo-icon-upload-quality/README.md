# Repository icon upload sampling quality

Prepared by Conductor Rebuild for owner6013. Checked default main `248b6c359c830c6ac5e050721bae18e44e168068` on 2026-11-11.

## Change

`resizeToDataUrl` sets `ctx.imageSmoothingQuality = "high"` before `drawImage`, matching the retained Conductor renderer. This is the only production change. Geometry, upload I/O, exports, native admission, workflows, and PR #1045 are unchanged.

## Retained shipped source

[reference.json](reference.json) records complete, byte-verified `dUi` → `xba` → `yba` spans and their UTF-8 byte offsets. The original archive attachment is `9bba4171-4ff7-4ded-83e7-5a62a9f75350`, SHA256 `c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d`.

The renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. `yba` sets `g.imageSmoothingQuality="high"` before drawing and emits PNG. `xba` calls `yba` from Upload; `dUi` selects `xba` for its upload panel. These are static source observations, not target-runtime observations.

Historical REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` exhausted heap during semantic renderer analysis. This pass revalidates retained shipped source bytes as untrusted data. It does not execute the renderer, install REA, or perform live app analysis.

Recheck the original archive, all three complete spans, baseline component, sealed fixture, and existing CI inclusion with:

```bash
python3 evidence/dialogs/repo-icon-upload-quality/verify_source.py --archive "$ORIGINAL_ARCHIVE"
```

Result was **PASS** for all checks.

## Unchanged-fixture RED and GREEN

The new test exercises the actual production `RepoIconDialog`, selects **Upload**, and sends a controlled file through its input's change handler. React and react-test-renderer are real. Canvas, Image, URL, and file input boundaries are controlled doubles. No production internals are exported or rewritten for testing.

The Test Behavior, Not Implementation principle shaped the test boundary. The canvas observes the sampling quality at `drawImage`; callers observe PNG selection, close, errors, and URL cleanup. This is not an assertion about private helper calls or a raster-quality comparison.

Existing dependencies came from attachment `c122385b-579e-4770-8193-f2fd272d1aaf`, SHA256 `61da7ddcf13a1efd79eb7aa2649a1fbfbc09952b06925bf7aea8976d8f91c4cf`. They were extracted only into scratch `.ara-state`; no install ran and dependencies are not committed.

```bash
export NODE_PATH="$PWD/.ara-state/settings-icon-popup-deps/node_modules"
node --test src/components/repoIconUpload.test.ts
```

TAP receipts have trailing whitespace trimmed for `git diff --check`; test names, assertions, outcomes, and fixture bytes are unchanged.

- [RED](red.tap) on unchanged main production code exited 1. Exactly two assertions failed with `low !== high`; the four error and cleanup checks passed.
- [GREEN](green.tap) after the one-line production fix exited 0. All six tests passed.
- The fixture remained byte-identical throughout, SHA256 `30db1c020347b542393c686600b2fbc4e4aaa044e5ceda5d2875d05c0934ff81`.

Successful cases cover 512×256 downsizing to a 128×128 canvas with draw arguments `(0, 32, 128, 64)`, plus an unscaled 64×64 image. Both require high sampling at draw time, the original image dimensions, JPEG input bytes and MIME, PNG output, one pick, one close, and object URL revocation. Decode failure, unavailable context, PNG encoding failure, and excessive dimensions preserve errors, URL cleanup, no pick or close, and cleared busy state.

## Other checks

```bash
node --test src/components/repoIconEmoji.test.ts src/state/repoIcon.test.ts src/settings/rows/repoIconPopover.test.ts
npm run check:branding
npm run lint:colors
git diff --check
```

All passed. The three [neighbor suites](neighbors.tap) passed 15 tests. Branding passed its source and generated hashes plus wiring checks. Color lint passed six tests and its source scan. Both existing frontend CI jobs already include the new fixture through `node --test "src/**/*.test.ts"`.

An initial [neighbor attempt](neighbor-attempt.tap) additionally selected `homeRepoIcon.test.ts` and failed before running that file because Node ESM does not resolve `react` from `NODE_PATH`. That suite also imports `react-dom/server`, which is absent from the supplied archive. It was not installed or substituted. The other 15 tests passed in that attempt and again in the successful focused run. Home rendering remains locally unverified.

Local full-project typecheck and build were not run because the supplied archive is a focused React/test-renderer/TypeScript subset, not the full project dependency tree. Hosted automatic checks and macOS packaging are separate verification and must pass on the exact PR head before protected merge. Their live results belong to the PR; these local receipts do not claim CI or package success.

## Native and publication limits

Visible, native, side-by-side, and raster behavior remain **unverified**. There are no screenshots because runtime admission is prohibited. No server, browser, native app, provider, or real file picker ran. No runtime, native, install, queue, global-producer, helper, or workflow changes were made. Frozen work and the native queue are unchanged.

The strict invocation/deadline publication property remains **UNSATISFIED and unwaived**. This patch neither changes that property nor claims a partial barrier fix. Existing finite-model evidence is model evidence only and is not rerun or repeated here. CI and package builds do not grant native/runtime admission or establish final product parity.
