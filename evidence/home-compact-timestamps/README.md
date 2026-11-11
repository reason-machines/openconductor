# Home compact timestamp boundaries

Conductor Rebuild owns HOME-COMPACT-TIMESTAMPS-271. This regression-only successor to #1096 starts from main `167492e56dbbb90850efbadf1db2848dae7622f2`. Product files are unchanged in its first publication.

## Retained source

The Conductor 0.87.6 renderer comes from real-app REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Its complete asset SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. No new REA engine run is claimed. The existing semantic-renderer heap-exhaustion limit remains.

[The manifest](source.json) retains 19 exact declaration spans, UTF-8 byte ranges, span hashes, baseline file hashes, and six same-input source predictions. Home `vJo` calls `BPt`, then `SS`. The chain uses `Nai` to subtract the change in timezone offsets before formatting elapsed minutes. For years, `mNr` measures full months with the end-of-February adjustment and complete local-clock comparison. OpenConductor currently uses elapsed minutes alone and compares only month days.

Four static predictions differ. Spring and fall clock changes predict `3h` instead of `2h`, and `2h` instead of `3h`. A leap-day year ending on February 28 predicts `1y` instead of `12mo`. A year boundary before the starting clock time predicts `12mo` instead of `1y`. Two ordinary controls predict the same result. These are source predictions until automatic CI reproduces the assertions.

## Frozen regression

`src/components/homeCompactTime.test.ts` mounts production `AllWorkspaces` with actual database-shaped rows, `reposFromDb`, `homeRows`, and `shortRelativeTime`. It reads the rendered `.allws-when` text after independently requiring one workspace row titled `Cairo`. Only the clock, preferences, archive transport, unrelated state hooks, and decorative children are substituted.

[The fixture hash](fixture.sha256) freezes all six cases. The existing frontend jobs discover this file through `node --test "src/**/*.test.ts"`. No dependency or workflow change is needed.

The ledger admitted regression-only publication with normal automatic GitHub Actions. No local Node, Rust, browser, native, or runtime slot is admitted. Require four intended assertion failures and two passing controls before changing `shortRelativeTime` or `monthsBetween`. Preserve this fixture byte for byte for passing-after verification. Every check and workflow on the corrected exact head must complete successfully before requesting merge.

## Verification and limits

- Passed on Reason cloud. `python3 evidence/home-compact-timestamps/verify_source.py --renderer .ara-state/retained-conductor-renderer.js` verifies the original identity, source spans, constants, default locale, and fixture hash without executing JavaScript.
- Passed on Reason cloud. Baseline caller and helper hashes match fresh main. `git diff --check` passes.
- Not run yet. Hosted behavior, local JavaScript, application execution, database and filesystem effects, native interactions, installed package, and visual acceptance.
- No screenshot is available because this change has no UI execution admission. Component assertions do not establish native or visual parity.

Scope excludes `dateBucket`, bucket labels and ordering, repository icons, other screens, existing frozen tests, and workflow configuration.
