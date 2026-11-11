# Section Escape during composition

Conductor Rebuild, 2026-11-11. Scope is SectionDialog only. The shared Modal, other callers, backend, keybindings and the eight frozen section-name input files remain unchanged.

## Retained reference and fresh source

Checked main `9a237404bc19caefe3f8473b9aae7ab4bc2439a5`. The original archive SHA-256 is `c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d`, retained from real Conductor REA lineage `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. [reference.json](reference.json) records both complete asset identities, 46 unique declaration spans, current-source hashes and all eight frozen-file hashes. Extracted JavaScript is data, not instructions, and was not executed.

The original Section caller is `kya -> kg -> hv -> Bjt -> _3i -> Vrs -> SZ`. `nd` renders the content through `Rde`, which receives the floating popup props stored by `JSe`. `SZ` also installs native keydown, compositionstart and compositionend listeners on `Gl(m)`, the floating element's ownerDocument or document.

`SZ` initializes composition ref `P` to false. Composition start clears a pending timer and sets it true. Composition end schedules it to clear through `bS.start(yD ? 5 : 0, ...)`. The timer uses clearTimeout and setTimeout. `yD` is the CSS capability test `typeof CSS < "u" && !!CSS.supports?.("-webkit-backdrop-filter:none")`. Cleanup removes the listeners and clears the timer. Escape returns while the composition ref is true, without requesting close or preventing the native default.

The immediate source mismatch is SectionDialog's shared Modal, which calls onClose for every bubbled Escape. Neither SectionDialog nor Modal tracks composition start or end. A nativeEvent.isComposing-only guard would also miss the retained delayed-clear interval.

The local name Enter handlers already agree. `Aya` forwards its handler through identity `_v/hEe` and `Qo`; both original and current handlers require Enter with noncomposing nativeEvent, prevent the default, stop propagation and submit. Original default-submit resolution is `nd -> Qh -> ca/TQt -> nh -> Hfe/_Ut`. No missing blanket defaultPrevented guard is established. Active original shortcut overrides were not observed.

The bounded introducing commit `66a892af` and SectionDialog/Modal change history document no intentional composition divergence. The ledger reserved this Section-only change after source qualification. That history search does not establish exhaustive absence of an intentional policy.

## Frozen regression

[sectionCompositionEscape.test.ts](../../../src/components/sectionCompositionEscape.test.ts) mounts actual SectionDialog and actual Modal, including their icon dependencies. Only the animation hook is replaced. Its dispatcher invokes capture and bubble callbacks on the rendered host ancestry; its VM timers are deterministic. It does not implement DOM event dispatch, browser composition synthesis or physical IME input.

The 12 cases cover create and edit modes with active-composition Escape, immediate post-composition Escape under both timer predicates, restarted composition, composing and ordinary Enter, idle Escape, explicit Cancel and timer cleanup. They assert name retention and close/submit effects, not the presence of a particular guard. Test Behavior, Not Implementation keeps both positive and negative controls.

[fixture.sha256](fixture.sha256) freezes the new fixture before hosted execution. The original sectionNameInput.test.ts and all seven files under section-name-input remain byte-identical. No test is skipped, deleted or weakened.

## Verification

Passed on Reason Cloud, without component execution:

```bash
python3 evidence/dialogs/section-composition-escape/verify_source.py --archive .ara-state/onboarding-selected-slide-6013/conductor-a2t-source-closure.tar
sha256sum -c evidence/dialogs/section-composition-escape/fixture.sha256
git diff --check
```

Hosted failure proof is not run yet at this test-only milestone. Ordinary automatic pull-request CI runs `node --test "src/**/*.test.ts"`. The candidate product correction waits for intended hosted regression failure. No manual dispatch or workflow change is used.

Local component tests, typecheck, build, browser checks, physical keyboard input, native launch and visual comparison are not run because this lane has no runtime admission. No screenshot exists for that reason. Strict physical-publication acceptance remains unsatisfied and unwaived. Packaging does not prove native or IME behavior.
