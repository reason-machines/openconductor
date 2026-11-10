# Quit confirmation initial focus

Conductor Rebuild, 2026-11-10. Scope is initial focus and plain-Enter intent in the existing Quit confirmation. No dialog wrapper, pointer dismissal, Escape, quit callback, native process, or persistence behavior changes.

## Retained reference

The REA-decoded Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The original REA analysis is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Its whole-program graph is partial. This conclusion uses complete, bounded literal reads of the retained renderer, not the incomplete graph or a new app run.

The retained-renderer owner supplied the following complete declarations. Byte ranges are zero-based UTF-8, end-exclusive.

- `y5a`, bytes [11118132,11119850), fragment SHA-256 `957aeff5163bf10ea2015761871ed1ab3badeb1f2f961188bb2f01efadfce4d8`: the Quit confirmation renders `Tg` around `Im`, with `Dm` Cancel and a destructive `Ag` primary action. It supplies no initial-focus or open-autofocus override to `Im`.
- `Tg`, bytes [1983870,1984773), fragment SHA-256 `4f7b93660718d8e44f87fa32f4fb1eba733f538d3ecf96747182aaf27efc637a`: forwards the open state, children, and other props through `Oos`, registering its Escape callback separately. It adds no focus override.
- `Im`, bytes [1986046,1988633), fragment SHA-256 `beb65b39a01d82a2900e25add3857daaec2a75ea608c69514adc516a97083b76`: provides a callback through `W3i` that stores the Cancel element. Its default initial-focus function calls that element's `focus({preventScroll:true})`, unless an optional cancelable open-autofocus handler prevents it, and passes this function to the actual popup.
- `Dm`, bytes [1991418,1992254), fragment SHA-256 `d3dc21b648a6e3aab9f05b19fdb7bb897b74098f91f5ec85e18badb475eee691`: consumes `W3i` and registers its rendered button through that callback.

The complete literals are retained in renderer-owner Session `13576d11-76fb-4842-aa9b-c398f9ca26f3`, message `20b3fde0-1ce6-4121-816b-22972654fb23`. The complete Quit caller was also retained earlier in Session `89cd5e65-fd26-4833-bb16-4e2961decde7`, source `8b084490-e4e2-4bd3-a426-ba58eba7d77e`, revision `22490102`. Vendor source is not copied into this repository.

This establishes Cancel-first focus in the shipped source. It is not a fresh reference runtime observation. The underlying outside-pointer path remains unresolved in this pass, so no pointer behavior is inferred from the alert name or changed.

## OpenConductor comparison

Current-main baseline `5eded44f223b38b59c121781036afab002b961f7` gives `autoFocus` to Quit in `src/features/quit/QuitDialog.tsx`. That differs from the complete reference focus chain above. The regression checks whether plain Enter then activates the destructive action. The correction moves `autoFocus` to Cancel without replacing the existing wrapper or changing any handlers, labels, shortcuts, or action ordering.

## Behavioral regression

Two cases extend the existing `tests/e2e/quit.e2e.mjs` suite. They open the actual app's Quit confirmation through `Meta+q` on synthetic demo state, then check:

1. Cancel receives initial focus.
2. Plain Enter dismisses the confirmation without emitting a quit event.

The suite runs in a disposable browser context. Outside Tauri, the backend's quit path emits `openconductor:quit`; the existing test counts that browser event. It does not quit a desktop app, stop agents, or touch a real workspace. Existing tests still cover immediate quit without running agents and explicit `Meta+Enter` confirmation while demo agents run.

Discovery is established from source: `.github/workflows/keybindings.yml` builds the frontend and runs `npm run test:e2e`; `package.json` expands that command to `node --test tests/e2e/*.e2e.mjs`, which includes this existing file. No workflow, server, fixture infrastructure, or test-discovery edit is needed.

- Hosted before-fix result: reproduced on regression head `e1e2a14b115debdb5542cf9de5ccf92508f7fd7b` in [Keybindings run 42779294007, job 129705178786](https://github.com/reason-machines/openconductor/actions/runs/42779294007/job/129705178786). Both new cases failed at their intended behavioral assertions. Cancel was not the active element (`false`, expected `true`); plain Enter emitted one quit event (expected zero). The existing immediate-quit and explicit `Meta+Enter` cases passed. Overall browser suite: 185 tests, 182 passed, two failed, one skipped.
- Hosted corrected result: pending automatic CI after the autofocus-only production fix. Both regression assertions and the existing Quit tests remain unchanged; a pending run is not a pass.
- Diff hygiene: recorded separately when the checkpoint is committed.
- Local Node, builds, dependency installation, browser, native execution, screenshots, and real persistence: not run under the existing resource hold. The unchanged workflow does not retain screenshots of this case, so there is no new visual evidence.
- Focus containment, return focus, outside-pointer parity, installed-build behavior, and native physical keys remain unverified by these cases. The separate #870 mounted-remount and real-store acceptance gaps stay open.
