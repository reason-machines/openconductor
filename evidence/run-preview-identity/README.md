# Keep Run previews and output with the displayed task

Conductor Rebuild compared current main `8f8e70da6b750918931314eb00a41e82a72b8918` on Reason Cloud. The ledger renewed exclusive ownership of `src/components/ScriptsPanel.tsx`, existing `src/scripts/runCompletion.test.ts`, and this new evidence file. No backend, scripts model, protected resource, or other owner's path is changed.

## Retained real-app source

This change reuses the authorized Conductor 0.87.6 REA extraction. No new acquisition, target execution, native action, or device contact occurred.

The renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its complete `nro` function is [retained as inert text](../terminal/strip-toolbar/reference-nro.txt), UTF-8 `[7170202,7199367)`, 29,165 bytes, SHA-256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`. This investigation rechecked that complete function's hash without executing it.

`nro` reads `Le=q_.useTaskRunId(r?.localId,ke)` and assigns `Ve=Le`. Here `ke` is the displayed task after selection projection, as documented in [the task-projection evidence](../run-task-projection/README.md). The accepted index exports `AI as gT, ARt as gU` and renderer imports `gT as tX, gU as q_` are recorded in [the admission evidence](../run-admission/README.md).

The output/reset span is relative UTF-8 `[6605,6842)`, absolute renderer UTF-8 `[7176807,7177044)`, SHA-256 `29d05f5f466cfa8702ffbde856db187bd6234fd2e739ee2faf2c5b2aa45b1790`:

```javascript
Gs=Ve?vSe(Ve):null,gr=G5e({terminalId:Gs??""})?.pid,Yr=$.useCallback(()=>{if(!Gs)return;const bi=qc.getTranscript(Gs,1e3).text;if(!bi)return;const yo=bzt(bi);ba(yo)},[Gs]);$.useEffect(()=>{ba(null),Yr()},[Gs,Yr]),B9(Yr,!Gs||ea?null:2e3);
```

The retained renderer's complete import clause is UTF-8 `[52991,66495)`, SHA-256 `711b96377098ad3838934209f1710cb85acfc256abecae07605139daf0670ed5`, from `./index-BGEQ8YjU.js`. It includes `g6 as vSe`, UTF-8/UTF-16 `[57245,57254)`, SHA-256 `8933add135f85599eab9f076cda55a784dd828d184695785a7c7dd0755dc5888`, and `gh as qc`, `[57354,57362)`, SHA-256 `447426764ef0b8ca8f18e5bddd099b165145cc1c3967f959a75eaa90d90193ba`. The existing renderer owner delivered this bounded import receipt in [Session de6c02f4](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753), message `848380be-4462-4402-9c4e-91196b4cbb4d`.

The existing index owner rehashed the already-held `index-BGEQ8YjU.js`: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. [Session e1e2b6b9](https://reasonmachines.com/agents/e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46), message `e04ac64b-0f05-4c21-b399-6669e0851fd4`, supplies the exact export and complete dependency-free definition:

```javascript
EI as g6
function EI(t){return`run:${t}`}
```

- Export UTF-8 `[3483889,3483897)`, UTF-16 `[3483353,3483361)`, SHA-256 `d2aebe82422c1e7460676595fec67a0ab244717b27b3f2bba4753f35a4cc2305`.
- Definition UTF-8 `[2876199,2876231)`, UTF-16 `[2875709,2875741)`, SHA-256 `62623e20a910ddc0c3b0f1270bbbe680d85fc0617c16f86ea3864ab397197495`.
- The immediate producer fragment `V=_Rt(),D=EI(V)` records `runScriptRunId:V,sessionId:D`. Fragment UTF-8 `[2926826,2927059)`, UTF-16 `[2926336,2926569)`, SHA-256 `ca9df7e78cead8793aa6128a2ea65442aee3c42815e3fcf449e5ee648475b3ab`. This is not the complete producer and is not presented as one.

Thus the renderer resets its detected URL when the displayed run's transcript-session identity changes, and reads only that session's transcript. The earlier missing `g6` identity join is closed. This does not observe output delivery, native timing, or installed-app behavior.

## Current-main mismatch and bounded correction

`ScriptsPanel` keeps one unkeyed output string and one detected URL. The URL reset effect depends on workspace and displayed task but clears only when the workspace is not busy. A busy Dev-to-Test or busy workspace switch therefore retains the old detected URL. Uncancelled `runOutput` promises can later overwrite the new context's output. A retired event callback can also write into that same unkeyed string.

The correction is limited to binding output and detected URL state to the displayed workspace/task and disposing obsolete output reads and subscriptions. It does not add a backend run ID, change event payloads, claim same-task generation isolation, or modify process start/stop behavior. Model the Domain motivates storing identity with the text and URL instead of relying on effect ordering. Fix Root Causes keeps both stale output and its derived preview URL within the same correction.

## Regression checkpoint

The existing fixture mounts the actual `ScriptsPanel`, `RunSplitButton`, and `PreviewOpenButton`. It runs the real scripts API adapter and React effects with only IPC, native opening, settings, and terminal rendering simulated. New deterministic component cases cover:

- Busy Dev-to-Test switches reset detected previews and reject a late Dev snapshot.
- Busy workspace switches with the same task name reset detected previews and reject the prior workspace's snapshot.
- Already-queued output callbacks from a retired workspace subscription cannot mutate the new workspace's output or preview.

Configured preview URLs remain covered by all existing completion cases. No existing assertions are weakened. The regression-only checkpoint is published before the production correction so automatic hosted CI can establish RED. No local Node tests, typecheck, build, dependency install, browser, app, native action, workflow dispatch, or runtime admission is performed.

## Verification

- Passed: complete retained `nro` hash and output/reset subspan hash readback on Reason Cloud.
- Passed: `git diff --check` before publishing the regression checkpoint.
- Pending: automatic hosted RED, unchanged tests after the minimal correction, and all exact-head workflows.
- Not run: local tests, builds, browser screenshots, installed Mac acceptance, or side-by-side native parity. No screenshot is available because this lane has no browser/app/native execution admission. Component checks do not substitute for those observations.

The failed-spawn catch/restart/tab-store gap remains separate and exhausted. No missing-tail search was repeated. #847 and all protected stops remain unchanged.
