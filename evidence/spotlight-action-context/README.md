# Spotlight command context

Conductor Rebuild owns `RUN-SPOTLIGHT-CONTEXT-1f-01`. The ledger cleared only the Spotlight request/error hunk in ScriptsPanel, the new spotlightActionContext regression, and this note. No backend, API, process policy, run-history, Setup or completion changes are part of this correction.

## Fresh source and retained reference

Fresh main was checked at `8f1f7b05d98c2469f1646864def08a9f7b774d1f` on 2026-11-11, after #968 merged as `aac02f97394e144a23624b3b969b3b13c03425a9`. The current panel includes #968's workspace-keyed run snapshot and history selection. That wiring is preserved. Its Spotlight command still uses one component-global `spotPending` value; the command's catch and completion unconditionally publish an error and clear pending state after an awaited IPC call.

The source path App → WorkspaceView → PanelStrip → ScriptsPanel reuses the panel on a workspace prop change: none of those three JSX edges has a workspace-specific React key. The five source files were read on fresh main. Their SHA-256 values are:

- ScriptsPanel.tsx: `bdbbda6afef5dcf9ae5d188fdd317aee45ea1acbac514c6b07baf6f602aef35f`.
- spotlight/testing.ts: `5ff5dc7b8cf8a3de1cf4b64e9066593a499281ee967650556e588b147c72ec64`.
- PanelStrip.tsx: `b95ab8eeee944a499f688655085c152deaf501f67ef45f9c3bbd4f6bff3d5c18`.
- WorkspaceView.tsx: `9c7973c1680be27685f1d09007c5c5136a81e854ec886aa452457012de3ac0a9`.
- App.tsx: `0d0921256b84b8a44e5b5704cf5c4549e34e66514c119e956179efdd2f101629`.

The reference is the existing authorized REA extraction of Conductor 0.87.6 from Sven's Mac, not a new app read. [The complete retained nro](../terminal/strip-toolbar/reference-nro.txt) is 29,165 UTF-8 bytes, renderer range `[7170202,7199367)`, SHA-256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`. The renderer identity and earlier REA limitations remain in [the scripts notes](../run-scripts/NOTES.md) and [history evidence](../run-selection-history/README.md).

The retained hook range `[7172036,7172821)` is 785 bytes, SHA-256 `a8d21231a968ffc3193d8fc40bfcb8f40336a3fe5837992d4e78db81ecdabaac`. Its `useTaskProcess`, `useIsTaskProcessBusy` and `useTaskProcessState` calls are keyed by `r?.localId` and task. The complete start/stop callback range `[7183537,7184843)` is 1,306 bytes, SHA-256 `2b83e7725197ec0238df20804c83ee14658dc640899218a2f1f0b2c45c18a0e4`, and supplies the local workspace identity to the process action.

Those are static reference observations. They support workspace ownership of displayed process state, not a claim about Conductor's observed native command timing or its handling of every late rejection. The regression below exercises OpenConductor's actual handler. No reference text is executed, no new acquisition or REA setup ran, and no new REA failure was encountered.

## Regression

`src/scripts/spotlightActionContext.test.ts` mounts the production ScriptsPanel and RunSplitButton through the existing locked React test renderer. It loads the real Spotlight/script APIs, selection model and run presentation helpers. Only Tauri IPC/events, portal placement, icons and unrelated settings/keybinding boundaries are substituted. Deferred start and stop responses enter through the actual `invoke` boundary, not a copied handler.

For each of start and stop, it checks:

- A's pending action does not become B's pending state after a workspace prop change; B remains able to start Spotlight.
- A's late rejection does not display in B.
- Settling A cannot clear a newer B request. This case invokes the actual mounted RunSplitButton's task-picker callback to admit B independently of A's already-broken pending projection; it does not claim the hidden menu is interactable on the broken UI.
- Same-workspace errors remain visible and the exact start/stop command arguments stay unchanged.

The tests also assert that restoring the panel does not issue a start or stop. Protected runSelectionHistory.test.ts, setupContext.test.ts and runCompletion.test.ts are untouched.

Hosted RED is confirmed on regression-only head `ac3fff8b804d41f299d6637a442786fab53d91b2`, [CI run42937552436/frontend unit job130251268624](https://github.com/reason-machines/openconductor/actions/runs/42937552436/job/130251268624), command `node --test "src/**/*.test.ts"`. Exactly six tests failed: pending start/stop projected into B, late start/stop errors appeared in B, and old start/stop completions cleared B's newer pending action. Both same-workspace command-identity/error controls passed. The full suite reported 2,178 passed, six failed, zero cancelled and zero skipped out of 2,184. Independent frontend job130251268970 passed typecheck and color lint, then failed at those same unit regressions before build.

Decisive failure messages include `B can start Spotlight while A's command is unresolved`, `a command failure belongs to the workspace that issued it`, and `an obsolete completion must not clear the newer request`.

The minimal correction stores workspace identity and phase in one request object. Pending state is derived only for the displayed workspace, a completion clears only its own request object, and a caught error is published only while its workspace is displayed. Existing script/history/Setup/completion paths, IPC arguments and process policy are unchanged. All eight regression cases remain unchanged from the hosted RED revision.

Hosted GREEN for the correction is pending. Local dependency installation, component execution, typecheck/build, browser capture, reference execution, native and installed-Mac checks have not run. No screenshot is available because this lane admits source/hosted regression work, not browser or native execution.

## Recheck inert reference identity

From the repository root:

```python
from pathlib import Path
import hashlib

base = 7170202
nro = Path("evidence/terminal/strip-toolbar/reference-nro.txt").read_bytes()
assert len(nro) == 29165
assert hashlib.sha256(nro).hexdigest() == "906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123"
for start, end, digest in [
    (7172036, 7172821, "a8d21231a968ffc3193d8fc40bfcb8f40336a3fe5837992d4e78db81ecdabaac"),
    (7183537, 7184843, "2b83e7725197ec0238df20804c83ee14658dc640899218a2f1f0b2c45c18a0e4"),
]:
    data = nro[start - base:end - base]
    assert len(data) == end - start
    assert hashlib.sha256(data).hexdigest() == digest
print("PASS: complete retained nro and both workspace-keyed consumer ranges")
```
