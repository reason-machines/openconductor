# Reset chat initial focus

Conductor Rebuild, 2026-11-10. Scope: move initial autofocus from destructive Reset to Cancel without changing the shared dialog wrapper, dismissal, shortcuts, confirmation, or reset-files payload.

## Retained reference and complete caller closure

The REA-decoded Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, recorded in `evidence/frontend/tauri-assets-manifest.json`. REA analysis identity is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`; its partial whole-program graph alone is not the proof. This conclusion uses retained complete literal reads; no reference app launch or acquisition was performed. Vendor source is not copied here.

The complete Reset root and content survive in [UI-map Session](https://reasonmachines.com/agents/3b8428f4-96bb-41f8-b596-edcf51628df7), source `80342797-2f40-46db-9171-ca263b61a89d`, revision `22831192`, text ranges `[1034,1451)` and `[1451,4258)`. Paired command source `68013ff8-12ec-4467-8a0d-ca820fcd6d5b`, revision `22831191`, records the original 5,200-byte read beginning at UTF-8 byte `8908600`. Reconstructed renderer ranges below are zero-based, end-exclusive:

- `uDo`, bytes `[8909221,8909638)`: renders `Tg` with only open state, its change callback, and children. Its `Im` receives children only. Extra caller props go to `dDo`, not `Im`; no initial-focus or open-autofocus override reaches the focus wrapper.
- `dDo`, bytes `[8909638,8912447)`: renders the exact Reset chat title/description, reset-files checkbox, Cancel through `Dm`, and destructive Reset through `Ag`. Cancel receives only children. Reset receives its click handler, disabled state, destructive variant, primary-action marker, and children. The checkbox has no autofocus prop. The complete function has no imperative focus or focus effect. Byte `8910893` locates the title string, not the function start.

The complete shared focus declarations are retained in renderer-owner [Session](https://reasonmachines.com/agents/13576d11-76fb-4842-aa9b-c398f9ca26f3), message `20b3fde0-1ce6-4121-816b-22972654fb23`, also recorded in `evidence/dialogs/quit-focus/README.md`:

- `Tg` `[1983870,1984773)`, fragment SHA-256 `4f7b93660718d8e44f87fa32f4fb1eba733f538d3ecf96747182aaf27efc637a`: adds no focus override.
- `Im` `[1986046,1988633)`, fragment SHA-256 `beb65b39a01d82a2900e25add3857daaec2a75ea608c69514adc516a97083b76`: registers the Cancel element through `W3i`; its default initial-focus function focuses that element unless an optional cancelable open-autofocus handler prevents it.
- `Dm` `[1991418,1992254)`, fragment SHA-256 `d3dc21b648a6e3aab9f05b19fdb7bb897b74098f91f5ec85e18badb475eee691`: registers the rendered Cancel button with that callback.

The complete `uDo`/`dDo` props path supplies neither override nor prevention handler. This proves Cancel-first intent in the shipped source. It is not a native runtime acceptance result.

## OpenConductor mismatch

Baseline main `4988e47` gives `autoFocus` to destructive Reset in `src/features/chat/ResetChatDialog.tsx`; Cancel lacks it. The production correction moves that attribute to Cancel in the same button pair. No other component or callback changes.

## Mounted regression and execution boundary

`src/features/chat/resetChatFocus.test.ts` mounts the actual component using the existing React test renderer and TypeScript transpiler. It loads only the component, real checkpoint preference helpers, menu icons, and dialog-motion hook. A fixture-local in-memory storage boundary prevents persistence; no native or backend imports are admitted. React test renderer has no DOM node for the motion ref, so no window/animation boundary is invoked.

The regression checks:

1. The mounted host tree declares Cancel as the sole autofocus target; mount and Cancel do not confirm reset.
2. Explicit Reset click, Meta+Enter, and Ctrl+Enter each confirm exactly once with both the default enabled and toggled-off reset-files payload, then close once.

This verifies the mounted initial-focus declaration and real callback/state contract, not a browser's `activeElement`, native physical-key delivery, or plain Enter's browser-default activation. Those runtime observations remain outside this assignment.

The unchanged `.github/workflows/ci.yml` discovers the new file through `node --test "src/**/*.test.ts"` in both frontend test jobs. No workflow, dependency, or shared harness edit is needed. `RESET_CHAT_FOCUS_SOURCE_ROOT` can point the isolated regression at another source tree while dependencies remain resolved from this test's checkout.

- Hosted before-fix result: regression-only head `0a01e7e667913fa2da6ee5883404b970d2a2666f`, [CI run 42823360922, frontend-unit job 129854234020](https://github.com/reason-machines/openconductor/actions/runs/42823360922/job/129854234020), log lines 3061–3144. The sole failing case was the intended autofocus assertion: actual `oc-alert-btn oc-alert-destructive`, expected `oc-alert-btn oc-alert-cancel`. All six explicit click/Meta+Enter/Ctrl+Enter payload cases passed. The second frontend job failed at the same unit-test step, after typecheck; no local workload was used to reproduce this.
- Corrected checkpoint: only the production attribute moves from Reset to Cancel; the entire regression remains unchanged. Automatic exact-head CI is pending; the correction is not yet a verified pass.
- Local test/typecheck/build execution: not run; shared-cloud capacity admission was explicitly withheld.
- Source/diff hygiene: checked separately at commit.
- Browser, app, native/install, screenshots, focus containment/return, pointer dismissal, and installed behavior: not run. #847 FULL STOP remains intact; no visual parity claim.
