# Browse starts from the current folder

Conductor Rebuild, 2026-11-07. This fixes Create project's Parent folder Browse and Clone GitHub repo's Location Browse. Both previously opened the native picker without supplying the displayed folder. They now pass it as `defaultPath`. Other `pickFolder` callers retain the optional default.

## Reference

Read-only decoded Conductor 0.87.6 frontend from the real app on Sven's Mac. The retained `renderApp-D_fmY7hW.js` was rehashed on cloud as `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching [the original extraction record](../NOTES.md).

- `gbi`, beginning around character 2,108,600, calls `fI({directory: true, multiple: false, title: "Choose where to create the project", defaultPath: d})`. `d` is its current Parent folder state.
- `los`, around character 1,963,455, calls the same dialog with title `Choose where to clone the repository` and `defaultPath: o`. `o` is its current Location state.

This is static evidence from the real extracted app, not a native picker observation. Existing REA application analysis and extraction provenance are linked from the original dialog record.

## Regression

The real components and the real Tauri dialog JavaScript plugin run in isolated Chromium. Only the IPC boundary is intercepted. The fixture records `plugin:dialog|open` options and returns either null or an invented selected path. It never opens a native picker, filesystem, account, or real workspace.

`DIALOGS_URL=http://localhost:4392 node --test tests/e2e/dialog-picker.e2e.mjs`

- Before: **0/6 passed**. Every failure shows missing `defaultPath`, for initial and edited paths in both dialogs.
- After: **6/6 passed**. Loaded path, edited path with spaces, Cancel preservation, and selection update are exercised for both dialogs. TAP files are retained here.
- `npm run typecheck`: passed.
- `npm run lint:colors`: passed.
- `node --test src/state/cloneDialog.test.ts src/state/createProject.test.ts src/state/workspaceRename.test.ts`: **19/19 passed**.
- `git diff --check`: passed.
- Full build and full test suite: not rerun on the saturated shared cloud machine; repository CI remains required.

The test starts its own ephemeral Vite server in CI when `DIALOGS_URL` is absent. Local proof used the supported preview server on port 4392.

## Browser evidence and limits

`captures.json` retains successful OpenConductor REA IDs, screenshot hashes, and intercepted request options. Both actual components requested `/Users/demo/Code/with spaces`. The viewed screenshots show the app fields after Browse returned Cancel, not the native picker. No visual layout change is claimed.

Fresh reference picker captures were rejected because the extracted browser harness rendered duplicate matching dialog inputs, even with visible/title scoping. Rejected REA IDs are retained in `reference-gaps.json`; none is promoted to parity evidence. The static source above, not those rejected captures, establishes the reference contract.

Independent archive investigation reached the actual reference Restore to new branch dialog using an archived synthetic row and a deleted-branch shell response. Cancel remained focused and left the row archived. No restore defect was demonstrated. This does not prove native archive/restore filesystem behavior.

Native macOS picker starting location, Cancel/selection behavior in WebKit, and final side-by-side parity remain **NOT RUN**. Only the exclusive native driver may fill those gaps on fresh isolated QA data.
