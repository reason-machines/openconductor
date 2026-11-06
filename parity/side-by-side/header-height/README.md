# Workspace header height

Sven's report (`oc-header-too-tall.png`, native app on his Mac): the workspace header is too tall, with the breadcrumb, chips and buttons sitting low in it.

## Conductor (REA)

From the decoded `renderApp-D_fmY7hW.js` (REA-extracted frontend of Conductor 0.87.6) and REA `capture-browser-scenario` of the `workspace-chat` state at 1280 px (measured header: top 0, height 40):

- Workspace header: `flex justify-between items-center pl-4 pr-2 py-2 h-10 bg-sidebar-background relative border-b border-border`. 40 px including its bottom border, content centred, 16 px left and 8 px right padding.
- Other workspace header variants (`v8i`, `IYo`) are also `h-10 items-center border-b`.
- With the left sidebar closed, the header's toggle wrapper carries `ml-[var(--traffic-lights-clearance)]`, so the header's content clears the traffic lights.
- Sidebar top row: `flex h-8 w-full items-center pt-2`, so its toggle sits on y = 20, the header's centre line.

## Before (main 0b89bf8)

`.ws-header` had `padding: 30px 16px 10px` (a 30 px top inset for the traffic lights), so it was 65 px tall and every control was centred on y = 42 while the sidebar's toggle was on y = 20.

## After

`.ws-header` is 40 px (`height: 40px; padding: 0 8px 0 16px; align-items: center`). Every breadcrumb part, chip and button is centred on y = 19.5, the sidebar toggle on y = 20. With the sidebar hidden the header's content starts after `--traffic-lights-clearance`.

`tools/align/header_height.mjs` checks this in both themes with the sidebar shown and hidden, and exits non-zero on failure ([`before.json`](before.json): 4/4 fail, [`after.json`](after.json): 4/4 pass).

## Images

In the pull request body: Conductor (REA), before, after, and after with the sidebar hidden (top 80 px of a 1280 px window), dark and light. `tools/align/header_height.mjs` writes the OpenConductor crops again.

## Not checked

- Measured in headless Chromium against the Vite build, not in the native WebKit window, so the real traffic-light position over the 40 px header was not seen. The macOS traffic lights sit in the sidebar column when the sidebar is open.

## Built app (added by #586)

[header-01-height-built-app-light.png](../header-01-height-built-app-light.png): the top 96 px of a 1280 x 820 window, red guide at y = 20 (sidebar toggle line), blue guide at y = 40 (Conductor's header bottom).

| Row | Source | Header bottom border | Breadcrumb / buttons centre |
|---|---|---|---|
| Conductor 0.87.6 (harness render) | `evidence/screens/chat--transcript-collapsed-tools--light.png`, REA-extracted frontend in Chromium | y = 39 (40 px) | y = 20 |
| OpenConductor before (main 0b89bf8) | built Tauri app, e2e `diff` flow, Linux WebKitGTK, run 42188152340 | y = 64 (65 px) | y = 42 |
| OpenConductor after (main b3615ed, #590) | built Tauri app, e2e `diff` flow, Linux WebKitGTK, run 42192935633 (PR #586's merge ref with main) | y = 39 (40 px) | y = 20 |

This replaces the "Not checked" gap above for the WebKit window: the 40 px header and the shared centre line hold in the built Tauri app, not only in Chromium. Still not seen: the macOS window. Screen capture on Sven's Mac was refused (`screencapture`: could not create image from window/display; Reason computer snapshot: screen capture unavailable), so the traffic lights over the header were not observed.

`~/oc-native-refs/conductor-current.png` is not a Conductor capture: its header shows an `Idle` chip and an Archive button, which Conductor 0.87.6's header does not have (`ACi` in `renderApp-D_fmY7hW.js`), so it is an older OpenConductor build. It is not used as the Conductor reference.
