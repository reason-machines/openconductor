# Conductor reference screenshots

Pixel references of Conductor's screens for OpenConductor verifiers. Reference evidence only: no Conductor logos, brand assets or source are stored here, only screenshots of the running UI with invented data.

## Source build

- Conductor **0.87.6** (`com.conductor.app`, Team 27XN666UJ7), `MacOS/conductor` sha256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- Frontend: the embedded Tauri asset table, extracted with `tools/extract_tauri_assets.py` (2,902 entries, 54 MB); `index.html` sha256 `48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b`. The dist stays outside the repository (`.rea-work/dist`, git-excluded).

## How they were taken

- Tool: REA (`rea-agents@6.7.0`) `capture_browser_scenario`, run as `rea capture-browser-scenario <input.json> --format json` with `browser: {mode: "launch", executable_path: "/usr/bin/chromium", headless: true}`, viewport 1440x900 at scale 1, locale en-US, timezone UTC, reduced motion. Each shot's REA `evidence_id` and `scenario_sha256` are in [manifest.json](manifest.json).
- Harness: [tools/screens](../../tools/screens) serves the dist and injects a mock of Tauri's IPC (`window.__TAURI_INTERNALS__`) before the app boots: `plugin:sql` runs on sql.js databases built from [evidence/sqlite](../sqlite) schemas plus synthetic seed rows; `plugin:fs` is a virtual filesystem; the keychain returns a fake token and a cached synthetic user ("Ada Demo") for signed-in scenarios. A CSP (`connect-src 'self'`) and a fetch guard keep the page off the network, so Sentry, PostHog, `api.conductor.build` and CDN requests never leave the browser.
- Theme: `?oc_theme=light|dark` seeds Conductor's file-backed local storage (`melty-theme-selected-mode`), in the layout the app itself writes when the theme is switched in Settings > Appearance.
- Shot definitions: [tools/screens/shots](../../tools/screens/shots). Rerun with `cd tools/screens && npm i && TMPDIR=/tmp/t node capture.mjs shots/<file>.json` (Chromium needs a short `TMPDIR`), then `node readme.mjs`.

## Known differences from the real app

- Rendered by Chromium on Linux, not WKWebView on macOS: font rasterisation differs slightly, and there are no native traffic lights or window vibrancy (the app paints the area, the OS does not).
- The Lottie logo animation needs a WASM file from a CDN, which the harness blocks, so animated logos fall back or stay blank.
- Pages load from `http://conductor.localhost:4317`, not `localhost`: Conductor bundles Virtuoso Message List, whose license check treats `localhost` as a development host and swaps the chat transcript for an expired-license banner (key expiry 2026-11-03). Inside Conductor's own webview this banner never shows.
- Anything that needs GitHub or Conductor's servers (PR status, checks, announcements, cloud workspaces) shows its offline or error state, for example "Couldn't load PR info" in the right panel.
- Populated scenarios use invented data: repos tide-web, tide-api and dotfiles; six workspaces named after cities; one transcript in "lisbon". Git answers come from a small fake in [fixtures.js](../../tools/screens/fixtures.js).
- The onboarding carousel plays bundled videos, so its right-hand panel shows whichever frame was current at capture time.

## Screenshots

| File | Theme | Scenario | Steps | What it shows | sha256 |
|---|---|---|---|---|---|
| [chat--tool-calls-expanded--dark.png](chat--tool-calls-expanded--dark.png) | dark | `populated` | expand_tide_web → open_workspace → pause → expand_tools | The '4 tool calls, 2 messages' group expanded: Grep, Read, Edit and Bash rows with intermediate assistant text. | `95c1b8417775` |
| [chat--transcript-collapsed-tools--dark.png](chat--transcript-collapsed-tools--dark.png) | dark | `populated` | expand_tide_web → open_workspace | Workspace open: chat transcript with tool calls collapsed, composer, right panel with Changes (2 files) and Run tab. 'Couldn't load PR info' appears because GitHub is unreachable in the harness. | `38ce9dcde099` |
| [chat--transcript-collapsed-tools--light.png](chat--transcript-collapsed-tools--light.png) | light | `populated` | expand_tide_web → open_workspace | Same as dark, light theme. | `4a45461fe934` |
| [home--empty-signed-in--dark.png](home--empty-signed-in--dark.png) | dark | `signed-in` | load | Cached synthetic user, no repos: empty Home and sidebar ('Add a project to get started.'). | `4d977d971125` |
| [home--empty-signed-in--light.png](home--empty-signed-in--light.png) | light | `signed-in` | load | Same as dark, light theme. | `fa68c6c73f2b` |
| [onboarding--sign-up-opening-browser--dark.png](onboarding--sign-up-opening-browser--dark.png) | dark | `signed-out` | click_sign_up | After clicking Sign up: the button reads 'Opening browser...' (plugin:opener\|open_url is swallowed by the mock). | `fbe4a4c0b898` |
| [onboarding--signed-out--dark.png](onboarding--signed-out--dark.png) | dark | `signed-out` | load | Empty DB and empty keychain: signed-out first screen. | `e7d4963fcb50` |
| [onboarding--signed-out--light.png](onboarding--signed-out--light.png) | light | `signed-out` | load | Same as dark, light theme. | `121afaa0bebc` |
| [sidebar--repos-collapsed--dark.png](sidebar--repos-collapsed--dark.png) | dark | `populated` | load | Populated sidebar: three repos with workspace counts, Home in the main area. | `b989166d3e92` |
| [sidebar--repos-expanded--dark.png](sidebar--repos-expanded--dark.png) | dark | `populated` | expand_tide_web → pause → expand_tide_api | Two repos expanded: workspace rows (branch-derived names, unread rows in bold, diff stats on the row with changes). | `42c832f03baf` |
| [sidebar--repos-expanded--light.png](sidebar--repos-expanded--light.png) | light | `populated` | expand_tide_web → pause → expand_tide_api | Same as dark, light theme. | `e8a2ac9e3991` |

## Not captured

Nothing yet.
