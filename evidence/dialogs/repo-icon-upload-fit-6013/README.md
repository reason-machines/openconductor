# Repository icon upload geometry

Conductor Rebuild fixes `fitIcon` to match the retained Conductor upload path.
The checked main commit is `248b6c359c830c6ac5e050721bae18e44e168068`.

## Source

The original `conductor-a2t-source-closure.tar` upload has SHA-256
`c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d`.
This pass verified that archive and compared its renderer bytes with the retained
renderer. Both identities passed. [reference.json](reference.json) contains the
complete `yba`, `xba` and `dUi` declarations, UTF-8 byte ranges, hashes and the
current-main counterpart identities.

REA lineage is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
Its semantic renderer analysis exhausted heap. This pass reads retained shipped
bytes as data. It does not execute Conductor JavaScript or claim native analysis.

The picker `dUi` mounts upload component `xba`, which calls `yba`. `yba` defaults
each missing intrinsic dimension to 128 before scaling. It rounds the drawn
width and height, but not the centering offsets passed to `drawImage`.
OpenConductor's `resizeToDataUrl` calls `fitIcon` and forwards its offsets to
`drawImage` without further rounding.

For a 300 by 100 image, the centered rectangle is 128 by 43 at `(0, 42.5)`.
Before the fix, `fitIcon` placed it at `(0, 43)`. A missing width with height 64
produced a 64 by 64 square instead of the reference's 128 by 64 rectangle.
The missing-height case had the corresponding error.

Only `fitIcon` changes in production. Picker shells, upload I/O, canvas sampling,
persistence, provider APIs and native code are unchanged. Existing unrelated
tracked work is retained in a local stash. Sealed model commit `f8e25c4` is
retained separately and is not included in this product diff.

## Checks on Reason Cloud

The regression file is identical for RED and GREEN. Its SHA-256 is recorded in
[fixture.sha256](fixture.sha256).

```bash
node --experimental-strip-types --test src/state/repoIcon.test.ts
```

- [RED](red.tap): five existing tests passed and all three new tests failed for
  the intended geometry differences.
- [GREEN](green.tap): all eight tests passed. The unchanged assertions exercise
  both orientations, odd padding below 128, and independent missing dimensions
  above and below 128.

```bash
NODE_PATH="$PWD/.ara-state/settings-icon-popup-deps/node_modules" \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/state/repoIcon.test.ts src/components/repoIconEmoji.test.ts \
  src/settings/rows/repoIconPopover.test.ts
```

[Nearby checks](nearby.tap): all 18 tests passed using an already-present isolated
dependency directory. No installation ran. Scoped `git diff --check` passed.
Test Behavior, Not Implementation kept these assertions on the computed drawing
rectangle. Fix Root Causes kept the change in the geometry calculation rather
than adding compensating offsets in a caller.

## Limits

These checks prove geometry values, not browser raster output, image decoding,
file selection, persistence or native appearance. No screenshot exists because
this lane has no browser or native runtime admission. Full local typecheck,
build and frontend suite were not run. Hosted workflows must pass on the exact
published head before protected merge. Package consumption and native behavior
remain separate verification steps.

No controller, runtime queue, frozen fixture or publication barrier changed.
The strict physical-publication requirement remains unsatisfied and unwaived.
