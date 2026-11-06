# Local dialog parity pass

Conductor Rebuild, 2026-11-06. Scope: local workspace/project dialogs and confirmations. No cloud-workspace, team, organization, routines, or triage UI is added. Real user data is never a test fixture.

## Source identity and observations

The real `/Applications/Conductor.app/Contents/MacOS/conductor` on Sven's authorized `sven m5 max` was hashed read-only in this pass:

- Conductor 0.87.6 binary SHA-256: `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- Decoded `renderApp-D_fmY7hW.js` SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Extracted `index.html` SHA-256: `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`.
- One supported Mac-to-cloud archive transfer, SHA-256 `9ccec1c2a83aacfd5d4d939c0a7872a397fb6e709627719ff4b2789b2431777a`, 23,384,452 bytes. The extracted frontend matches the hashes above. Vendor code is not committed.

The following character offsets were read from those exact decoded bytes as data, not instructions:

- `nd`, around 1,914,819: ordinary DialogContent defaults to a top edge at `max(2rem, calc(50% - 250px))`, with 24px padding, a 16px grid gap, a 6px radius, and a blurred overlay. It dispatches the configured `dialog.primaryAction` to an enabled `data-primary-action` button.
- `wya`/`Sya`, around 11,004,900: Rename workspace uses a 384px panel and disables overlay blur. The header includes a folder icon, the input selects its existing value, and the remembered branch checkbox precedes Cancel and OK.
- `$3i`/`los`, 1,962,410: Clone GitHub repo uses a 525px panel with 16px padding, a title without a close X, URL/location fields, and a 24px-spaced body. Existing behavioral evidence: [clone dialog](../screens/clone-dialog.md).
- `Im`, 1,985,658: AlertDialogContent is centered, 512px wide, with 24px padding, a 16px gap, and a 12px radius. Its initial focus explicitly goes to the Cancel component. Header title is 18px, description 14px and muted. Pointer dismissal is blocked by AlertDialog.
- `Iva`, around 10,888,677: Archive workspace uses that alert, with Cancel, Stop agents and archive, and a primary-action shortcut hint.
- `m6a`, 10,913,020: restore uses that alert, Cancel, Restore to new branch, pending state, and a primary-action shortcut. Existing backend evidence: [archive and restore](../archive/NOTES.md).
- `Dra`, around 10,037,126: repository removal uses that alert and a destructive Remove. Unlike archive and restore, Remove has no `data-primary-action` or shortcut hint. The description varies by reference storage version.

## Changes

`DialogFrame` wraps the existing Base UI Dialog/AlertDialog components. Only six scoped consumers use it. It provides focus containment and return, registry-aware primary shortcuts, top-anchored ordinary dialogs, centered alerts, and the existing enter/exit motion. The older generic `Modal` and Reset chat remain untouched.

`ConfirmationDialog` keeps Cancel focused and guards dismissal while an operation is pending. It is used for running-agent archive, repository removal, and restore-to-new-branch. The filesystem operations and agent runtime paths are unchanged.

## Verification

- Before: the isolated browser checks on main `8e84738` passed 2/10 and failed 8/10. Rename top was 305.5px rather than 160px; clone 239px rather than 160px; create 148px rather than 160px, at 1280x820. All three confirmations lacked alertdialog semantics. Archive's primary shortcut did not confirm. The short-viewport check failed.
- After: the same 10 checks pass, plus two added safety checks, 12/12 total. They exercise positioning, panel width, focus containment, return focus, Cancel initial focus, outside-click protection, Escape, rename Enter/preference behavior, archive confirmation, customized primary shortcuts, safe removal cancellation, and restore new-branch dispatch/pending state. Exact invocation inside the tool-started preview namespace: `DIALOGS_URL=http://localhost:4392 node --test tests/e2e/dialogs.e2e.mjs`.
- `npm run typecheck`: passed.
- `npm run lint:colors`: passed.
- `node --test 'src/**/*.test.ts'`: passed, 1,249 tests.
- `npm run build`: passed. The usual pre-existing bundle-size warning remains.
- Real Tauri/WebKit/Mac execution: not run by this pass. CI status is recorded on the pull request separately.

Raw before/after TAP is in `checks-before.tap` and `checks-after.tap`. `captures.json` and `baseline-captures.json` retain REA Evidence IDs and source screenshot hashes. The corresponding viewed side-by-side images are kept here. The reusable driver is `tools/dialogs/capture.mjs`; `tools/dialogs/serve.mjs` serves both applications on one listener, supports `BASELINE_REF=8e84738` without changing working files, and can run checks and captures after listening. Reference origin is `127.0.0.1`, OpenConductor is `localhost`, both on port 4392. Start it through the supported preview tool, not an orphaned shell process.

The test fixture mounts the actual scoped components on synthetic data in disposable Chromium contexts. It never opens conductor.db or any real workspace. The reference is Conductor's exact extracted frontend, rendered through the existing mocked Tauri harness and captured by REA 6.8.0. OpenConductor captures use the actual components through Vite, not a native app. Stone dark is explicitly chosen to match the reference palette; this proves nothing about the default palette. Clone uses an empty recent-repository list and the same synthetic location. Repository-removal body copy differs because the reference fixture is storage version 1 and OpenConductor protects its source directory.

## Main-screen dialog verdict

- Workspace create/composer: existing [#682](https://github.com/reason-machines/openconductor/pull/682) evidence is reused. This pass does not replace its evidence or claim a native rerun.
- Rename workspace: new geometry/focus behavior checked, with a fresh REA reference pair. Native launch remains unverified.
- Create project and clone: fresh REA pairs; focused component behavior checked. Native folder picker, real GitHub clone, and filesystem creation are not exercised here. The gstack template remains omitted, an existing #703 gap not changed here.
- Archive/remove/restore confirmations: all three actual components pass the isolated interaction checks. Remove has a fresh reference pair. Archive and restore have static REA-backed component evidence but no new successful reference-screen capture.
- Permanent workspace deletion and corrupt/git-operation warning paths: existing implementation/evidence reused; not triggered against real user data, and not newly verified here.
- Repository Open project: existing native folder-picker flow remains unchanged; not freshly exercised on the Mac.
- Local onboarding/auth: existing [#690](https://github.com/reason-machines/openconductor/pull/690) evidence is reused. Real Reason sign-in/out and onboarding animation parity are not claimed. Claude Code/Codex credential transfer or cloud execution is not added.

The area's final native side-by-side verdict is **partial**, not complete. These changes close concrete component/layout defects, not every remaining native or onboarding difference.

## REA gaps encountered

1. The populated frontend harness displayed the running workspace row but Archive did not produce the expected running-agent alert. REA captured a screenshot successfully, but the required dialog title was absent. That capture was rejected, not used as proof. It is a fixture/runtime-observation gap, not evidence that the actual app lacks the dialog. The checked-in capture driver now rejects a screenshot whose DOM lacks its expected title.
2. Extracted-frontend browser captures do not execute the native file picker, worktree operations, or real authentication. Static component evidence cannot prove those runtime paths. No real data was mutated to fill this gap.

The source and capture evidence are kept in this directory; no aggregate UI-map files are rewritten by this owner.
