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
| [command-palette--all--dark.png](command-palette--all--dark.png) | dark | `populated` | wait_sidebar → open_palette | Cmd+K: command palette, All tab, Actions list with shortcuts. | `def313efc6cf` |
| [command-palette--all--light.png](command-palette--all--light.png) | light | `populated` | wait_sidebar → open_palette | Same as dark, light theme. | `71ec4abdfb35` |
| [command-palette--search-results--dark.png](command-palette--search-results--dark.png) | dark | `populated` | wait_sidebar → open_palette → pause0 → type_query | Command palette with the query 'login'. | `84b9cd8ad3c7` |
| [command-palette--workspaces-tab--dark.png](command-palette--workspaces-tab--dark.png) | dark | `populated` | wait_sidebar → open_palette → pause0 → tab_workspaces | Command palette, Workspaces tab. | `7bd274e98885` |
| [create-workspace--from-repo--dark.png](create-workspace--from-repo--dark.png) | dark | `populated` | repo_plus | '+' next to tide-web: create dialog with the repo preselected. | `06ef812769bb` |
| [create-workspace--no-repo--dark.png](create-workspace--no-repo--dark.png) | dark | `populated` | create | Sidebar > Create: new-workspace composer ('What do you want to work on?') with 'Select repo', model chip and Create button. | `40d31de6656a` |
| [create-workspace--no-repo--light.png](create-workspace--no-repo--light.png) | light | `populated` | create | Same as dark, light theme. | `d15be866ef44` |
| [create-workspace--repo-picker--dark.png](create-workspace--repo-picker--dark.png) | dark | `populated` | create → pause0 → open_repo_picker | Create dialog with the repo picker open. | `735e22be094f` |
| [create-workspace--typed-prompt--dark.png](create-workspace--typed-prompt--dark.png) | dark | `populated` | repo_plus → pause0 → type_prompt | Create dialog for tide-web with a typed prompt. | `0ee7c3bc9f95` |
| [diff--added-tests--dark.png](diff--added-tests--dark.png) | dark | `populated` | expand_tide_web → open_workspace → pause → open_test_diff | Changes panel > src/lib/auth.test.ts: an all-additions hunk (+14). | `7b30e5e65cd7` |
| [diff--entire-file--dark.png](diff--entire-file--dark.png) | dark | `populated` | expand_tide_web → open_workspace → pause → open_auth_diff → pause2 → entire_file | Same file as 'Entire file' (raw view). | `ae6998ed1ba3` |
| [diff--file-split--dark.png](diff--file-split--dark.png) | dark | `populated` | expand_tide_web → open_workspace → pause → open_auth_diff → pause2 → split_view | Same file in split view (old left, new right). | `f37005914747` |
| [diff--file-unified--dark.png](diff--file-unified--dark.png) | dark | `populated` | expand_tide_web → open_workspace → pause → open_auth_diff | Changes panel > src/lib/auth.ts: unified diff tab with collapsed unmodified lines, one removed and one added line, Viewed checkbox. | `4cb12cfd05dc` |
| [diff--file-unified--light.png](diff--file-unified--light.png) | light | `populated` | expand_tide_web → open_workspace → pause → open_auth_diff | Same as dark, light theme. | `93c09c5ab323` |
| [home--empty-signed-in--dark.png](home--empty-signed-in--dark.png) | dark | `signed-in` | load | Cached synthetic user, no repos: empty Home and sidebar ('Add a project to get started.'). | `4d977d971125` |
| [home--empty-signed-in--light.png](home--empty-signed-in--light.png) | light | `signed-in` | load | Same as dark, light theme. | `fa68c6c73f2b` |
| [menu--account--dark.png](menu--account--dark.png) | dark | `populated` | account | Account menu from the sidebar header: email, Settings, Log out. | `4fcb3c22bc4c` |
| [menu--model-picker--dark.png](menu--model-picker--dark.png) | dark | `populated` | expand_tide_web → open_workspace → pause → model | Composer model picker opened from the 'Opus 5 High' chip. | `41bea488c9b9` |
| [menu--workspace-context--dark.png](menu--workspace-context--dark.png) | dark | `populated` | expand_tide_web → context | Right-click context menu on a sidebar workspace row. | `3f176da59467` |
| [onboarding--sign-up-opening-browser--dark.png](onboarding--sign-up-opening-browser--dark.png) | dark | `signed-out` | click_sign_up | After clicking Sign up: the button reads 'Opening browser...' (plugin:opener\|open_url is swallowed by the mock). | `fbe4a4c0b898` |
| [onboarding--signed-out--dark.png](onboarding--signed-out--dark.png) | dark | `signed-out` | load | Empty DB and empty keychain: signed-out first screen. | `e7d4963fcb50` |
| [onboarding--signed-out--light.png](onboarding--signed-out--light.png) | light | `signed-out` | load | Same as dark, light theme. | `121afaa0bebc` |
| [settings--account--dark.png](settings--account--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause → open_account | Settings > Account. | `a4767853051d` |
| [settings--advanced--dark.png](settings--advanced--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause → open_advanced | Settings > Advanced. | `b235164ce007` |
| [settings--agents--dark.png](settings--agents--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause → open_agents | Settings > Agents. | `c7ef9e91c0ea` |
| [settings--appearance--dark.png](settings--appearance--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause → open_appearance | Settings > Appearance. | `bcff78cc9faf` |
| [settings--appearance--light.png](settings--appearance--light.png) | light | `populated` | wait_sidebar → open_settings → pause → open_appearance | Settings > Appearance, light theme. | `71a1335f746a` |
| [settings--default-models--dark.png](settings--default-models--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause → open_default_models | Settings > Default models. | `757c677b462d` |
| [settings--environment--dark.png](settings--environment--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause → open_environment | Settings > Environment. | `1c9d4d200be0` |
| [settings--experimental--dark.png](settings--experimental--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause → open_experimental | Settings > Experimental. | `0c5049d1fcd7` |
| [settings--general--dark.png](settings--general--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause | Settings > General. | `36d92bb913d2` |
| [settings--general--light.png](settings--general--light.png) | light | `populated` | wait_sidebar → open_settings → pause | Settings > General, light theme. | `2e9543073bd9` |
| [settings--git--dark.png](settings--git--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause → open_git | Settings > Git. | `ebcb00933d01` |
| [settings--search--dark.png](settings--search--dark.png) | dark | `populated` | wait_sidebar → open_settings → pause → search | Settings search with the query 'branch'. | `ed79d6de4604` |
| [sidebar--repos-collapsed--dark.png](sidebar--repos-collapsed--dark.png) | dark | `populated` | load | Populated sidebar: three repos with workspace counts, Home in the main area. | `b989166d3e92` |
| [sidebar--repos-expanded--dark.png](sidebar--repos-expanded--dark.png) | dark | `populated` | expand_tide_web → pause → expand_tide_api | Two repos expanded: workspace rows (branch-derived names, unread rows in bold, diff stats on the row with changes). | `42c832f03baf` |
| [sidebar--repos-expanded--light.png](sidebar--repos-expanded--light.png) | light | `populated` | expand_tide_web → pause → expand_tide_api | Same as dark, light theme. | `e8a2ac9e3991` |

## Not captured

| Screen | Reason |
|---|---|
| Composer '+' (attachments) menu | No stable locator: the button has no aria-label or text, and the CSS guess timed out. Needs a DOM capture to pick a selector. |
| Settings > Repositories > <repo> | Clicking a repository row in the settings nav only shows its hover state; the page body stays on General in the harness. Not investigated further (likely needs repo config reads the mock doesn't answer). |
