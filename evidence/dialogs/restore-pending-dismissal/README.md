# Restore dialog pending dismissal

Conductor Rebuild, 2026-11-10. Candidate scope: permit the restore dialog's close request while restoring, without enabling its buttons, changing other confirmations, or cancelling the restore operation. No production correction has been made.

## Retained real-app source

The existing REA-decoded Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. This pass uses bounded literal receipts supplied by the retained-renderer owner, not a new extraction or app run. Offsets below are zero-based UTF-8 bytes, end-exclusive.

- `d6a`, bytes 10958437–10958814, SHA-256 `5f697c671e6e214c56d64586b8f90ea490d3d2ffe74edbaf6bbfdf130bf6f645`: the root gets `open` and `onOpenChange: h6a`; the content wraps `m6a`.
- `h6a`, bytes 10958856–10958902, SHA-256 `54f1d335d4cdc3dbdcf22eb4e490affdad06eb78f76ec574722fa797e67ade27`: a false open value closes the restore dialog, without checking pending state.
- `m6a`, bytes 10958948–10960364, SHA-256 `a566b387b4f480e29156a2043ed7625d521d79dd2c7f03c793efc88f3f40c0d0`: pending disables Cancel and the primary action; successful restoration closes the dialog. Neither this component nor its immediate wrappers adds a pending guard to the root's close handler.

The same retained renderer also supplies the immediate primitive route:

- `Oos`, bytes 1983759–1983804, fragment SHA-256 `0abf461395f1cf33902d693f3406ca5ebd519abd08ca463e3df524e1758fe19e`: calls the shared root with `alert-dialog`.
- Root Escape branch, bytes 1984360–1984548: calls the registered Escape handler and permits that handler to cancel dismissal by preventing the event. Otherwise it forwards the open state.
- `Im` forwards popup props at bytes 1988294–1988426 and registers an optional Escape handler through `V3i` at bytes 1986527–1986701. The restore caller supplies only children, not an Escape override.

The composer evidence owner read the already-retained archive member in memory without extraction or restoration. `index-BGEQ8YjU.js` is 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

- Export mapping at bytes 3481337–3481405 resolves `c4` to `qI`.
- Complete `qI` facade at bytes 3261060–3261123, SHA-256 `c1bb8a4a11aa2ca7ef11f12ea33a12fbc786589854cb77de058586113b1f7029`, forwards `closeDialog` to `HI.getState().closeDialog`.
- Complete `HI` initializer at bytes 3260595–3261012, SHA-256 `5a904266c753baf688d438b953414141716ed65a82e0589b8557e8d7cabaee33`, closes when no ID is supplied or the active dialog ID matches, clears its stored data, and has no mutation-pending guard.

The immediate Escape path and imported close-action chain therefore contain no pending guard for restore. This resolves the source gap; it does not claim a newly observed reference Escape interaction or native behavior.

## OpenConductor boundary

`ConfirmationDialog` currently guards every frame close request while pending. `RestoreWorkspaceDialog` has no way to opt out. Its already-dispatched restore is owned by the store, not the dialog lifecycle; closing the dialog does not cancel that operation.

The proposed correction is restore-only. Cancel and Restore stay disabled during the request. The existing pending label, shortcut hint, outside-click protection, removal dialog guard, and backend operation stay unchanged.

## Verification status

- Source comparison: complete for the immediate restore wrappers, primitive Escape path, and imported global close action. These are retained-source facts, not new app observations.
- Source-handler diagnostic: failed as expected with `0 !== 1` when the current frame-close closure was invoked with pending true and dismissal allowed. This reads/evaluates the checked-in closure, not a replacement implementation. It is not an actual Escape regression or proof of a reference mismatch.
- Behavioral regression: added to `tests/e2e/dialogs.e2e.mjs` after the #852 owner explicitly released that file. The new case uses real Escape keypresses against the existing fixture's actual production restore component. It checks disabled buttons, inert outside clicks, exactly one new-branch dispatch, and Escape dismissal without another action. Imports, setup, helpers, fixture, and server are unchanged. Automatic CI RED has not been observed yet; production remains unchanged.
- Local runtime, installation, compilation, browser capture, Mac/native restore: not run. This lane is source-only; behavioral RED/GREEN will use normal automatic PR CI.
- Working-loader animation fidelity remains an unrelated evidence gap. No guessed spinner or asset substitution is included.
