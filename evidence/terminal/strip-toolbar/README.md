# Terminal strip toolbar parity

Conductor Rebuild, terminal/scripts lane. Compared with refreshed main `e1687ee85a989d91a40f48932267d08b1a513a7f`.

## Retained reference

The real Conductor 0.87.6 renderer was decoded in the earlier authorized REA investigation. No new extraction or app launch was made for this change.

- Bundle: `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Provenance: [historical-chip extraction receipt](../../diff/historical-chip/extraction.json), with retained partial REA analysis `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
- Artifact owner [de6c02f4](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753) freshly reverified the existing retained bundle on Reason Cloud and returned the complete `nro` function as three bounded, inert text parts. [reference-nro.txt](reference-nro.txt) concatenates those source fields without executing them.
- `nro` occupies zero-based, half-open UTF-8 bytes `[7170202,7199367)`, 29,165 bytes, SHA-256 `906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123`. The concatenated copy passed that hash check.

The complete strip return contains the show/hide chevron, Setup, Run, terminal tabs through `ero`, New terminal, and run/open/focus actions. It has no Clear scrollback action. The retained complete `W9i` tab wrapper provides label/status and Close terminal, not a clear action. This is a bounded statement about this strip, not every possible Conductor menu or surface.

The earlier REA browser capture [reference-single](../tabs/reference-single.png), `ev_647c87bd0aadb878362a1bd445f153ab71055fcbf1756fca248495669426dace`, corroborates the strip with an active terminal and no eraser. Its identity and scenario are in [the capture manifest](../tabs/all-captures.json). Both that image and the historical [OpenConductor image](../tabs/openconductor-single.png) were inspected this turn. They are historical synthetic-IPC Chromium captures, not screenshots of this change or native acceptance.

## Correction

Remove only the extra Clear terminal scrollback button and its unused imports from `PanelStrip`. The underlying `clearTab`, Cmd-K dispatch, backend screen clearing, saving, selection and focus code are unchanged.

The existing terminal-label browser case now asserts that the extra button is absent. The restoration test focuses the terminal and presses Cmd-K instead of clicking the removed button; its existing backend mirror-write and saved-history assertions are unchanged.

Laziness Protocol kept this a deletion rather than a new action model. Test Behavior, Not Implementation put the regression in the existing rendered toolbar and persistence cases, not a new source-text unit test.

## Verification

- Failed before, passed after: a focused source assertion checks whether `PanelStrip` declares a button with accessible name `Clear terminal scrollback`. This is source evidence only, not a rendered test. The decisive failure and pass are retained in [source-check.txt](source-check.txt).
- Passed: `node --test src/features/terminal/*.test.ts src/scripts/*.test.ts`, all 85 tests, including Cmd-K resolution, panel/center isolation, tab lifecycle, restoration helpers and scripts models. See [unit.tap](unit.tap).
- Passed: `node --check tests/e2e/script-output.e2e.mjs` and `node --check tests/e2e/terminal-restore.e2e.mjs`.
- Passed: `git diff --check`.
- Not run locally: the changed browser regressions, TypeScript/build, native/macOS, real PTY or installed-package acceptance. This lane has no runtime/build/native admission and the recreated checkout has no React/TypeScript dependencies. No dependency install, server, browser, capture, Mac action, provisioning or workflow dispatch was started. The ready PR's normal workflows provide exact-head CI follow-through; their results must be reported separately.

## Separate unresolved evidence

The retained renderer's complete `zno`, `Zwa` and `tCt` functions establish a failed-start indicator and conditional Retry UI. They do not establish the store/controller's failed-spawn tab retention or same-tab retry behavior. The retained index bundle was absent in both this checkout and the consulted renderer cache. No failed-spawn lifecycle code was changed on that incomplete evidence. The missing observation is the relevant index controller's catch/restart branch, or an observation by the sole admitted native owner on the approved isolated destination.
