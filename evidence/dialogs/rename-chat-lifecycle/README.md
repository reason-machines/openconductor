# Rename chat replacement safety

Conductor Rebuild, 10 November 2026. A late successful save for chat A must not close a rename dialog subsequently opened for chat B. This correction is confined to the existing `RenameChatDialog` invocation in `WorkspaceView.tsx`.

## Retained real-app source

The retained-renderer owner read existing decoded archive members in memory, without extraction or a new REA or app run. Recovered code was treated as untrusted reference data.

- Conductor 0.87.6 renderer `/assets/renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index `/assets/index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `u8i`, zero-based UTF-8 bytes `[7417968,7421915)`, includes the complete tab-menu component. Its Rename chat action opens `wxe` with `sessionId`, `localWorkspaceId`, and `currentTitle`, when `canRename` permits it.
- Renderer import `i0 as wxe` and index export `MVt as i0` resolve the dialog ID. Index byte `3261445` starts the declaration `MVt="rename-chat-dialog"`.
- `Iya`, bytes `[11058891,11059207)`, renders `Rya` inside the ordinary dialog content with a `max-w-sm` class. The React key is its session ID.
- Complete `Rya`, bytes `[11059207,11060924)`, initializes the input from the current title. It trims the input and closes immediately for blank or unchanged values. Otherwise it calls the rename mutation. Its success callback first checks whether the current `wxe` dialog still targets the captured session ID, then closes. A mutation error uses `Oya`. Pending disables the input and OK, but not Cancel.
- `Nya`, bytes `[11060924,11060972)`, selects the input on focus. `Oya`, `[11060972,11060998)`, reports the error through the existing error helper. `Dya`, `[11060998,11061033)`, closes `wxe`.
- The rename mutation import resolves renderer `sL as D8r` to index `R9t as sL`. Complete `R9t`, index bytes `[3157415,3157546)`, returns the mutation hook using `TDt`. This pass does not claim to trace its persistence implementation.

[The earlier retained REA capture](../../../parity/ui-map/ref-captures.json) records successful opening of `dialog-rename-chat`, Evidence `ev_05962b446869c719b8e6876863d558eb210cf7b290d83aef5a906715a340c652`. That extracted-frontend fixture receipt supports the action/dialog's existence, not the delayed-save schedule. This pass did not inspect its image or run another capture.

## OpenConductor failure and correction

The comparison source is main `7833cd4da12fb4f3bf345dd5c0caa2b29bf8c354`. The working source matched main for `RenameChatDialog.tsx`, `ChatTabMenu.tsx`, and `WorkspaceView.tsx` before this correction.

The actual `RenameChatDialog.submit` awaits its captured `onRename`, then calls its captured `onClose`. The parent previously supplied `onClose={() => setRenaming(null)}`. Therefore this schedule cleared B incorrectly:

1. Submit A with a pending save.
2. Cancel A. Cancel remains available during the save.
3. Open Rename chat for B in the same workspace.
4. Resolve A's save. Its captured close callback clears the current parent state, including B.

The parent close callback now uses a functional state update. It clears the state only if the active chat ID equals the captured chat ID. The dialog invocation is also keyed by chat ID, matching the retained reference's component identity. A reopened dialog for the same chat can still close on that chat's earlier success. No generation or cancellation policy is invented.

No persistence, fork, provider, input validation, Cancel, pending-button, or error behavior is changed. `RenameChatDialog.tsx` itself is unchanged.

## Focused proof

The reusable command is:

```bash
(ulimit -t 3 && timeout 30s nice -n 15 node evidence/dialogs/rename-chat-lifecycle/check-boundary.mjs)
```

Exactly two runs were admitted and executed on the existing shared cloud computer. Each used only Node built-in modules, with at least 1 GiB of memory available, lowered process priority, a 3-second per-process CPU limit, and a 30-second command wall limit. No package installation, transpiler, React renderer, server, browser, app, provider, or database was started. The admission was released after GREEN.

- **RED: failed as expected.** [Before TAP](before.tap) has seven passing cases and two assertion failures. The actual production callback schedule yields `null` instead of B. The separate source-identity check finds no dialog key. Neither failure is a startup or resource failure.
- **GREEN: passed.** [After TAP](after.tap) has nine passing cases and no failures using the identical command and unchanged regression script after the production correction.
- The script evaluates the actual production `submit` function and both actual parent callback expressions, with an in-memory state setter and a deferred save. It does not test a copied implementation of the close guard.
- Controls exercise an active A save closing, ordinary close, a cancelled save without a replacement, the reference's same-session success rule, a rejected save preserving B and reporting an error, and blank or unchanged trimmed input avoiding persistence.
- The key case evaluates the production key expression for different chat IDs and changed titles. It is a source identity invariant, not an observed React remount or input-reset test.

An optional commit argument reads production source from that revision, for example `node evidence/dialogs/rename-chat-lifecycle/check-boundary.mjs 7833cd4d`. It was not used for additional runs in this pass.

## Verification limits

React mounting, real Escape or pointer interaction, replacement-dialog focus and input reset, browser screenshots, native behavior, and actual persistence are **not run**. Local compilation, full unit tests, and app E2E are **not run** because only the bounded built-in callback check was admitted. Normal automatic PR CI is reported separately from these local checks. The focused evidence script is retained for explicit execution; its directory is not part of the existing automatic unit-test glob.

No new REA call failed in this pass, and no new REA tool bug is claimed. Retained reference-fixture and native acceptance gaps remain. Source and callback proof must not be promoted to native or visual parity.
