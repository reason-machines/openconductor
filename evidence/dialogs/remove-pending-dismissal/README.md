# Repository removal pending dismissal

Conductor Rebuild, 2026-11-10. Scope is the removal dialog's close callback while its mutation is pending. This is not a native repository-removal test.

## Retained Conductor source

The retained-renderer owner supplied the complete literal `Dra` function from Conductor 0.87.6, `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The function occupies zero-based, end-exclusive UTF-8 bytes `[10078590, 10084752)` and UTF-16 code units `[10033014, 10039176)`. Its supplied SHA-256 is `ce74998d935a19a67e5c620887af56bd2573a2e9488d737447cddeec9156044a`. This pass did not independently rehash the retained artifact or evaluate extracted target code.

The complete wrapper contains these literal fragments:

- Local open state and mutation: `d=csi(),[h,m]=$.useState(!1)`.
- Delete request: `de=()=>m(!0)` and `onRequestDelete:de`.
- Cancel: `p.jsx(Dm,{disabled:d.isPending,children:"Cancel"})`.
- Mutation: `d.mutate(n.id,{onSuccess:()=>m(!1),onError:Mra})`.
- Primary action: `d.isPending?"Removing...":"Remove"` and `disabled:d.isPending,onClick:ze`.
- Root: `p.jsx(Tg,{open:h,onOpenChange:m,children:Qe})`.

The root forwards its open-state callback directly to the local setter, without a mutation-pending condition. Disabled actions do not add a guard to that root callback. This is a wrapper-source fact. The owner explicitly did not reverify the primitive bodies in this pass. The previously traced shared primitive route and its limits are recorded in [the restore evidence](../restore-pending-dismissal/README.md). No new reference Escape interaction or native observation is claimed.

## OpenConductor correction

The merged #857 shared API defaults `dismissWhilePending` to false. `RemoveRepositoryDialog` now opts in, as the restore caller already does. The default guard for other callers is unchanged.

The single production-line edit leaves the pending state, both disabled buttons, pointer protection, shortcut policy, mutation, error callback, and success callback unchanged. Dismissing the presentation does not request cancellation of the already-dispatched operation. No repository was removed by this verification.

## Rerunnable proof

```bash
node evidence/dialogs/remove-pending-dismissal/check-boundary.mjs e92b5dd8
node evidence/dialogs/remove-pending-dismissal/check-boundary.mjs
node evidence/dialogs/restore-pending-dismissal/check-boundary.mjs
```

The probe reads the actual production removal JSX attributes, the actual shared parameter defaults, and the actual frame-close closure. It evaluates that OpenConductor callback with pending true and false. It does not evaluate Conductor code. The probe also checks that both shared action buttons retain `disabled={pending}` and that removal retains `primaryShortcut={false}`.

- **RED:** main `e92b5dd8f6e0655766d4360e8b24c255907a3a42` exits 1, `repository removal permits a close request with pending=true`, `0 !== 1`. See [captured failure](before.txt).
- **GREEN:** the same callback-boundary probe passes both states after the opt-in. See [captured success](after.txt).
- **Unchanged shared semantics:** the existing restore probe passes all four pending and opt-in combinations. This includes the default pending guard for other confirmations.
- **Not run:** React mounting, browser Escape, screenshots, native app interactions, actual filesystem removal, local compilation, dependency installation, or app builds. Automatic CI is separate from these source-only checks. No screenshot exists because this lane did not start a UI runtime.

## Evidence gaps

The retained wrapper establishes direct root-callback wiring, not fresh reference runtime behavior. This source projection is not a component render or end-to-end test. Browser and native dismissal parity remain unverified. Loader animation and pixel geometry are unchanged and outside this correction.
