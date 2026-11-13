# Terminal lifecycle indicators

Conductor Rebuild, terminal/scripts lane. Main integrated at `97c34f69` before this increment.

## Reference

This uses the unchanged Conductor 0.87.6 frontend extracted from the real `/Applications/Conductor.app` during the prior REA investigation, not a new native launch. The retained `renderApp-D_fmY7hW.js` SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

`zno` at character 6,905,571 maps `launching` to a muted working indicator labeled `Starting`, running to no indicator, and exited to a muted circle labeled `Exited` or `Exited (code N)`. `Uno` renders the circle or working indicator at 10 px. `W9i` uses this through `v9i` in the right terminal strip. The source also has restored and spawn-error states, which this increment does not add to OpenConductor's existing tab state model.

The prior REA `capture-browser-scenario` run drove that retained frontend through its visible repository, workspace and New terminal controls. The reference fixture emits schema-valid `pty.ready`, `pty.data` and `pty.exit` events; the app renders its own exit indicator. The exited capture corroborates the muted marker. Scenarios, hashes and Evidence IDs are in [captures.json](captures.json).

## Change

Normal exits now show a muted 10 px circle instead of a red 6 px dot, with an exit-code tooltip and accessible name. Starting uses the existing three-dot working-animation pattern instead of an unlabeled dot. Running still has no indicator. Tab IDs, shell lifecycle, persistence, working directory and backend code are unchanged.

## Historical verification for terminal tab indicators

- **Failed before:** the new browser case timed out looking for the `Starting` indicator. See [before.tap](before.tap).
- **Passed:** `npm run build`, including TypeScript.
- **Passed:** `node --test src/features/terminal/*.test.ts src/scripts/*.test.ts`, 81 tests.
- **Passed:** `E2E_BASE=http://localhost:4404 node --test tests/e2e/script-output.e2e.mjs tests/e2e/terminal-restore.e2e.mjs tests/e2e/terminal-shell-integration.e2e.mjs`, 10 cases, inside the supported preview process. The new case covers starting, ready without an indicator, and muted exits with codes 0 and 7. See [after.tap](after.tap).
- **Passed:** `npm run lint:colors`, `git diff --check`, and `node --check tools/terminal/lifecycle-capture.mjs`.
- **Partial:** four historical REA browser captures. The exited state is corroborated on both apps. Reinspection of [reference-starting.png](reference-starting.png) shows a selected terminal tab and a blank body. Neither `Starting terminal…` nor the starting glyph is visible. This synthetic capture does not prove that the reference renders its startup body under the source predicate, or that the native app lacks it. The retained static source supports the conditional startup message, not its execution. See the [local startup-body source preparation](../starting-body/README.md).

Prove It Works required the failing-before browser test and current rendered capture. Laziness Protocol kept the product correction in the existing strip and CSS, without expanding the terminal state model.

## Limits and REA gaps

These captures use synthetic IPC, matching Stone dark palettes and different workspace fixtures. They are not native PTY or package verification, default-palette parity, full strip geometry, or light-theme proof. The reference terminal title is clipped at its current narrow width; the extra Clear scrollback control, Setup status and spacing differences remain visible.

The first capture attempt lost its lifecycle query during reference navigation. The fixture now retains that query at initialization. The next attempt exposed incomplete PTY event payloads in the existing capture fixture: the reference requires a `type` discriminator, and exit `signal` is optional, not nullable. Those events were corrected and exited captures rerun. No invalid capture is retained as final proof. The semantic REA graph does not join these minified React and transport aliases; focused original-bundle reads supply those links.

Native same-build terminal indicators, full visual parity and selected-worktree cwd remain not run. They require the coordinator's exclusive isolation and runtime driver. This Session made no Mac launch, input, real-data or credential changes.
