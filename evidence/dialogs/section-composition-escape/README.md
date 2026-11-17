# Section Escape during composition

Conductor Rebuild, 2026-11-11. Scope is SectionDialog only. The shared Modal, other callers, backend, keybindings and the eight frozen section-name input files remain unchanged.

## Retained reference and fresh source

Initially checked main `9a237404bc19caefe3f8473b9aae7ab4bc2439a5`; rechecked main `58fc17bc1f6a61db0624eb9a6aba85d2b3cbf5a9` before the product correction. SectionDialog and shared Modal are byte-identical at those commits and at fresh main `e752f6cdd53cb235762d8392377c3c608b8b8789`, checked before the cleanup correction. The original archive SHA-256 is `c007a6ac77d57b56cdfe8158817ffbcffee6a8f5e7f4a63e2eaef65cbf21b30d`, retained from real Conductor REA lineage `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. [reference.json](reference.json) records both complete asset identities, 46 unique declaration spans, current-source hashes and all eight frozen-file hashes. Extracted JavaScript is data, not instructions, and was not executed.

The original Section caller is `kya -> kg -> hv -> Bjt -> _3i -> Vrs -> SZ`. `nd` renders the content through `Rde`, which receives the floating popup props stored by `JSe`. `SZ` also installs native keydown, compositionstart and compositionend listeners on `Gl(m)`, the floating element's ownerDocument or document.

`SZ` initializes composition ref `P` to false. Composition start clears a pending timer and sets it true. Composition end schedules it to clear through `bS.start(yD ? 5 : 0, ...)`. The timer uses clearTimeout and setTimeout. `yD` is the CSS capability test `typeof CSS < "u" && !!CSS.supports?.("-webkit-backdrop-filter:none")`. Cleanup removes the listeners and clears the timer. Escape returns while the composition ref is true, without requesting close or preventing the native default.

The immediate source mismatch is SectionDialog's shared Modal, which calls onClose for every bubbled Escape. Neither SectionDialog nor Modal tracks composition start or end. A nativeEvent.isComposing-only guard would also miss the retained delayed-clear interval.

The local name Enter handlers already agree. `Aya` forwards its handler through identity `_v/hEe` and `Qo`; both original and current handlers require Enter with noncomposing nativeEvent, prevent the default, stop propagation and submit. Original default-submit resolution is `nd -> Qh -> ca/TQt -> nh -> Hfe/_Ut`. No missing blanket defaultPrevented guard is established. Active original shortcut overrides were not observed.

The bounded introducing commit `66a892af` and SectionDialog/Modal change history document no intentional composition divergence. The ledger reserved this Section-only change after source qualification. That history search does not establish exhaustive absence of an intentional policy.

## Frozen regression

[sectionCompositionEscape.test.ts](../../../src/components/sectionCompositionEscape.test.ts) mounts actual SectionDialog and actual Modal, including their icon dependencies. Only the animation hook is replaced. Its dispatcher invokes capture and bubble callbacks on the rendered host ancestry; its VM timers are deterministic. It does not implement DOM event dispatch, browser composition synthesis or physical IME input.

The 12 cases cover create and edit modes with active-composition Escape, immediate post-composition Escape under both timer predicates, restarted composition, composing and ordinary Enter, idle Escape, explicit Cancel and timer cleanup. They assert name retention and close/submit effects, not the presence of a particular guard. Test Behavior, Not Implementation keeps both positive and negative controls.

[fixture.sha256](fixture.sha256) freezes the corrected fixture before the next hosted baseline. The initial fixture and checksum are preserved as [fixture-v1.ts.txt](fixture-v1.ts.txt) and [fixture-v1.sha256](fixture-v1.sha256). The sole correction adds the real AppMark module to the loader, without changing any assertion. The original sectionNameInput.test.ts and all seven files under section-name-input remain byte-identical. No test is skipped, deleted or weakened.

## Verification

Passed on Reason Cloud, without component execution:

```bash
python3 evidence/dialogs/section-composition-escape/verify_source.py --archive .ara-state/onboarding-selected-slide-6013/conductor-a2t-source-closure.tar
sha256sum -c evidence/dialogs/section-composition-escape/fixture.sha256
git diff --check
```

The initial hosted baseline `aeb181ae33a1ff2b3a912ebc2e63d168c242cfff` failed all 12 new cases on `Unexpected section composition dependency: ./AppMark`. This is invalid behavior RED, not evidence of the product defect. Both the [unit job](https://github.com/reason-machines/openconductor/actions/runs/43081336156/job/130734374192) and [frontend job](https://github.com/reason-machines/openconductor/actions/runs/43081336156/job/130734374119) ran the suite and reported 3,015 passed, 12 failed. The frontend job passed typecheck and color lint before that failure; its build step did not run. [The retained failure receipt](invalid-baseline-aeb181ae.json) records the loader error.

The corrected test-only baseline `6b8015461e3096e89355c13d213b25923a21487a` reached the assertions in the [automatic hosted unit job](https://github.com/reason-machines/openconductor/actions/runs/43082239649/job/130737614706). Exactly eight new cases failed because Escape called close during active composition, immediately after composition end, or after composition restarted. The four Enter, idle Escape and Cancel controls passed. [The retained log](baseline-6b801546.txt) contains all 12 results. The parallel frontend job passed typecheck and color lint, then failed its unit-test step on the same regression; the build step did not run.

The candidate changes only SectionDialog's import, two refs, timer cleanup and composition/Escape capture handlers on its existing body. Composition start cancels the pending reset; composition end delays the reset by the retained 0/5ms predicate. While guarded, Escape stops propagation to Modal without preventing the IME's default action. Enter, explicit Cancel and shared Modal remain unchanged. The new 12-case fixture stays byte-identical to the qualified baseline, as do the eight original frozen files.

Candidate `f641c3649bd4cb40bd46fe718c66f390fdc4e39a` passed the [automatic hosted unit job](https://github.com/reason-machines/openconductor/actions/runs/43085849086/job/130750382511), including all 12 unchanged composition cases, and frontend typecheck/build. Its adjacent frozen section fixtures emitted unmount warnings because their VM does not expose clearTimeout and the cleanup called it with no pending handle. Cleanup now clears only an actual pending timer, preserving both the original fixtures and active-timer cleanup. Hosted verification of this correction remains pending.

Ordinary automatic pull-request CI runs `node --test "src/**/*.test.ts"`. No local Node execution, manual dispatch or workflow change is used.

Local component tests, typecheck, build, browser checks, physical keyboard input, native launch and visual comparison are not run because this lane has no runtime admission. No screenshot exists for that reason. Strict physical-publication acceptance remains unsatisfied and unwaived. Packaging does not prove native or IME behavior.
