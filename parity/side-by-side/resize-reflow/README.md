# Resize reflow in the built macOS app (900, 1280, 1600, 2100 px)

Sven's report (`~/oc-native-refs/oc-resize-reflow.png`): on resize the message list and the composer did not
line up on one centred column, and the right panel did not keep Conductor's proportion. #584 fixed the layout
and checked it in Chromium against the Vite build ([tools/align/reflow_ours.mjs](../../../tools/align/reflow_ours.mjs),
evidence in [../reflow](../reflow)). This folder is the same check run **inside the built OpenConductor.app
on macOS** (WKWebView), at each width, plus the one thing it still caught on main.

## What Conductor does

From Conductor 0.87.6's own frontend (`MacOS/conductor` sha256 `0ba55751…1d`, embedded assets extracted with
[tools/extract_tauri_assets.py](../../../tools/extract_tauri_assets.py)), decoded `renderApp-D_fmY7hW.js` /
`renderApp-BYEcFwvt.css` and REA `capture-browser-scenario` renders at each width (top rows in the images):

- Sidebar 256 px at every width (`max-w-[40%]`); workspace panels `main-content` 70 / `right-panel` 35
  (react-resizable-panels, so 2:1). No window-width breakpoint collapses either panel; only ⌥⌘B / ⌘. hide them.
  The `min-[532px]` … `min-[2032px]` and `min-[900px]` media rules in the CSS belong to other components, not the
  workspace panels.
- Turns `pb-3 max-w-4xl mx-auto @max-4xl:pr-4`; composer `px-4 pt-2 pb-4` > `max-w-4xl mx-auto relative`.
- Buttons (`REe` base class): `inline-flex … whitespace-nowrap`, so "Add run script" never wraps.

Measured in that render: at 900 px chat 429 / right panel 214 / composer 397; at 2100 px chat 1229 / right
614 / turn and composer both x = 422, 896 wide.

## The check

[tools/side-by-side/resize-reflow-mac.sh](../../../tools/side-by-side/resize-reflow-mac.sh) starts the debug
bundle on a throwaway `HOME` per width with `OC_E2E_SIZE=<w>x900` (the debug-only seam in
`src-tauri/src/e2e.rs`). [resize-reflow-driver.js](../../../tools/side-by-side/resize-reflow-driver.js) adds a
fixture repo through the app's own IPC, stores Conductor's "lisbon" turn three times as the workspace chat
([resize-reflow-rows.mjs](../../../tools/side-by-side/resize-reflow-rows.mjs)), reloads, measures, and fails on:
sidebar ≠ 256; right panel ≠ a third of the rest or not ending at the window edge; a turn ≠ min(896, column)
or off-centre; composer ≠ min(896, column − 32) or off-centre; anything drawn past the window edge outside a
scroll/clip box; "Add run script" on more than one line.

```bash
node tools/side-by-side/resize-reflow-rows.mjs __CHAT__ > /tmp/rows.json
scripts/package-macos.sh --identity -
tools/side-by-side/resize-reflow-mac.sh src-tauri/target/debug/bundle/macos/OpenConductor.app /tmp/reflow /tmp/rows.json
```

## Results (Sven's Mac, debug bundles, ad-hoc signed)

| Build | 900 | 1280 | 1600 | 2100 |
|---|---|---|---|---|
| 0b89bf8 (before #584, Sven's report) | fail: right panel 300 wide, ends at 916 | fail: panel 455 | fail: panel 597 | fail: panel 820, composer 720 wide at x 320 under 896-wide turns |
| main b3615ed (after #584) | fail: "Add run script" on 2 lines | ok | ok | ok |
| this PR | ok | ok | ok | ok |

Raw measurements: [native-geometry.json](native-geometry.json).

## Images

Window captures come from Reason's computer tool on the Mac, which scales windows wider than 1280 px down to
1280 wide (1600 and 2100 rows); the measurements above are from the app at its real size (`innerWidth` 1600 /
2100, `devicePixelRatio` 1). The Conductor rows are harness renders of its extracted frontend, not native
captures: the native Conductor window was left alone (it had live agent sessions), and this shell has no Screen
Recording grant, so REA `observe-native-ui` refuses it.

- [resize-reflow-900-change.jpg](resize-reflow-900-change.jpg): Conductor | main | this PR at 900 px
- [resize-reflow-900.jpg](resize-reflow-900.jpg), [resize-reflow-1280.jpg](resize-reflow-1280.jpg),
  [resize-reflow-1600.jpg](resize-reflow-1600.jpg), [resize-reflow-2100.jpg](resize-reflow-2100.jpg):
  Conductor, OpenConductor before #584, this PR
