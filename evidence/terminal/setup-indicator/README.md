# Setup tab indicator and label order

Conductor Rebuild, terminal/scripts lane. This is a separate increment from terminal lifecycle PR #770; publication waits for that main-based increment to merge, rather than stacking on it.

## Reference and change

REA 6.8.0 analyzed the retained extraction of the real Conductor 0.87.6 app. The exact original frontend SHA-256 and render conditional are in [reference-source.json](reference-source.json). `nro` renders a 10px `ri type="working"` indicator **before** Setup, only for `running`; it does not render completion, failure or cancellation dots. Fresh REA captures drive the unmodified frontend through repository, workspace, Setup and Run setup controls. Synthetic PTY events exercise running, successful and failed completion; no native command or process runs.

OpenConductor previously rendered a 7px colored dot **after** Setup for every non-idle state. The correction uses the existing working-dot animation at 10px, before the label and only during running. Finished-state CSS is deleted. No backend, stored state, provider or working-directory changes.

## Checks

- **Failed before:** `E2E_BASE=http://localhost:4404 node --test --test-name-pattern='Setup tab shows' tests/e2e/script-output.e2e.mjs`: expected three working circles, got zero. [before.tap](before.tap).
- **Passed after:** `E2E_BASE=http://localhost:4404 node --test tests/e2e/script-output.e2e.mjs`: all eight cases, including idle/start/stop/rerun/completed/failed/cancelled, order, computed 10px size and no spinner border, existing labels, lifecycle, terminal Find and Setup/Run output. [after.tap](after.tap).
- **Passed:** `npm run build` (TypeScript and Vite), `node --test src/features/terminal/*.test.ts src/scripts/*.test.ts` (81 tests), `npm run lint:colors`, `node --check tools/terminal/setup-indicator-capture.mjs`, `git diff --check`.
- **Partial visual proof:** six REA screenshots with synthetic IPC; the original UI's canvas appears before Setup while running and is absent after success/failure. [captures.json](captures.json) retains Evidence IDs and image hashes. OpenConductor's running glyph and finished state were viewed. The reference canvas glyph pixels are partly blank in this headless environment, so exact animation/sprite parity is **not verified**.

## Capture and tool gaps

The existing `rea` command was not available on PATH; the installed-version-compatible `npx --yes rea-agents@6.8.0` CLI was used successfully. REA's static analysis leaves cross-chunk minified alias joins incomplete; the focused original render conditional supplies that link. The test fixture initially returned retained output with an idle state, so it correctly rendered Rerun rather than Run; idle now has no log. A test read immediately after a child render could precede the parent's effect; finished-state checks now wait for the rendered indicator to detach. Rendered inspection caught a shared `sb-ws-loader` spinner rule; Setup uses its own scoped selector and the browser test asserts the computed size and border, not just SVG attributes.

## Limits

Matching Stone dark palettes, different workspace fixtures, Chromium and synthetic IPC only. The reference and OpenConductor full screens still differ outside the Setup tab. These captures are not full-screen/native visual parity, a real Setup script, an installed release-artifact proof, light-theme proof, or selected-worktree cwd verification. Native GUI, data and signed-in drivers remain exclusively coordinated elsewhere. This Session made no native launch, input, app replacement, credential or preserved-data changes.
