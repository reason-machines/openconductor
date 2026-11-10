# Reset chat outside-pointer dismissal

Conductor Rebuild, 2026-11-10. Scope: remove only Reset chat's outer-backdrop mouse-down dismissal. Cancel, Escape, explicit Reset, reset-files selection/persistence, initial focus, and the shared motion wrapper remain unchanged.

## Retained reference source

The REA-decoded Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` (also in `evidence/frontend/tauri-assets-manifest.json`). REA analysis identity is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`; its partial whole-program graph is not the proof. The following bounded literal receipts are retained from the shipped renderer; no acquisition, extraction, analyzer, app launch, or native interaction was performed for this unit. Vendor source is not copied here. All ranges are zero-based UTF-8 bytes, end-exclusive.

1. Reset's complete `uDo` root `[8909221,8909638)` and `dDo` content `[8909638,8912447)` use `Tg`/`Im` with no dismissal override. Their provenance is [the UI-map Session](https://reasonmachines.com/agents/3b8428f4-96bb-41f8-b596-edcf51628df7), source `80342797-2f40-46db-9171-ca263b61a89d`, revision `22831192`; paired command source `68013ff8-12ec-4467-8a0d-ca820fcd6d5b`, revision `22831191`, records the original 5,200-byte read beginning at byte `8908600`. See also [initial-focus evidence](../reset-chat-focus/README.md).
2. `Tg` `[1983870,1984773)` delegates to `Oos`; `Oos` `[1983759,1983804)` calls `_3i` with `alert-dialog`. The complete `_3i` function is inside retained span `[1908550,1909740)`: its alert flag forces `disablePointerDismissal` true regardless of the optional caller flag. Provenance: [renderer-owner Session](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3), source `cf8a3d09-7ec4-4177-a458-a655da36dd4e`, revision `23825940`. The immediate root route is also recorded in [restore-dialog evidence](../restore-pending-dismissal/README.md).
3. Retained span `[1904600,1907400)` contains the complete `Vrs.outsidePress` predicate: dismissal is permitted only when there is no nested dialog and `disablePointerDismissal` is false; otherwise it returns false. Escape is separately configured. Provenance: renderer-owner source `eb39cb1f-01b4-48f8-98ab-ccc5eb9850f0`, revision `23825656`.
4. Complete `G3i` `[1985538,1986040)` and complete `FXe` initializer `[1903496,1903919)` supply overlay/presentation/ref plumbing, not an independent dismissal callback. Complete `SZ` `[480188,485653)` distinguishes literal false from a false-returning outside-press predicate: the latter retains listeners but short-circuits outside-close dispatch and intentional-release state updates. Provenance: renderer-owner source `262f10ec-3779-484d-bf7d-20cdcebd5d4c`, revision `25956296`, complete literal receipt `.rea-work/handoffs/dialog-backdrop-6013-literal.txt`. This closes the passive-backdrop and false-predicate paths rather than inferring behavior from the option's name.

This establishes source-level non-dismissal for outside pointer input. It is not native acceptance, browser pointer-delivery proof, or visual parity.

## Fresh-main mismatch and correction boundary

Initial default main `d8094fc7878a3add17eac2756b46fef98b00b542` contains merged #903, whose Cancel-first autofocus and seven mounted regressions are preserved byte-for-byte. A fresh default-main read at `f38cd222090dff7d1c05981863cba8aa2b2db369` before the correction confirmed the component and prior regression file are unchanged. Its Reset backdrop still calls `onClose` on mouse-down when event target equals currentTarget. That callback contradicts the retained alert-dialog contract above.

The production correction deletes only the outer backdrop's `onMouseDown` attribute. It does not add a shared primitive, change other dialogs, alter keyboard handling, or change callbacks/inputs. The three-file lease is this component hunk, `src/features/chat/resetChatDismissal.test.ts`, and this note.

## Isolated regression

The new test mounts the actual production component with existing React test renderer and TypeScript transpilation. Its allowlist includes the actual checkpoint preference helpers, menu icons, and motion hook. Fixture-local in-memory storage prevents persistence; the renderer supplies no DOM motion-ref node, so no animation/window boundary is invoked. No dependencies, workflows, existing tests, or shared harnesses change.

- Two regression cases deliver a matching-target mouse-down through the mounted backdrop's handler, when present, and require no close/reset and unchanged checkbox selection for both reset-files values.
- Two controls preserve explicit Cancel and Escape dismissal without reset.
- Six controls preserve explicit Reset click, Meta+Enter, and Ctrl+Enter, confirming once with each reset-files value and closing once. These callback/payload assertions match the existing focus regression; that file remains untouched.

The unchanged automatic CI command `node --test "src/**/*.test.ts"` discovers this test in both frontend jobs. `RESET_CHAT_DISMISSAL_SOURCE_ROOT` optionally selects the production source tree while dependencies resolve from the test checkout.

## Verification

- **Hosted RED passed as a reproduction:** regression-only published head `c8124d3ba3dc4ce398f9c3042edafb44e7e4d418`, ordinary automatic [CI run 42837744539](https://github.com/reason-machines/openconductor/actions/runs/42837744539). Both [Frontend unit tests](https://github.com/reason-machines/openconductor/actions/runs/42837744539/job/129904366918) and [Frontend typecheck + build](https://github.com/reason-machines/openconductor/actions/runs/42837744539/job/129904366992) failed only the two new outside-mouse-down cases (`reset-files=true/false`): `outside mouse-down must not dismiss Reset chat`, actual `1`, expected `0`. The unit job reported 1,746 pass / 2 fail / 0 skip. All eight new Cancel/Escape/explicit confirmation controls passed. In the build job, the same unit-test failure blocked later build steps; no successful typecheck/build is implied.
- **Corrected checkpoint:** applied only after the intended hosted RED above. The regression test and all seven prior focus/confirmation cases are unchanged; automatic exact-head GREEN is pending. No manual rerun or workflow dispatch.
- Local source/diff hygiene: `git diff --check` and comparison of `resetChatFocus.test.ts` against fresh main; recorded at commit.
- Local tests, typecheck, build, installs, browser/app/native runs, and screenshots: not run; local capacity admission remains withheld and #847 FULL STOP remains intact.
- Mounted handler/callback/state checks cannot prove real DOM event propagation, touch/pen delivery, browser focus, native physical keys, installed behavior, or side-by-side visual parity. Those remain unverified, not acceptance claims.
