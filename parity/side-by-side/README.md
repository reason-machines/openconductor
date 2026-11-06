# Side-by-side: real Conductor (left) and OpenConductor (right)

Same window size (1440x900, scale 1, dark theme), same invented data (tide-web / lisbon, `src/lib/auth.ts` and `src/lib/auth.test.ts` changed, no run script).

| Image | What it compares |
|---|---|
| [right-panel-changes-run--window.png](right-panel-changes-run--window.png) | Whole window: Changes tab selected, Run selected in the strip with its empty state |
| [right-panel-changes-run--panel-2x.png](right-panel-changes-run--panel-2x.png) | Each app's right panel, from its own left edge, at 2x |
| [right-panel-all-files--openconductor-only.png](right-panel-all-files--openconductor-only.png) | OpenConductor only: All files with two folders open, hover on a row |
| [right-panel-terminal--openconductor-only.png](right-panel-terminal--openconductor-only.png) | OpenConductor only: a terminal tab in the strip |

**Conductor side:** [evidence/screens/chat--transcript-collapsed-tools--dark.png](../../evidence/screens/chat--transcript-collapsed-tools--dark.png), an REA `capture-browser-scenario` capture of Conductor 0.87.6's own frontend (see evidence/screens/README.md for the harness and its known differences from the native window). There is no Conductor capture of the All files tab, the Setup tab or a terminal tab, so those states have no left-hand image; `~/oc-native-refs/` (native window captures) was not present on the machine that made these.

**OpenConductor side:** the built frontend (`dist/`) in Chromium on a fake Tauri backend, [tools/side-by-side/right-panel.mjs](../../tools/side-by-side/right-panel.mjs); composed with [tools/side-by-side/compose.py](../../tools/side-by-side/compose.py).

Remaining differences visible in the Changes image, outside this change: Conductor puts the PR status bar ("Couldn't load PR info") above the tabs and the Changes tab's own icons (search, tree, more) in the tab row; OpenConductor's Changes list keeps its All changes / Uncommitted / Refresh toolbar under the tabs. Conductor's chat column is wider, so its panel is narrower at this window size.
