# Ordinary Run completion reaches the mounted panel

Conductor Rebuild owns this focused unit on the assigned branch. A normal merge of current main `2bfbf493196ef8e649e613676e5a0bff2fd57640` established a clean, zero-net baseline before edits. No branch switch, reset, stacking or adoption of the completed #843, #872 or #878 deliveries was used.

## Source finding

The existing natural-exit worker in `crates/scripts/src/runner.rs` commits `Stopped`, the retained transcript and exit under its current-process identity guard. It sends no completion notification. Rust and TypeScript `ScriptEvent` contain output and setup completion only. The generic Tauri emitter and API listener carry those events unchanged.

`ScriptsPanel` refreshes run status on mount, after actions and after setup completion. Run output appends bytes without reading status. A process that exits after the action's status read can therefore leave the mounted panel on its old running snapshot. The Run button remains Stop, and busy-only Open actions remain offered, until another refresh. This was initially a source-derived candidate, not a reproduced native failure.

Setup already commits an outcome and invokes its completion callback outside the setup lock. The service emits `SetupFinished`, gives a queued run precedence, and gates auto-run. This unit does not change that policy, task selection, run history, failed-spawn mapping, stop signals or native lifecycle ownership.

## Retained reference

The complete inert `nro` function in `evidence/terminal/strip-toolbar/reference-nro.txt` came from the earlier authorized real-Conductor 0.87.6 REA investigation. This unit reads it as data and verifies its identity without executing extracted code or acquiring the app again.

- Renderer `renderApp-D_fmY7hW.js` SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Complete `nro`, UTF-8 `[7170202,7199367)`, 29,165 bytes, SHA-256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`.
- State hooks, UTF-8 `[7172036,7172832)`, SHA-256 `8b533f2c28e86bf6855bba1ea11e1fcc1952876c64a9e59659e3d3c666936f76`. The component reads `q_.useTaskProcessState` and `q_.useIsTaskProcessBusy`.
- Complete `B1` and `$u` callbacks, UTF-8 `[7183537,7184843)`, SHA-256 `2b83e7725197ec0238df20804c83ee14658dc640899218a2f1f0b2c45c18a0e4`. Stop calls `q_.killProcess`; start records the clicked task with `tX.recordRun`, selects Run and awaits `q_.startProcess` with that task's identity and command.
- Busy/idle toolbar branch, UTF-8 `[7189979,7192924)`, SHA-256 `eac44be9837cdbd55ce9b895cd1179a3f53da204bbdf68bb81a074c89809b81a`. Stop is rendered while the task is busy; the task Run button returns otherwise.

This proves the static callback and presentation relationship, not the reference's complete native exit transport. The body of that transport is not retained here. No mapping of failed-spawn labels into new states is justified or attempted.

The earlier setup provenance remains in `evidence/run-scripts/NOTES.md` and `evidence/terminal/setup-indicator/reference-source.json`. Their screenshots used synthetic IPC, not native setup execution. No screenshot was inspected or newly captured for this unit.

## Regression-only checkpoint

`src/scripts/runCompletion.test.ts` loads the complete production `ScriptsPanel`, `RunSplitButton`, `PreviewOpenButton`, API bridges and real task/presentation logic with the locked React test renderer. It intercepts Tauri IPC and event delivery, substitutes the portal and popup boundary, and replaces terminal drawing with a plain output element. It does not duplicate the selection or completion callback under test.

The five cases require natural exit 0 and 7 to restore Run, remove busy-only Open, retain the final output and restart once without Stop IPC; retain an explicitly picked nondefault task; ignore another workspace; and refresh authoritative current status rather than overwrite a still-running task from a completion payload. The wire fixture supplies an external event object without referring to a future TypeScript symbol, so the checkpoint compiles against the existing public interfaces.

`ordinary_run_exit_emits_its_committed_status_and_keeps_output` uses the existing service API, event serialization and real process runner. It expects one final event with the committed stopped status and retained transcript. Existing runner tests already check natural exit and output; existing service tests check setup completion, queued precedence and auto-run gates. None previously asserts the completion-to-panel handoff.

At regression checkpoint `1c850913dd1b59c87174abcd99b3b7ea451536f6`, production code was unchanged. The ordinary [hosted CI run](https://github.com/reason-machines/openconductor/actions/runs/42778417315/job/129702300214) passed TypeScript typecheck and color lint, then ran 1,628 frontend tests. Exactly three failed: exit 0 and exit 7 with `natural completion returns the real split button to Run`, and the explicitly picked Test task failing to return to Run. Both completion controls passed. This is actual-component behavioral RED, not a missing-type compile error. All five component tests remain unchanged for GREEN.

The scripts crate checkpoint stopped at one multiline `assert_eq!` rustfmt difference, so no Rust behavioral RED is credited. The formatting-only correction follows the exact hosted diff without changing the assertion.

## Minimal correction

The existing `RunRequest` now supplies a required `on_finished(RunStatus)` callback. The existing natural-exit worker invokes it only after its current-process identity guard commits the stopped status, transcript and exit, and after dropping the manager lock. Failed launch behavior and the existing replacement guard are unchanged.

The service forwards this existing status as `RunFinished` through its existing event sink. The TypeScript union mirrors that serialized shape. The mounted panel responds through its existing refresh path, so an event never directly overwrites a newer authoritative run status. No new store, polling loop, global subscriber, Tauri command or API adapter is added. A runner regression reads status and transcript from inside the callback, which requires the lock to have been released. All existing request constructors supply the callback; the tests that do not observe completion use an inert callback.

## Checks and limits

- Passed before edits: clean working tree and `git diff --exit-code origin/main HEAD` after a normal main merge.
- Passed: fresh retained `nro` identity and bounded callback-range hash checks, read-only current-main source comparison.
- Not run locally: `node --test src/scripts/runCompletion.test.ts`, Rust tests, transpilation, typecheck, build, install, app, server, browser, native or provider execution. Capacity admission has not been granted.
- Hosted behavioral RED passed its reproduction gate at `1c850913` as recorded above. Hosted GREEN on the correction is pending. No result is inferred from source text or a compiler error against a missing future API.
- No new screenshot is available because browser and app execution are outside the admitted work. Component/IPC intent is not terminal drawing, real process-to-webview delivery, native behavior, installed-package acceptance or visual parity.
