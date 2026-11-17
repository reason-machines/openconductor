# Home compact timestamp boundaries

Conductor Rebuild owns HOME-COMPACT-TIMESTAMPS-271. This regression-only successor to #1096 starts from main `167492e56dbbb90850efbadf1db2848dae7622f2`. Product files are unchanged in its first publication.

## Retained source

The Conductor 0.87.6 renderer comes from real-app REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Its complete asset SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. No new REA engine run is claimed. The existing semantic-renderer heap-exhaustion limit remains.

[The manifest](source.json) retains 19 exact declaration spans, UTF-8 byte ranges, span hashes, baseline file hashes, and six same-input source predictions. Home `vJo` calls `BPt`, then `SS`. The chain uses `Nai` to subtract the change in timezone offsets before formatting elapsed minutes. For years, `mNr` measures full months with the end-of-February adjustment and complete local-clock comparison. OpenConductor currently uses elapsed minutes alone and compares only month days.

Four static predictions differ. Spring and fall clock changes predict `3h` instead of `2h`, and `2h` instead of `3h`. A leap-day year ending on February 28 predicts `1y` instead of `12mo`. A year boundary before the starting clock time predicts `12mo` instead of `1y`. Two ordinary controls predict the same result. Automatic CI reproduced all four differences on regression-only head `4ea062e0e1b0f5fe203fafa50b8042466560b96d`. Both controls passed in each frontend job. The retained manifest remains the original source-only qualification, not a claim of reference execution.

## Frozen regression

`src/components/homeCompactTime.test.ts` mounts production `AllWorkspaces` with actual database-shaped rows, `reposFromDb`, `homeRows`, and `shortRelativeTime`. It reads the rendered `.allws-when` text after independently requiring one workspace row titled `Cairo`. Only the clock, preferences, archive transport, unrelated state hooks, and decorative children are substituted.

[The fixture hash](fixture.sha256) freezes all six cases. The existing frontend jobs discover this file through `node --test "src/**/*.test.ts"`. No dependency or workflow change is needed.

The ledger admitted regression-only publication with normal automatic GitHub Actions. No local Node, Rust, browser, native, or runtime slot is admitted. Require four intended assertion failures and two passing controls before changing `shortRelativeTime` or `monthsBetween`. Preserve this fixture byte for byte for passing-after verification. Every check and workflow on the corrected exact head must complete successfully before requesting merge.

## Correction after failing-before proof

[The failing-before receipt](red-before.json) and [hosted assertion logs](red-before.log) record run `43123074161`. Both frontend jobs ran all 3,180 tests, with exactly the four intended Home assertion failures and 3,176 passes. The mounted workspace and timestamp-element assertions passed before the text assertions failed. This is behavioral RED, not a setup failure.

The correction changes only `shortRelativeTime` and `monthsBetween`. It follows retained `NVe` offset subtraction and whole-second rounding, and retained `mNr` full-month comparison, including February-end normalization. The six-case fixture remains byte-identical. The caller and helper were rechecked against main `a4d6fb8eaf1cd84d5c22cdb43fdfacbe0d0d9735` before editing and still matched their baseline pins.

## Verification and limits

- Passed on Reason cloud. `python3 evidence/home-compact-timestamps/verify_source.py --renderer .ara-state/retained-conductor-renderer.js` verifies the original identity, source spans, constants, default locale, and fixture hash without executing JavaScript.
- Passed on Reason cloud. Baseline caller and helper hashes match fresh main. `git diff --check` passes.
- Failed as intended before the correction. `node --test "src/**/*.test.ts"` in both hosted frontend jobs produced four Home assertion failures and two passing Home controls.
- Pending. Passing-after verification of the unchanged fixture and every exact-head workflow through normal automatic CI. No merge request is permitted until all complete successfully.
- Not run. Local JavaScript, reference-app execution, database and filesystem effects, native interactions, installed package, and visual acceptance.
- No screenshot is available because this change has no UI execution admission. Component assertions do not establish native or visual parity.

Scope excludes `dateBucket`, bucket labels and ordering, repository icons, other screens, existing frozen tests, and workflow configuration.
