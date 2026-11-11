# Script output parity

Owner: Conductor Rebuild, terminal/scripts area, PR #719.

## Reference and boundary

The reference is Conductor 0.87.6 from `/Applications/Conductor.app` on Sven's authorized `sven m5 max`. This pass read the extracted frontend on that Mac and transferred the existing archive with verified exact bytes. Extracted third-party code stays outside Git and is treated only as data.

- `renderApp-D_fmY7hW.js` SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Existing frontend extraction and REA analysis are documented in [run-scripts S4](../../run-scripts/NOTES.md) and [terminal evidence](../NOTES.md).
- Fresh source reads used character search and calculated byte offsets, not approximate offsets copied from earlier notes.

The reference renderer is unmodified. `tools/terminal/output-reference.js` provides an invented working directory and a synthetic PTY stream through the mocked Tauri boundary. It deliberately leaves the stream running, so the screenshot proves the running-output view, not process exit or successful native setup. No real repository, workspace, shell, token or agent is used.

## Source findings

- `gno`, renderApp byte 6,926,664, renders Setup output in a full-size rounded container with 16 px padding. It configures `disableStdin: true` and `showCursor: false`, and writes persisted output through the terminal runtime.
- `w9e`, renderApp character 6,876,089, reads the terminal font settings (12 px default) and scrollback settings. It updates the terminal theme when the document theme changes.
- `OJs`, renderApp byte 6,571,868, hosts Run output in the same padded terminal surface family.
- `IJe`, near renderApp byte 3,139,000, builds a terminal theme with all 16 ANSI color tokens. Exact light/dark values were read from `renderApp-BYEcFwvt.css`.

These are static observations. Runtime screenshots corroborate the running Setup output, including ANSI green/blue and carriage-return overwrite. They do not establish every Run/Spotlight or native lifecycle behavior.

## Change

`ScriptOutput` replaces the plain `<pre>` plus ANSI stripping in Setup, Run and Spotlight. It is a local, read-only xterm view over the existing output string. It does not spawn a shell or add any IPC. Append-only snapshots write just the suffix; a cleared/replaced snapshot resets the screen. Existing settings supply terminal font and scrollback; resize observation refits the screen, including after a collapsed panel opens again.

Foundational Thinking kept the data shape to one existing output snapshot and a pure `outputUpdate` function. Type System Discipline kept the component and xterm options typed; no new external wire format was introduced.

## Verification scope

The pre-change browser capture visibly showed `Progress 10%Progress 100%` in one monochrome line. The changed browser view shows only `Progress 100%`, plus green `Dependencies installed` and blue `Ready on localhost:55000`.

- `npm run build`: passed, including TypeScript.
- `node --test src/scripts/*.test.ts`: passed, 20 tests.
- `npm run lint:colors`: passed.
- `git diff --check`: passed.
- `E2E_BASE=http://127.0.0.1:4398 node --test tests/e2e/script-output.e2e.mjs`, run inside the supported preview process: passed, 2 tests. They cover Setup and Run ANSI output, erase-line/carriage-return updates, live append, tab changes, resize, rerun reset, and absence of shell/PTY calls. The dedicated Terminal workflow also runs them in Chrome.
- Fresh REA captures: reference `ev_5d82f44653988ad8d489fe26fc589815e88ff0c9faf7ddd070a054e1484f170b`, OpenConductor `ev_7cfdf394c449a83e9f79ddfd829f17da21ba9a40196cf2d0c0c72b15f944d974`. See [capture manifest](captures.json).
- [Panel comparison](compare.json), crop `(939, 410, 1280, 820)` from both unmodified 1280x820 screenshots: 3.14% changed pixels at channel threshold 24; 99.997% changed pixels at threshold 0. The latter exposes the different default palettes. The tolerant comparison does not establish palette parity. The 3.14% includes strip labels/status treatment, underline, output offset and button details; no color or geometry normalization was applied.
- The local preview server was stopped after the bounded checks.
- CI follow-up: the old `.scripts-output` selector caused the localhost-open and run-toggle browser cases to time out. `E2E_BASE=http://127.0.0.1:4401 node --test tests/e2e/shortcuts-open-localhost.e2e.mjs tests/e2e/shortcuts-run-select-all.e2e.mjs` reproduced 2 failures and 2 passes against a fresh build. After selecting the rendered `Script output` region and xterm rows, the same command passed all 4 cases. Keyboard behavior, displayed output, retained stopped output, button behavior and error assertions remain checked. Both files now accept `E2E_BASE` so the bounded check can reuse a supported preview instead of opening extra servers. No product behavior changed in this follow-up; the full browser suite remains a CI check.

Native macOS execution, a packaged OpenConductor build, and real setup/run processes were not exercised in this pass. The screenshots use each app's existing palette and synthetic surrounding workspace data; these fields are not normalized or claimed to match.

## Area verdict

Output rendering has materially improved. Empty/idle Setup and Run remain covered by prior [PR #701](https://github.com/reason-machines/openconductor/pull/701). This pass does not claim the whole terminal/scripts area matches.

Known material gaps from the bounded final source review:

- The running Setup strip uses a status dot after the text instead of Conductor's working indicator before the text, and its content starts slightly lower. The screenshots retain these differences.
- Script output lacks Conductor's terminal Find UI (`gno` uses `dzt` and `b9e`). Interactive terminals already have Find; the script-output surface still needs it.
- Interactive terminal tabs differ. Reference `b9i` (character 6,905,447) uses `Terminal` for one terminal and renumbers multiple visible tabs. `zno` shows no running dot and uses a muted exited indicator. The current strip retains numbered titles, a green running dot and a red exited dot.
- The strip's extra Clear terminal scrollback button is not part of the reference `nro` tab strip. Its shortcut can remain without that button.
- Terminal-tab and script-settings interactions need a fresh native side-by-side pass; prior evidence is not proof for those states on this branch.

Port-forwarding/cloud-workspace states are intentionally outside the requested architecture. Unobservable error toasts were not pursued. Shared UI-map aggregates were left to the ledger owner.
