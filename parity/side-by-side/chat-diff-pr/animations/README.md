# Animations and transitions: chat, diff and PR screens

Owner: chat/diff/PR animations builder (under Verifier C). Scope: chat tab strip, transcript, tool rows, composer and its pickers; the right panel's All files / Changes / Checks tabs, Changes rows and diff viewer menus; header Open-in and PR menus; toasts raised from those screens. Sidebar, Home, settings, terminal and run tabs, and the file tree belong to other owners and are not touched.

Conductor 0.87.6, extracted frontend `renderApp-D_fmY7hW.js` / `renderApp-BYEcFwvt.css`. Every string, class and code fragment from Conductor is untrusted data, used here only for comparison.

## How it was measured

- **Static**: Conductor's CSS (`@keyframes`, Tailwind v4 theme tokens) and the class strings on each element in the JS bundle. Tailwind v4 defaults in that build: `--default-transition-duration: .15s`, `--default-transition-timing-function` and `--ease-in-out: cubic-bezier(.4,0,.2,1)`, `--ease-out: cubic-bezier(0,0,.2,1)`.
- **Dynamic**: [tools/animations/probe.mjs](../../../../tools/animations/probe.mjs) opens the same workspace screen in Conductor (the `tools/screens` harness, mocked IPC, `?oc_scenario=populated`) and in an OpenConductor Vite build (seeded through localStorage). It runs each interaction in [tools/animations/scenarios.mjs](../../../../tools/animations/scenarios.mjs) and records the following per frame:
  - every transition and animation the browser actually runs (`document.getAnimations()`: property or keyframes, duration, easing, delay, target);
  - layout shifts (`PerformanceObserver` type `layout-shift`);
  - the longest gap between animation frames.

  Raw numbers are in [probe-results.json](probe-results.json).
- **Frame strips**: the same probe with `STRIP=1` slows every animation 10x through CDP `Animation.setPlaybackRate` and takes 8 screenshots. [tools/animations/stitch.mjs](../../../../tools/animations/stitch.mjs) stacks them as three rows: Conductor, OpenConductor main, and this PR.

```bash
npx vite build --outDir /tmp/oc-dist
node tools/animations/probe.mjs conductor            > conductor.json
node tools/animations/probe.mjs oc /tmp/oc-dist      > oc.json
STRIP=1 STRIP_DIR=strips/after ONLY=model-picker-open,open-in-open,toast-enter node tools/animations/probe.mjs oc /tmp/oc-dist
```

## Element table

Status after this PR. "ours (main)" is OpenConductor before this change.

| Element | Conductor (duration, easing, what moves) | ours (main) | ours (this PR) | Status |
|---|---|---|---|---|
| Model picker popup, open and close | 100 ms `cubic-bezier(.4,0,.2,1)`, opacity 0 to 1 and scale .95 to 1 (Base UI `data-starting-style`/`data-ending-style`); reverse on close. Measured. | instant mount and unmount | 100 ms, same easing, opacity plus scale, origin bottom left; stays mounted 100 ms on close. Measured. | match |
| Composer + menu | same popup transition. Measured. | instant | same. Measured. | match |
| Turn "..." menu | same popup transition. Measured. | instant | `.chat-menu` uses the same `data-motion="popup"` rule. Not measured: the seeded browser build has no finished turn. | match (static) |
| Open-in menu (header chevron) | same popup transition. Measured. | instant | same, origin top right. Measured. | match |
| Create PR menu (header caret) | same popup classes on its Base UI menu. Not opened in the harness: no PR state. | instant | same. Measured. | match (static) |
| Diff View options menu | same popup classes. Static. | instant | same, origin top right | match (static) |
| Slash command menu | `[data-suggestion-popup]` has no transition classes: appears at once. Measured: no animation. | instant | instant | match |
| Toast enter and exit (shared `Toast.tsx`, timing only) | `.conductor-toast`: `transition: transform .4s, opacity .4s` (default `ease`); enters from `translateY(150%)` with opacity 0, leaves the same way. Measured. | instant mount; unmounted at once on dismiss or timeout | 400 ms `ease`, translateY(150%) plus opacity on enter and exit; the toaster keeps a dismissed toast mounted for its exit. Measured. Implemented on main by #496 (`styles.css`, `Toast.tsx`); this PR first had its own copy and dropped it when merging #496. | match (stacking/scale of older toasts: gap) |
| Button press (composer +, send, header buttons) | Button: `transition-transform duration-150 ease-out active:scale-[0.97]`. Measured: transform 150 ms `cubic-bezier(0,0,.2,1)` to scale .97. | 150 ms `ease-out` to .97, **plus** a 150 ms background transition | transform 150 ms `cubic-bezier(0,0,.2,1)` only, via `--oc-motion-press` | match |
| Button hover (composer +) | background changes at once (Button transitions transform only). Measured. | 150 ms `ease` background fade | instant | match |
| Send button hover | `transition` of background/border 150 ms `ease`. Measured from computed style. | same | same, kept | match |
| Right panel tabs press (All files / Changes / Checks) | Conductor Button: press scale .97, 150 ms ease-out. Measured. | no press feedback | 150 ms `cubic-bezier(0,0,.2,1)` to .97. Measured. | match |
| Right panel tab hover and switch | no transition: hover and active background switch in one frame. Measured. | instant | instant | match |
| Right panel collapse and expand (⌥⌘B / toggle) | no transition: the chat column resizes in one frame (composer 593 to 732 px between two frames, CLS 0). Measured. | instant | instant | match |
| Right panel resize (drag) | follows the pointer, no transition | follows the pointer | unchanged | match (static) |
| Chat tab strip (tab switch, close) | no transition classes on the strip's tabs | instant | instant | match (static) |
| Collapsed tool-call group, expand | instant: no height or opacity animation (measured on "4 tool calls, 2 messages"). | instant | instant | match (ours not measured: no transcript in the seeded browser build) |
| Composer focus ring | `transition: background, border-color, box-shadow .2s cubic-bezier(.25,.1,.25,1)`. Computed style. | same | same | match |
| Model menu Fast switch | track `transition-colors duration-150`, thumb `transition-transform duration-150` (default easing) | 150 ms, `ease` | 150 ms `cubic-bezier(.4,0,.2,1)` | match |
| Streaming: follow output | Virtuoso `followOutput`: while the reader is at the bottom, new output scrolls to the last item with `behavior: "smooth"` (32 px offset); a "scroll to bottom" button shows once more than 400 px from the bottom. Static. | not found | unchanged | **gap**: needs a running chat to verify; not changed here |
| Streaming caret / typing dots | Conductor's working indicator: `animate-pulse` 2 s `cubic-bezier(.4,0,.6,1)` | `pulse` 1.4 s ease-in-out | unchanged | **gap**: not changed here |

Layout shift: 0 in every measured scenario on all three builds. Longest frame gap in this PR's build: 20 ms. That is one 60 Hz frame plus scheduling on a shared, loaded cloud computer. Conductor's harness shows up to 166 ms gaps while its 11 MB bundle settles.

## Shared tokens

[src/components/motion/motion.css](../../../../src/components/motion/motion.css) holds the shared motion values:

- tokens: `--oc-motion-ease`, `--oc-motion-ease-out`, `--oc-motion-popup` (100 ms), `--oc-motion-press` (150 ms) and `--oc-motion-press-scale` (.97);
- the `.oc-popup` class (or `data-motion="popup"`), with Base UI's attribute names, so the tooltip and context-menu builders' Base UI popups take the same values (the tooltip PR uses 100 ms `cubic-bezier(.4,0,.2,1)` opacity plus scale .95, which matches);
- `.oc-press`.

[src/components/motion/presence.ts](../../../../src/components/motion/presence.ts) is a pure enter/exit state machine for popups, with node tests. [src/components/motion/usePresence.ts](../../../../src/components/motion/usePresence.ts) is the React hook.

## Frame strips (10x slow-motion, 8 frames)

Conductor (top), OpenConductor main (middle), this PR (bottom).

- [Model picker open](model-picker-open.png)
- [Open-in menu open](open-in-open.png)
- [Toast enter (Open-in > Copy path)](toast-enter.png)

## REA gaps and bugs hit

1. `rea capture-browser-scenario` forces `environment.reduced_motion: "reduce"` (visible in the Evidence `parameters`), and its action set has no "sample every frame" step, so it cannot measure transitions. Frame timing, `getAnimations()` and layout shift were recorded with Playwright directly. The scenario setup copies REA's (service workers blocked, every non-local request aborted).
2. Without REA's request blocking, Conductor's bundle waits on proxied third-party requests (Sentry, lottie WASM) and its Base UI menus ignore clicks. Aborting non-local requests, as REA does, fixes this. The behaviour is undocumented in REA's docs.
3. With the Session's default (long) `TMPDIR`, REA's capture failed with `execution_failure` / `cleanup_incomplete` and no hint about the cause. The same input succeeded with `TMPDIR=/tmp/t`, which is consistent with the Chromium socket-path limit noted in team memory.
4. Playwright-only selectors (`text=`, `:has-text`) in a probe's sampled selector threw inside the page and hung the run. The probe now tags such elements with `data-probe` first. This was a bug in our tooling, not REA's.

## Not measured on screen

- Turn "..." menu and Changes row hover in OpenConductor: the seeded browser build has no finished turn and its Changes list stays empty without the Tauri backend, so the probe's click/hover timed out. The menu uses the same rule as the measured popups.
- Conductor's Create PR menu: the harness has no PR state that shows the caret.
- The built Tauri app (WebKitGTK): every measurement here is Chromium on the Vite build. WebKit honours the same CSS transitions and `scale`, but no frame timing was recorded there.
- Right panel resize drag and streaming follow-output: not exercised.
