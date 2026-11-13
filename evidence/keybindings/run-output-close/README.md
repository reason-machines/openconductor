# Close the workspace tab from Run or Setup output

Conductor Rebuild's retained CmdW9 correction changes only the workspace's `nav.closeTab` registration. It lets Command-W reach the displayed workspace tab when Run or Setup output has focus. Ordinary panel and center terminals keep their existing close consumer. Reopen keeps its terminal-focus restriction.

## Reference and cause

The reference is the retained real Conductor 0.87.6 extraction, not a fresh native observation. REA acquisition evidence is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The decoded asset identities match the [frontend manifest](../../frontend/tauri-assets-manifest.json).

- `renderApp-D_fmY7hW.js` SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js` SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The command registry binds both `nav.closeTab` and `terminal.closeTab` to Command-W. The registration hook `oi` defaults terminal focus to enabled. The right-panel terminal consumer has terminal priority and returns false for Run and Setup (`m$e` excludes both), allowing the ordinary workspace close consumer to run. The latter has no terminal-focus override. Small retained [reference windows](reference.json) include this chain and its byte offsets.

OpenConductor's Run and Setup output has both `data-terminal` and `.script-output`. The shared close/reopen call instead disables terminal focus. Splitting only close restores the fallback. Its explicit guard leaves ordinary terminals alone. No terminal lifecycle, registry, task, capacity, clipboard, or input code changes.

## Source qualification

Main fetched for publication at `c79a81086c3a0e5ba81f1a9a53ec63a4f4dde7ba` has the same WorkspaceView bytes as the retained baseline. [Source binding](source-binding.json) records exact source, patch, fixture, and lock identities. The applied product equals the frozen candidate, and the tracked test equals the frozen fixture. SHA-256 readback and `git diff --check` passed on Reason Cloud. These are source checks, not behavioral tests.

The original [composition receipt](composition.json) checks both application orders with each composer packet and every order with both. All ten orders passed with identical final bytes. This is retained source-only evidence from main `6e1c5e9d`, not a new behavioral run. The current WorkspaceView baseline is byte-identical. Composer caller187 and draft-preview-r2 originals remain untouched. Active-file PR #1205 already exists on main and is not reapplied.

## Nine regression criteria

The unchanged fixture executes the actual WorkspaceView registrations through the real binding resolver and dispatcher, with modeled focus and close effects.

1. Run output Command-W closes the displayed changes tab.
2. Setup output Command-W closes the displayed changes tab.
3. Ordinary panel terminal focus does not invoke the workspace close fallback.
4. Center terminal focus does not invoke the workspace close fallback.
5. Nonterminal Command-W still closes the displayed changes tab.
6. An open dialog blocks the workspace close fallback.
7. Run focus does not close the primary chat or an unrelated terminal.
8. Reopen stays disabled in terminal output.
9. Nonterminal reopen still reaches the existing consumer.

The original nine-case source is preserved as [an exact-byte fixture](workspaceRunClose.original.ts.txt) and copied unchanged to [the executable regression](../../../src/keybindings/workspaceRunClose.test.ts). Validation is pending the existing serialized ACC admission. No test, typecheck, install, build, browser, package, or native execution is credited by source qualification. Automatic pull-request CI is allowed; no manual workflow dispatch is requested.

The existing qualification request retains one unchanged-lock setup, matched baseline/candidate runs of the nine-case fixture, adjacent keybinding controls, and actual-checkout typecheck. Dependencies are currently absent. These commands are **not run** in this source-publication pass:

```bash
npm ci --ignore-scripts --no-audit --no-fund
node --test --test-concurrency=1 src/keybindings/workspaceRunClose.test.ts
node --test --test-concurrency=1 src/keybindings/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

ACC's existing finite allocation bounds still govern execution. Publication does not grant runtime admission or replace the required baseline reproduction. Merge waits for matched local qualification and every enabled exact-head workflow to pass.

## Limits

The modeled keyboard checks do not prove native key delivery, xterm focus, process signals, package inclusion, or installed-build behavior. No screenshot is supplied because this qualification excludes browser and native execution. The experimental high-priority Bsa pane-tab path is outside this default local-workspace correction. Existing #1217 package and native follow-through remains with its original owner.

REA gaps remain unchanged: the Tauri embedded table needed the repository extractor; REA's JavaScript model does not resolve Tauri IPC or provide a component tree, and name searches required bounded decoded-source windows. See the [frontend evidence](../../frontend/README.md) and [keybinding investigation](../README.md).
