# Branch editor caret restoration

Conductor Rebuild owns `HEADER-CARET-271-02`. This packet covers only the already-open branch input's change callback. It does not change branch sanitization, submission, persistence, pending state, errors, copy, archive behavior, or initial focus.

## Retained reference

The source comparison was first made against main `96bad885076f23b81f8009a23deaa261dc866f71` and revalidated against fresh main `8f1f7b05d98c2469f1646864def08a9f7b774d1f` before the fix on 11 November 2026. All three source blobs below were unchanged. The retained reference describes Conductor 0.87.6. No new acquisition or reference runtime was used.

- [Retained callback trace](reference-static.json), 8,311 bytes, SHA-256 `4901177a0829b07b8414a5d4b9c8adf091f9549f8dc9dafac5ebbcb79a01588e`, git blob `f553fa75066ac57d1b958ec193ce36760e1eae94`.
- [Retained REA graph](../frontend/rea-analyze-javascript-application.json.gz), 44,783,232 bytes, SHA-256 `b0ffc795bf955a3dd54fd9bfb15d7eadf23ef6768c330c2e2223cc8581c8578f`, git blob `90b801cb23bc10e4780c9a1e48c8f358bc859686`.
- REA evidence ID `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Both trace artifact hashes occur in that graph's identity records.
- `renderApp-D_fmY7hW.js` SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js` SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The complete retained `bro` excerpt is 2,977 UTF-8 bytes with SHA-256 `ef7bdf8d88ab7587123cab8ccf81848f4bed54685987b2fe2373ff4cbbcd613b`. Within that excerpt, zero-based half-open UTF-8 and UTF-16 spans coincide for these ASCII strings.

- `[925,931)` is the `if(c){` editor gate.
- `[987,1122)` is the complete change callback below, SHA-256 `d3006643c304a54b2dab39f794512d51c4710567a6d95e916d71ed29f832fc2e`.
- `[1368,1408)` binds `value:o,onChange:de,onBlur:k,onKeyDown:L`, SHA-256 `00cb836a0617c064a86ee48f33b98692253e079e1ef63f089f668f9593065bbe`.

```javascript
de=he=>{const ge=he.target,ve=ge.selectionStart??0,ye=ZTn(ge.value);a(ye),h(SVn(ye)),queueMicrotask(()=>{ge.setSelectionRange(ve,ve)})}
```

The binding joins the callback directly to the branch input. It captures the input and its selection start before changing the controlled value, then queues restoration of that position as a collapsed selection. Null selection start falls back to zero. The comparison makes no claim about the separate width function or sanitizer implementation.

The trace's absolute UTF-8 spans `[7207150,7207156)`, `[7207212,7207347)`, and `[7207593,7207633)` remain retained declarations. Only within-excerpt spans and retained record membership were independently recomputed. Original full assets were not reacquired or rehashed.

## OpenConductor source pins before the fix

At checked main, the input invokes only `controller.change(event.currentTarget.value)`. Neither `selectionStart` nor `setSelectionRange` appears in the component.

- [Component](../../src/components/WorkspaceBranchHeader.tsx), blob `4ab9edb9b95e9d6770ffbec5b0b1f14dc5364027`, SHA-256 `e353815e7242733bfc33c702e214a52f46e546be81d316a44bd438fa946bb18d`.
- [Tests](../../src/components/workspaceBranchHeader.test.ts), blob `ade14a366562ffa44de8e78f8fc26bcb01658fd6`, SHA-256 `435087ac7a715f0bf458eeea2d6a74510927373e28010d218f0b20fe8b83aab4`.
- [Unchanged controller](../../src/components/branchHeaderController.ts), blob `1b889bdd3a7dd4836fe7931c48c5696007ee272c`, SHA-256 `11718ed1cdb81b08352dfff1fe09ca72c3f7e1b49aa0178fa707bc59edef396f`.

The same three source pins were present at the preceding submit-close merge `fd1acf86eb0e6383a174f0ac5a232d1751353588` ([#963](https://github.com/reason-machines/openconductor/pull/963)).

## Executable regression

```bash
node --test src/components/workspaceBranchHeader.test.ts
npm run typecheck
npm run build
```

Three additive cases mount the actual TSX component with `react-test-renderer`, trigger its input handler, and drain the real Node microtask queue. They cover an unchanged valid value, a sanitized value, and the null-selection fallback. Each checks that no selection write occurs synchronously and exactly one collapsed selection write restores the captured position after the queue drains. Rename, marker, copy, dispatch, and error calls remain absent.

The shared event fixture is now input-shaped, with `value`, `selectionStart`, `selectionEnd`, and `setSelectionRange`. Five prior event payloads use that fixture. The module context receives Node's real `queueMicrotask`. All 76 previous assertion lines remain byte-identical and in order, including the original controller and submit-close controls. The production controller is not modified.

This is a mounted component callback check with a host-input stand-in, not a browser DOM or native caret acceptance test. It does not prove browser clamping, focus, visual geometry, or real-provider behavior.

## Validation record

- Retained trace, REA graph membership, callback hash, binding spans, and fresh-main source-pin checks passed.
- `git diff --check` passed for the regression-only increment.
- Regression test file SHA-256 before any production change is `997ad07bd895f8d9e038fe63d37bbd8e5e8d304749a65c2bc9ec787f2f9ed643`.
- **Intended behavioral RED confirmed:** regression-only PR head `ff20c6a19ba53784ec1a9a7d2edb41b6baf8086c`, CI run [42936538818](https://github.com/reason-machines/openconductor/actions/runs/42936538818). The [frontend unit job](https://github.com/reason-machines/openconductor/actions/runs/42936538818/job/130247891393) and [frontend build job](https://github.com/reason-machines/openconductor/actions/runs/42936538818/job/130247891109) each reported 2,158 passed and exactly three failed cases, all new caret cases at the assertion `the queued callback restores the captured caret`: actual `[]`, expected `[[8, 8]]`, `[[9, 9]]`, and `[[0, 0]]`. Module loading and preceding controlled-value assertions passed; these were not loader/setup failures. `npm run typecheck` passed in the latter job, and its subsequent build step was skipped after the intended test failures.
- **Minimal fix:** capture the actual input and `selectionStart ?? 0` before `controller.change(input.value)`, then queue exactly one collapsed `setSelectionRange(caret, caret)`. No controller, sanitizer, initial-focus, or other handler changes.
- **Assertion preservation passed locally on Cloud 298:** the complete test file is byte-identical to the RED digest above; all 76 baseline assertion lines remain unchanged and in order. Corrected-head hosted GREEN/typecheck/build are pending; not claimed yet.
- Dependencies were previously cleaned from this checkout; no local install or local Node test/build was performed.
- Native, browser, visual, and real-provider acceptance were not run. No screenshot is supplied because those surfaces were excluded from this source-backed task.
- The basename source transport hold remains unchanged. No held bytes, basename behavior, or associated test cases were used or edited.
