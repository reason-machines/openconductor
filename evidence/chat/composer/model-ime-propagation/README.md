# Model-search IME propagation

Conductor Rebuild · `COMPOSER-MODEL-IME-PROPAGATION-135` · requalified on main `d74b767e33b5ef9f582458322e42156eb3b3623b` after #1411 merged.

## Defect and smallest repair

The menu recognized all six composition signals, but returned without containing a composing event from its search input. A composing Escape therefore reached the actual enclosing Create dialog's `onKeyDown`, which prevented default and requested closure. The frozen mounted regression observes that callback on the baseline; this is not an inference from a missing `stopPropagation` alone.

The repair stays in the existing `ModelPicker.onMenuKey` boundary. Already-prevented events still return first. The same existing six-signal predicate now stops propagation **only when the event target is the search input**, then returns without preventing default. Composition elsewhere, including a focused result, still follows its prior policy. No new helper, input handler, predicate duplication, dialog change, capture handler, provider path or other composer behavior is introduced.

## Retained reference, not new native evidence

The existing REA-derived renderer is identified by SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Exact inert spans were rehashed from existing packets; this pass neither reacquired nor executed the renderer:

- Complete `A7o`, UTF-8 `[8599657,8601817)`, SHA-256 `e94aaed3bf7beff63737f3574c578074d9b27d30067e6c303cd3358c3a1c7dce`, in [the retained model-search packet](../model-fuzzy-search/source.json). Its search input has `onKeyDown:I`; `I=xd(F=>{if(oRt(F)){F.stopPropagation();return}...})` precedes search/Enter/Escape commands.
- `$$e=229;`, `[8415731,8415739)`, SHA-256 `daa7b1b31b64d1c5a942f120deff423e81c42e80fe5662bc756158009e3ec1f4`, and complete `oRt`, `[8415739,8415890)`, SHA-256 `0cf63f73563cef134d6089a084469a5d52f916f9d502afade3b4752e2c20bb4b`, in [the retained IME packet](../ime-send/source/packet.json). The predicate recognizes synthetic/native `isComposing`, `keyCode` and `which`.
- Complete identity wrapper / `xd`, `[674926,674995)`, SHA-256 `4283e46687b05b8b24d9071e15301030bd57ac48bb3f7b129375606bfeaaca70`, retained in that IME packet. No unseen delegated callback is assumed.

Prior REA artifact identity, source-range limitations and cleanup receipts remain in [the ranking proof](../model-fuzzy-ranking/README.md#reference-and-provenance) and [the earlier IME proof](../model-ime-boundary/README.md#retained-reference-evidence). No new REA operation, gap, error, Mac process or acquisition occurred in this successor pass. All 13 model-search spans plus the three composition/wrapper spans passed self-hash verification. This does not independently rehash the original full renderer.

## Frozen RED → GREEN

`src/features/chat/modelPickerImePropagation.test.ts` mounts the actual `ModelPicker` and `CreateWorkspaceDialog` components. The composer and Base UI/motion boundaries are inert fixtures; they connect the two real components without mounting the full app. Stable host mocks and actual rendered ancestry drive keyboard callbacks from the input through the picker to the actual Popup callback, stopping when requested. The fixture does not implement its own product composition predicate.

- Frozen mounted fixture SHA-256: `e6f35ac64e17705e9daa53b3c95db14643d3c04c9caa2f004f273f0606cff7b3`.
- **Baseline, failed as intended:** `MODEL_PICKER_IME_PROPAGATION_REF=d74b767e33b5ef9f582458322e42156eb3b3623b node --test src/features/chat/modelPickerImePropagation.test.ts`: 5 pass / 7 composition-containment failures, no skipped/cancelled tests. Each Escape failure observes `dialogCloses:1` and default prevention. Assertions stop at the first failing query/key in each test; RED does not claim every nested variant ran.
- **After correction, passed:** the identical fixture, 12/12. Both blank and nonblank queries and every nested signal/key control then execute.
- Six independent composition signals, composing Enter/navigation/editing, ordinary Escape and Enter, adjacent non-229 codes, already-prevented events, non-input targets, Tab and exact focused-result selection are retained.

The original root-callback-to-Popup probe is preserved byte-for-byte at `baseline/root-probe-v1.test.ts`, SHA-256 `d6fafe1b9ad0d77be682b15aca26b767b405c6f2d821880cb3c2575b00d9c559`. Its unchanged tests also reproduce 5 pass / 7 intended failures before the fix and pass 12/12 after it. A mounted-fixture initialization run used unstable input mock identity (3 pass / 9 fail); it is preserved as `baseline/mounted-harness-identity-error.tap.gz`, not counted as the frozen RED. That harness issue was corrected before the mounted fixture was frozen or the final product edit made.

## Existing expectation migration

Both original root-only fixtures, their digests and the historical 32/32 baseline are archived under `baseline/`. The earlier composition packet deliberately preserved non-containing propagation; this separate source-qualified repair corrects that deferred mismatch.

Only composing-search `stopped:false` expectations changed to `stopped:true` in `modelPickerImeBoundary.test.ts` and `modelPickerSearchKeyBoundary.test.ts`, plus two descriptive titles. No cases, assertions, loader adapters, default-prevention expectations, selection/query/focus checks or negative controls were removed. Counts remain 18 and 14. All other model-picker fixtures remain byte-identical to the archived fixture manifest, including #1411's 11-case ranking fixture. The receipt verifies these bounds.

## Verification and limits

- **Passed:** mounted regression 12/12 and unchanged root probe 12/12; focused model-picker/friendly-label suite 168/168.
- **Passed:** expanded composer/slash/loadout/file-mention/chat-model/model-picker/Create suite 570/570. Exact command and outputs are retained in `qualification.json` and compressed TAP logs.
- **Passed:** `npm run build`, including branding, TypeScript and Vite; existing large-chunk warning only. `git diff --check`, retained span hashes and unaffected fixture hashes passed.
- **Not run:** full repository test suite, real browser event delivery, native/WebKit IME, installed-release behavior, provider execution, package build or successor containment. No product screenshot: runtime/native acquisition was explicitly excluded from this lane.
- No claim that stopping propagation cancels implicit form submission, prevents already-executed capture shortcuts or proves a native IME result. The concrete exercised effect is containment before the actual enclosing dialog callback.
- Existing package `44070332569` is pinned to `eef01e9b` and excludes this repair and #1411. Existing serialized release ownership remains unchanged; no dispatch, runtime/native/E1 work or duplicate watcher was created.

[Composer source audit](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3?page=0c58efb0-2de0-4ad2-aa79-67115c65d420).
