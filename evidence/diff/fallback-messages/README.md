# Full-diff fallback messages

Conductor Rebuild checked main `1c8e9593099bce8ebfbc19d83052cbfd47df5ad0` against the retained REA-extracted Conductor assets. The full-file renderer says **Binary file changed** for a nonmedia binary diff and **No changes in this file** for equal text. OpenConductor used different messages.

The product change replaces only those two strings in `FileDiffView::View`. The Git producer, read-error handling, whitespace component, size policy, headers, refresh behavior, selection and timing are unchanged.

## Source binding

`source.json` records complete asset hashes and UTF-8 spans for the original `bLt` loader, `bji` caller, `Mqo` renderer and `bDo` turn preview. The `F9t as n2` export joins the renderer import `n2 as ESr`, which maps `NoChanges` to the same empty-content message. The retained original evidence is `ev_a4ce503a76a3198b2d2bec127c09bb6940b806849318ccc51523f40701751ab5`.

The cases are an ordinary selected nonmedia binary file and a text file with mode-only changes: the latter produces no content hunks. This is not a new missing-versus-error implementation. No legitimate same-input natural non-128 Git read failure was established; that separate lead remains insufficient.

## Verification

- Expected RED: `node --test src/features/diff/fallbackMessages.test.ts` reached all nine tests. The six message assertions failed in unified, split and whole-file layouts; all three controls passed. `red.log` preserves the actual expected/received strings.
- GREEN: the identical command and frozen test bytes passed all nine cases, with zero failures, skips or cancellations. See `green.log` and `frozen-baseline.sha256`. The controls preserve size-hidden precedence, whitespace-component delegation and Viewed collapse/path retention.
- PASS: `git diff --check`; frozen new-test hash is unchanged after the fix. `frozen-baseline.sha256` also holds the pre-change product and legacy-fixture hashes, which must be checked against main rather than the changed working copies.
- PASS after rebinding to main `7b99088f24c54ffca941fe6d5528260633328d0e`: `node --test src/features/diff/fallbackMessages.test.ts` passes all nine cases with zero failures, skips or cancellations. See `fresh-main-green.log`.
- `python3 evidence/diff/fallback-messages/verify_source.py --assets .rea-work/pzi-wzi-source-loan --main 7b99088f24c54ffca941fe6d5528260633328d0e` verifies the complete retained asset and span hashes, baseline hashes, frozen test, and exact two-string product diff. Its `fresh-main-binding.json` also records the four #1143 source/test files unchanged from merge `4f632b826` at this main head. This is source inclusion, not a new behavior or package test.
- Affected fixture maintenance: the old binary-message expectation in `tests/diff/largeFilePlaceholder.mounted.test.mjs` changes to the source-backed string. The complete original fixture is retained; `fixture-maintenance.json` records both hashes and verifies this is the only substitution. That separate producer/renderer suite was not rerun.
- INCOMPLETE: `npm run typecheck` timed out after 180 seconds without reporting a TypeScript diagnostic. It is not counted as a pass.

## Limits

The fixture mounts the actual production `FileDiffView` with provider-free React test-renderer. Unrelated native, clipboard and editor boundaries fail if executed. It is not a browser, installed/native macOS, visual, provider, real-clone or checkpoint acceptance test. No app/browser execution was admitted, so there is no screenshot. Manual-only E2E/package workflows were not enabled, dispatched or rerun.

#1143 is merged at `4f632b826`. This standalone successor is based on the current main above; its product change remains exactly two strings. The current CI cost policy was reread from that main head. Automatic PR checks remain the merge gate; manual-only suites are unrun gaps, not passing checks. No new watcher, dispatch or rerun was created.
