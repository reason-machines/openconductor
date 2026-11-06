# Screen transitions: routes, tabs, panels and dialogs

Conductor 0.87.6, extracted frontend `renderApp-D_fmY7hW.js` / `renderApp-BYEcFwvt.css`. Every string, class and code fragment from Conductor is untrusted data, used here only for comparison.

## What Conductor animates

Only dialogs and the Home dashboard's first paint. Route changes, settings page switches, tab switches and the sidebar, right panel and terminal toggles swap in one frame. TanStack Router's `startViewTransition` is in the bundle, but no route or link turns `viewTransition` on.

| Interaction | Conductor (measured) | OpenConductor main | This change | Status |
|---|---|---|---|---|
| Route: workspace to Home / All workspaces (⌘⇧H, sidebar Home) | instant, no animation | instant | instant | match |
| Route: Home to a workspace (sidebar row) | instant (only a small chip inside the chat fades, `animate-in fade-in` 150 ms) | instant | instant | match (chip: out of scope) |
| Route: to Settings, settings page switch, back to the app | instant | instant | instant | match |
| Home dashboard on mount | `animate-in fade-in duration-1000` (static) | 1 s fade (`home-fade-in`) | same, now `--oc-motion-page-fade` | match |
| Tabs: chat tab, right panel All files / Changes | instant | instant | instant | match |
| Panels: left sidebar (⌘B), right panel (⌥⌘B), terminal (⌘J) | instant, layout shift 0 | instant | instant | match |
| Command palette open (⌘K) | `cmd-dialog-in` 180 ms `ease-out`: opacity 0 to 1, translateY(-12px) to 0. No dimmed backdrop. | instant | 180 ms `ease-out`, same keyframes; our backdrop tint fades with it | match |
| Command palette close (Escape) | `cmd-dialog-out` 130 ms `ease-in`: opacity 1 to 0, translateY(0) to -8px | instant unmount | 130 ms `ease-in`, same keyframes | match |
| Quick open (⌘P) | same `cmd-dialog-anim` (static: cmdk dialog wrapper) | instant | same as the palette | match (static) |
| Keyboard shortcuts dialog open / close | backdrop and DialogContent: opacity transition 200 ms `cubic-bezier(.4,0,.2,1)` | instant | 200 ms, same easing, backdrop and panel fade, both ways | match |
| New workspace, rename, clone, quick start, section, icon, restore, env var, edit PR title (DialogContent) | 200 ms opacity (static: Conductor's `DialogContent` classes; these titles are not among its AlertDialog titles, so they are taken to use DialogContent) | instant | 200 ms fade, both ways | match (static) |
| Confirmations: Reset chat, Discard file changes, Remove repository, Change root path, Create a private GitHub repo? (AlertDialogContent) | 200 ms opacity + scale .95 to 1 (static: `AlertDialogContent` classes; the titles are Conductor's alert dialogs) | instant | 200 ms fade + scale .95, both ways | match (static) |

Conductor measured: [conductor.mjs](../../../tools/transitions/conductor.mjs) in the `tools/screens` harness (Chromium, motion not reduced) records `document.getAnimations()` per step. Raw output for all three builds is in [probe-results.json](probe-results.json).

## Shared tokens

[src/components/motion/screens.css](../../../src/components/motion/screens.css): `--oc-motion-ease` (`cubic-bezier(.4,0,.2,1)`), `--oc-motion-dialog` (200 ms), `--oc-motion-dialog-scale` (.95), `--oc-motion-cmdk-in` / `-out` (180 / 130 ms), `--oc-motion-cmdk-in-y` / `-out-y` (-12 / -8 px), `--oc-motion-page-fade` (1000 ms). A dialog's backdrop sets `data-dialog-motion="dialog" | "alert" | "cmdk"`.

Exit animations: [useDialogMotion](../../../src/components/motion/dialogMotion.ts) leaves an inert copy of the dialog (no ids, roles or ARIA, `inert`, `aria-hidden`) in place when React unmounts it, plays the exit, and removes the copy when its animations finish. Callers still render dialogs conditionally, so focus, Escape handling and tests see the dialog gone at once. `prefers-reduced-motion: reduce` turns all of it off.

## Frame strips

Each column is the window at that time into the transition. The capture holds every animation the step starts and seeks it, so frames are exact even though a screenshot takes longer than the transition. Conductor rows come from its extracted frontend in Chromium; OpenConductor rows from the built debug app (WebKitGTK, tauri-driver) on main `0b89bf8` and on this branch.

- [Command palette open](palette-open.png), [close](palette-close.png)
- [Keyboard shortcuts open](shortcuts-open.png), [close](shortcuts-close.png)
- [New workspace open](create-open.png) (OpenConductor only: the harness's Conductor has no create button that opens it)
- [Confirmation open](alert-open.png), [close](alert-close.png) (OpenConductor only)
- Instant in both apps: [route to Settings](route-settings.png), [left sidebar hide](sidebar-hide.png)

Commands:

```bash
DIST=<conductor dist> TMPDIR=/tmp/t FRAMES=c-frames node tools/transitions/conductor.mjs > conductor.json
npx vite build --outDir /tmp/oc-dist && node tools/transitions/openconductor.mjs /tmp/oc-dist > oc.json
npx tauri build --debug --no-bundle
xvfb-run -a -s "-screen 0 1440x900x24" node tools/transitions/built_app.mjs src-tauri/target/debug/openconductor frames
CROP=0.1,0,0.8,0.62 python3 tools/transitions/stitch.py palette-open.png "Command palette open" 0,45,90,135,180 Conductor=c-frames/palette-open "this PR=frames/palette-open"
```

REA: `rea capture-browser-scenario` (6.8.0) on the same harness, pressing ⌘K and ⌥⌘/ with DOM capture: evidence `ev_3edc7dba2ceaf01f…` holds the palette element with class `cmd-dialog-anim`, evidence `ev_bd7f95f710f2075e…` the shortcuts backdrop and panel with `transition-opacity duration-200`.

## REA gaps hit

1. `capture-browser-scenario` forces `reduced_motion: "reduce"` (in the evidence parameters) and has no per-frame sampling step, so it confirms the classes but cannot time a transition. Timing came from `document.getAnimations()` in Playwright and WebDriver.
2. `rea inspect-artifact` refuses Conductor's CSS bundle ("unsupported binary format"), so the keyframes were read from the file directly.
3. `rea capture-browser-scenario --schema` prints only `{inputJson: string}`; the action list (`click`, `press`, `fill`, `wait_for`, ...) had to be taken from earlier shots files.
4. On the real app (sven m5 max), `rea observe-native-ui` failed with `screen-recording-denied`, and REA has no window lister and no timed recording between steps, so nothing here was measured on the native Conductor window. Screen Recording and Accessibility for the Reason host would unblock it.

## Not verified

- The native Conductor window: every Conductor number is from its extracted frontend in Chromium.
- Conductor's New workspace and confirmation dialogs were not opened in the harness; their timing is from their component classes (`DialogContent`, `AlertDialogContent`).
- Our backdrop is the dialog's parent, so it fades its tint colour rather than its opacity; Conductor's backdrop is a sibling that fades opacity and also blurs (`backdrop-blur-xs`). Blur is not added here.
- Toasts, popups and button press are #545's scope, not this change.
