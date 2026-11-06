# Resize reflow: chat column, composer and right panel

Sven's report (`oc-resize-reflow.png`, native app on his Mac): when the window is resized, the message list and the composer are not on one centred column (the composer sat in a narrower block on the left), and the right panel did not keep Conductor's proportions.

## Conductor (REA)

Captured with REA `capture-browser-scenario` on Conductor 0.87.6's extracted frontend (tools/screens harness, `workspace-chat` state) at 900, 1280, 1600 and 2100 px, then measured in Chromium (`tools/align/reflow_ref.mjs`, [`conductor-geometry.json`](conductor-geometry.json)). From the decoded `renderApp-D_fmY7hW.js`:

- The workspace is a horizontal resizable panel group: `main-content` (`defaultSize "70"`, `minSize "30"`) and `right-panel` (`defaultSize "35"`, `minSize "30"`). The layout normalises to 2:1, so the right panel is a third of the space right of the sidebar at every width (214 / 341 / 448 / 614 px at the four widths). There is no media-query breakpoint that collapses it; it only hides with the toggle (⌥⌘B).
- The sidebar (`aside`, `width: var(--sidebar-width)`, `max-w-[40%]`) stays 256 px at all four widths.
- Turns are `max-w-4xl mx-auto` (896 px) and fill the chat column below that. The composer is `max-w-4xl mx-auto` inside 16 px side padding: chat width − 32 up to 896, centred on the same line as the turns.

## Before (main 0b89bf8)

- Right panel `minmax(300px, 1fr)` against chat `minmax(360px, 1.25fr)`: 300 / 455 / 597 / 820 px, so it grew past Conductor's third and at 900 px forced the right panel's tab row and Run row past the window edge.
- The chat composer also carries the diff review composer's `oc-composer` class, so `diff.css` capped it at 720 px: at 2100 px the turns were 896 px wide and the composer 720 px, left-aligned with them, not centred.

## After

| Width | Chat | Right panel | Turn | Composer | Checks |
|---:|---:|---:|---:|---:|---|
| 900 | 429.3 | 214.7 | 428.3 | 396.3 | pass |
| 1280 | 682.7 | 341.3 | 681.7 | 649.7 | pass |
| 1600 | 896 | 448 | 895 | 863 | pass |
| 2100 | 1229.3 | 614.7 | 896 | 896 | pass |

Conductor at the same widths: chat 428.7 / 682 / 895.3 / 1228.7, right panel 214.3 / 341 / 447.7 / 614.3, composer 396.7 / 650 / 863.3 / 896.

`tools/align/reflow_ours.mjs` checks, per width: no element wider than the window outside a scroll container, right panel = a third of the space right of the sidebar, turns = min(chat, 896), composer = min(chat − 32, 896), and both centred in the chat. It exits non-zero on a failure ([`before-geometry.json`](before-geometry.json), [`after-geometry.json`](after-geometry.json)).

## Changes

- `.ws-split`: `minmax(0, 2fr) minmax(0, 1fr)`, Conductor's 70:35 panels.
- `diff.css`: the review composer rule is `.oc-composer:not(.composer)`, so it no longer caps the chat composer.
- Right panel: the tab row scrolls sideways inside the panel (no spill past the window); the Run/Setup row wraps its controls under the command when narrow.

## Images

`reflow-<width>.jpg`: Conductor (REA) above, OpenConductor before in the middle, after below.

## Not checked

- Measured in Chromium against the Vite build, not in the native WebKit app.
- Conductor's panels are user-resizable with a drag handle; OpenConductor keeps the fixed 2:1 split (no drag handle) in this change.
- The header height is a separate PR.
