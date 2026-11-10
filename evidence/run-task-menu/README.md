# Run task menu starts the selected task

Conductor Rebuild prepares this focused correction from a clean main baseline at `fa9940d7`. The assigned branch was updated by a normal main merge. `git diff --exit-code origin/main HEAD` returned zero before this unit's edits. No branch switch, reset, parent PR adoption, or stacking was used.

## Reference

The earlier authorized REA investigation retained Conductor 0.87.6's real renderer `renderApp-D_fmY7hW.js`. Its SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

This unit read the [complete retained `nro` function](https://github.com/reason-machines/openconductor/blob/861a741072f86ce87dc4408ead27a5f3aa8f2898/evidence/terminal/strip-toolbar/reference-nro.txt) as inert text, not executable instructions. The raw function occupies UTF-8 bytes `[7170202,7199367)` in that renderer. A fresh `sha256sum` check of the retained text matched `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`. No new app acquisition, extraction, REA execution, app launch, or capture was needed.

The task-menu mapping calls the start action with the clicked task directly:

```javascript
bi.tasks.map(Nl=>p.jsxs(Yc,{onClick:()=>{$u(Nl).fireAndForget()},children:[p.jsx(swt,{task:Nl,className:"h-4 w-4",wrapperClassName:"mr-2"}),p.jsx("span",{className:"truncate",children:Nl.label})]},Nl.id))
```

The complete `$u` callback checks task availability and workspace write access, requires the workspace and repository, derives the command or Spotlight mode, records the clicked task ID, selects Run, and calls `q_.startProcess`. Its arguments include `taskId:bi.id`, `taskLabel:bi.label`, `executionTarget:bi.executionTarget`, and `isSpotlight:yo`. The Configure item calls `K()`, not `$u`.

This is static callback evidence. It does not prove native execution, live process behavior, or visual parity. The reconstruction remains local-only for these tasks. No cloud terminal or provider execution is added.

## Correction

Previously, `ScriptsPanel`'s `onPick` only called `setPicked(id)` and `onShowRun()`. It never started the task. Calling the primary toggle immediately afterward would also read the old render's `shown` value.

The existing `startScript` action now takes the intended script ID explicitly. The primary Run button passes `shown`; the menu passes the clicked ID through the existing `act` error and refresh path. Spotlight's existing action takes an explicit start or stop argument so a menu pick starts Spotlight while its primary button still toggles. Configure is unchanged.

Only `src/components/ScriptsPanel.tsx` changes in production. No store, task model, lifecycle, optional compatibility prop, backend, style, shortcut, or process implementation is added.

Before editing, all twelve changed filenames of [parent PR #843 at `861a7410`](https://github.com/reason-machines/openconductor/pull/843) were inspected. Its only product file was `PanelStrip.tsx`; it contained no `ScriptsPanel.tsx` change or competing Run-menu fix.

## Regression contract

`src/scripts/runTaskMenu.test.ts` is discovered by the ordinary `node --test "src/**/*.test.ts"` CI command. It loads complete production sources for `ScriptsPanel`, `RunSplitButton`, the keyed cache, the scripts and Spotlight models, their API bridges, preview parsing, and Run-tab presentation. It uses real React hooks and the already-locked React test renderer. It does not copy a callback or task-start helper into the fixture.

The tests click the actual split-button chevron and the menu items supplied by the real component. Tauri IPC is intercepted at `invoke`; the real API bridge produces the asserted payload. The fixture substitutes the portal target, popup DOM wrapper, decorative children, unrelated settings/keybindings, and event transport. It does not run the native popup, browser layout, process backend, PTY, sync, or native app.

The eight cases require these outcomes:

- Picking nondefault Test while Dev is shown starts `test` once and reveals Run.
- Picking Test and then Dev starts those IDs in order, not the previously shown ID.
- Picking Spotlight calls `spotlight_start` with the workspace and repository, not `run_script_start`.
- Configure opens settings without showing Run or starting a task.
- Primary Run and Stop keep their existing start and stop commands.
- Primary Run uses the task most recently picked in the menu.
- Primary Spotlight Stop and Start keep their existing command meanings.
- A rejected menu start is rendered through the existing `act` error path.

The source-only fixture intentionally supplies an inert portal target. The popup wrapper forwards the real menu descriptors' click callbacks; it does not implement task selection or starting. Tests therefore cover component interaction and IPC intent, not popup placement or native process acceptance.

## Verification

- Passed before edits: clean working tree and zero-net current-main baseline.
- Passed: retained `nro` SHA-256 identity check and independent twelve-file parent-PR scope check.
- Not run locally: `node --test src/scripts/runTaskMenu.test.ts`, failing-before regression, passing-after regression, transpilation, typecheck, build, dependency installation, app, server, browser, native, or provider execution. Local execution has no admission for this unit.
- Hosted results must be recorded separately after fresh ready-main publication. No local RED to GREEN or hosted pass is claimed here.
- No screenshot or recording was captured because app and browser execution are outside the admitted work. Native behavior and placement remain unverified.
