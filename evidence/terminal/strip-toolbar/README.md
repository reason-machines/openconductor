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

The existing terminal-label browser case asserts that the extra button is absent. The restoration fixture now returns ordinary settings through `get_settings`, with the supported `keybinding_overrides_v1` value remapping `toggleCommandPalette` to Cmd-Shift-P. It focuses the terminal and presses Cmd-K. Its backend clear-sequence mirror-write and saved-history assertions are unchanged. This covers a configured binding, not default Cmd-K clearing.

## CI premise correction

The initial fixture change assumed terminal focus let Cmd-K reach xterm before the global palette. That premise was wrong. Keybindings CI on head `07450bbb1bbc8237d06a2c39df2b9619ad08eecd` failed in `terminal-restore.e2e.mjs` at the backend mirror/history wait after Cmd-K. The other 18 checks passed. A combined-listener source repro also reproduced palette interception on main; the old toolbar-click test was not an equivalent passing check.

The retained renderer imports index export `cV` as its local `wYe`. Its only exact `oi("toggleCommandPalette", ...)` registration supplies no call-site options. The index's actual export is `OQt as cV`, not index-local `wYe`. Complete `OQt` calls `GUt`; `GUt` spreads `V_[id]` and replaces only `key`/`additionalKeys`; `nh` supplies configured shortcuts or registry defaults. The palette registry entry is configurable and has `when:{isGlobal:true}`. Configuring a shortcut therefore preserves global eligibility. See the bounded [index and palette registration receipt](palette-cv-receipt.json), including source owners, message identities, artifact hashes and separate UTF-8/UTF-16 ranges.

The existing index owner rehashed the complete retained artifact against the manifest. This lane separately verified all five handed-off fragment hashes/range lengths and the renderer registration hash without executing any extracted chunk. The complete retained renderer `$wa` xterm handler checks the normal buffer before clear handling; it does not itself establish window-dispatch precedence. None of this is native acceptance.

The product dispatcher, palette priority, terminal handlers, `clearTab` and persistence code remain unchanged. The new source regression runs the real dispatcher and window-capture helper with the fixture's actual settings response: default Cmd-K is consumed by the palette; after the configured remap, Cmd-K reaches the terminal command resolver, Cmd-Shift-P still opens the palette, and an outside-terminal event does not resolve a terminal command. These are source checks, not proof of xterm clearing or saved history.

Test Behavior, Not Implementation kept every existing backend persistence assertion rather than loosening the timeout condition. The fix supplies the intended configuration through settings instead of bypassing palette dispatch.

## Verification

- Failed before, passed after: a focused source assertion checks whether `PanelStrip` declares a button with accessible name `Clear terminal scrollback`. This is source evidence only, not a rendered test. The decisive failure and pass are retained in [source-check.txt](source-check.txt).
- Passed: `node --test src/features/terminal/*.test.ts src/scripts/*.test.ts`, all 85 tests, including Cmd-K resolution, panel/center isolation, tab lifecycle, restoration helpers and scripts models. See [unit.tap](unit.tap).
- Passed: `node --check tests/e2e/script-output.e2e.mjs` and `node --check tests/e2e/terminal-restore.e2e.mjs`.
- Passed: `git diff --check`.
- Before correction: `node --experimental-strip-types --test src/features/terminal/capture.test.ts` passed default palette capture and failed the fixture case with `fake backend: get_settings is not mocked`. After correction, both tests passed. See [source regression before](capture-before.tap) and [after](capture-after.tap).
- Passed after correction: `node --experimental-strip-types --test src/features/terminal/*.test.ts src/scripts/*.test.ts src/keybindings/*.test.ts src/settings/keybindingOverrides.test.ts`, all 180 tests. See [correction verification](fixture-verification.txt).
- Passed after correction: both changed E2E files parse with `node --check`; `git diff --check` passes.
- Not run locally: changed browser regressions, TypeScript/build, native/macOS, real PTY or installed-package acceptance. No dependency install, server, browser, capture, Mac action, provisioning, workflow rerun or dispatch was started. The ready PR's normal workflows provide exact-head CI follow-through; results must be reported separately. The 180-test source result does not establish backend mirror clearing, saved history, browser presentation or native acceptance.

## Separate unresolved evidence

The retained renderer's complete `zno`, `Zwa` and `tCt` functions establish a failed-start indicator and conditional Retry UI. They do not establish the store/controller's failed-spawn tab retention or same-tab retry behavior. The consulted renderer cache initially lacked the matching retained index. A separate owner later supplied the palette-only bounded index receipt above; it contains no failed-spawn controller lifecycle. No failed-spawn lifecycle code was changed on that incomplete evidence. The missing observation is the relevant index controller's catch/restart branch, or an observation by the sole admitted native owner on the approved isolated destination.
