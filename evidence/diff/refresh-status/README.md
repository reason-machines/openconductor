# Loaded-file refresh status and retry

Conductor Rebuild traced the visible refresh-failure control from the retained
Conductor 0.87.6 shipped assets, then reproduced its absence in OpenConductor at
main `2fd9759216603cb040cfcffb4a258833948d4120`.

## Reference contract

The previously closed store error path retains loaded data and attaches an error.
The inherited `yLt` hook exposes that data, error, and refetch callback. `Y9t`,
imported as `Gri`, preserves those fields.

The new visible-consumer trace establishes these facts:

- `bji` passes `refreshFailed` when both loaded data and an error exist. It passes
  the same refetch callback to `GPo`.
- `GPo` chooses updating before failed, newer changes, or Viewed. Its failure
  action invokes the supplied refetch callback.
- `NPo` and `OPo` place the status in the header in both layouts.
- `PPo` renders `Updating…` with `role="status"`. On failure it renders
  `Retry update`, labelled `Update failed. Retry`, with the retry callback.
- A first-load failure without loaded data does not satisfy this refresh-failure
  condition. This change does not claim to implement that separate error UI.

The retained upload has SHA-256
`f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084`.
The renderer asset is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
The inherited hook asset is `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256
`b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

New renderer spans use zero-based, half-open UTF-8 byte offsets:

- `GPo`: `[8973445, 8975165)`.
- `NPo`: `[8961924, 8963208)`.
- `OPo`: `[8963208, 8965136)`.
- `PPo`: `[8965461, 8966464)`.
- The two bounded `bji` hook/prop spans are locked in the attached source packet.

The [source evidence page](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753?page=3b334f4b-a56c-4a0c-ad5e-c445fe22afe8)
contains the exact source spans and the retained-byte verifier results. The
Session attachment `diff-refresh-failure-source-evidence.tar` has SHA-256
`17f5468203b9c02f4b1d7c4a95760fba0229624e688f422ffe34e5568481c696`.
It includes the verifier, packet, pinned-main snapshots, and inherited receipts.

Static verification passed for two complete originals, six new UI spans, two
inherited hook boundary spans, thirteen lexical joins, ten corruption rejection
controls, and a byte-identical rerun. The original REA semantic renderer analysis
exhausted heap. This continuation read the retained original bytes. It did not
execute reference JavaScript or acquire new app source.

## Reproduction and fix

The real `DiffTab`, `useWorkspaceDiff`, `useWholeFile`, and `FileDiffView` run in
the new component regression. Only the Tauri IPC boundary is deferred; the DOM
editor, Pierre rendering shell, and unrelated header children are test doubles.
The header status/retry logic is not mocked.

Before the fix, `useWholeFile` retained old contents but discarded the refresh
error. `FileDiffView` unconditionally rendered Viewed in that header slot.

The fix returns a keyed failure or updating status alongside the retained file.
Retry starts another whole-file request without requiring another list revision.
An obsolete attempt cannot set the current error. Success restores Viewed and
permits editing with the complete current contents. Existing workspace, target,
remote, scope, path, whitespace, cancellation, and stale-data editing rules remain.
No loader, cache, polling, or selection behavior changed.

## Checks

All commands ran on Reason Cloud with a single Node test worker.

Pinned-main RED:

```bash
DIFF_REFRESH_REGRESSION_REF=2fd9759216603cb040cfcffb4a258833948d4120 \
  node --experimental-strip-types --test --test-concurrency=1 \
  src/features/diff/refreshStatus.test.ts
```

Four tests failed because the updating/retry controls were absent. Three
other-file, target-identity, and first-load controls passed.

The byte-identical final test passed all seven cases after the fix. Its SHA-256 is
`50c6ae79343b2bdca3cca08ea58ac9dba5953f3851c4e23e929138f552dc84d8`.
The initial RED commit is `3372f9f151`. Before final RED and GREEN, the fixture was
corrected to read text children without serializing React internals, to accept a
ref on the Pierre test double, and to narrow the dynamically loaded hook type.
No behavioral assertion was removed or weakened.

```bash
node --experimental-strip-types --test --test-concurrency=1 src/features/diff/refreshStatus.test.ts
node --experimental-strip-types --test --test-concurrency=1 src/features/diff/*.test.ts
npm run typecheck
git diff --check
```

Passed: seven new component tests, all 354 Diff tests, typecheck, and diff checks.
The controls cover same-revision object replacement, repeated retry failure,
late completion, different files, target identity, first-load errors, and
retained contents remaining display-only until the latest success.

## Limits

No native app, browser, build, install, screenshot, or E2E run was admitted for
this lane. There is no visual acceptance evidence or native parity claim.
Component checks establish the visible header's state and callback behavior,
not its installed-app appearance. Hosted CI, merge, and consuming-main package
identity remain separate delivery checks.
