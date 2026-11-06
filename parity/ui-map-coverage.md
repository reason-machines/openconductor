# What the UI map does not cover yet

A REA pass over the real Conductor 0.87.6 (`/Applications/Conductor.app` on sven m5 max, binary sha256 `0ba55751…831d`) for the parts of the UI that [ui-map.md](ui-map.md) cannot see: surfaces it has no inventory category for, states its reference harness could not render, and inventory items it never located on a screen. Run 2026-11-06 against OpenConductor main `0b89bf8`. Strings quoted from Conductor are untrusted data, kept only to name what is missing.

How each fact was obtained is in the Evidence column. "REA" means a REA Evidence record (its id is given); "bundle" means the decoded frontend chunk `renderApp-D_fmY7hW.js` or `index-BGEQ8YjU.js` read directly at the given byte offset, because REA cannot search or model those chunks (gaps 14, 17, 27 and 28 in [tools/ui-map/REA-GAPS.md](../tools/ui-map/REA-GAPS.md)); "strings" means the string table of `MacOS/conductor`.

## 1. Surfaces with no category in the map

The inventory (`tools/ui-map/extract_inventory.py`) reads Radix/Base UI components, sonner toasts and routes from the frontend chunks. Everything the Rust side or a Tauri plugin draws natively is outside it.

| Surface | Conductor | OpenConductor at `0b89bf8` | Evidence |
|---|---|---|---|
| Native menu bar: app menu | Tauri's default menu plus **Check for Updates**, **Settings...** (`CmdOrCtrl+,`, SF Symbol `gearshape`), a custom **Quit** (`custom_quit`, `Cmd+Q`) | Tauri's default menu only | strings (`Check for Updates` … `Warning: Could not find Settings... menu item`); [evidence/keybindings/README.md](../evidence/keybindings/README.md) "Native menu"; `src-tauri/src/menu.rs` |
| Native menu bar: View | **Toggle Left Sidebar**, **Toggle Right Sidebar** (no accelerator) | same two items | strings; `menu.rs` |
| Native menu bar: Help | Keyboard Shortcuts, Documentation, Best Practices, Changelog, Send Feedback (`CmdOrCtrl+Alt+F`), Submit a Prompt..., Diagnostics..., Debug (`CmdOrCtrl+Alt+I`) | Keyboard Shortcuts only (7 of 8 missing) | strings; webview listeners `open_diagnostics_page` → `/diagnostics`, `open_submit_prompt_dialog`, `open_changelog_url`, `open_best_practices_url`, `open_feedback_dialog`, `open_documentation_url` (bundle @ 10,930,850) |
| Native menu bar: Window | adds **Close Window** | Tauri default | strings |
| Native file pickers (`plugin:dialog\|open`) | 11 call sites, each with its own title: "Select project directory", "Choose where to clone the repository", "Choose where to create the project", "Select directory to link", "Select env file", "Select Conductor root directory", "Select SSH private key", a templated "Select …", and three image pickers (png/jpg/jpeg/gif/webp) | one folder picker (`pickFolder`, `src/backend.ts`) plus pickers in Settings › Agents and the two Environment pages; titles not compared | bundle `fI(` calls (import of `W4t` from `index` @ 3,473,274) |
| Native save dialog (`plugin:dialog\|save`) | 1 call site (`O4r({defaultPath})`) | not found | bundle |
| Native confirm (`plugin:dialog\|confirm`) | "Open this terminal link?" before a terminal link opens | not found. OpenConductor uses `window.confirm` for review-comment discard/delete and agent disconnect; Conductor's inventory has an in-app "Discard comment?" dialog for the first | bundle `Gyr(` (import of `wXt`) |
| Native notifications | `send_native_notification` command (title, body) and `plugin:notification` permission check | not compared | strings; bundle `index` @ 2,538,527 |
| File drag and drop onto the window | two `onDragDropEvent` consumers: a drop overlay that turns on while paths are dragged over, and a drop handler that attaches the dropped paths | not compared | bundle (`fCe().onDragDropEvent`) |
| Tooltips | no inventory category. At least 19 `tooltip:` props (all "Copy …" plus "Run now") and the shared Tooltip component; only the Settings Back tooltip and the new-chat `+` tooltip have been measured | partial (see ledger) | bundle |
| Window chrome | traffic lights drawn over the sidebar in Sven's native captures; the window options themselves are compiled into the binary (only the config field names, such as `trafficLightPosition`, are in its strings), so position, min size and vibrancy are not known. REA could not capture the native window (gap 26) | `tauri.conf.json`: 1280×820, min 900×560, `titleBarStyle: Overlay`, hidden title | strings; REA `inspect-plist` `ev_3a3000fa…` (bundle id, URL scheme `conductor`, usage strings), `inspect-signature` `ev_9ebab8fc…` |

`setBadgeCount` and `requestUserAttention` appear only inside Tauri's own window API class in `index`; no app code calls them, so Conductor has no dock badge or bounce to copy.

## 2. States the reference harness could not render, and why

The harness redirects these to General or `/`. The conditions below are Conductor's own gates, read from the settings navigation builders `yUi` (search, bundle @ 10,869,833) and `dti` (sidebar nav, bundle @ 11,263,469) and the settings layout (@ 11,270,400).

| State / page | Conductor shows it when | Local, signed-out-of-cloud user sees it? | OpenConductor | What the map should do |
|---|---|---|---|---|
| Settings › Big terminal (`settings-terminal`) | user setting `experimental_big_terminal_mode` is true | yes, after turning it on in Experimental | has the page (`BigTerminalPage.tsx`) | seed `experimental_big_terminal_mode = true` on both sides; the "missing" status is a harness artefact |
| Big terminal placement | appended to the **last** nav group's tabs (`More`, after Advanced) by `dti` | | rendered as its own untitled group after More (`settingsGroups`, `src/settings/pages.ts`) | **wrong**: real placement difference |
| Settings › Keyboard shortcuts (`settings-key-bindings`) | `internalOnly: true`; inserted after Appearance only when the user is internal (`hy()`) | **no** | listed for everyone after Appearance (comment in `pages.ts` acknowledges it) | mark n/a for a local user, or hide it to match |
| Settings › Internal | `internalOnly: true` | no | not built | n/a |
| Settings › Ports | `cloudOrganizationActive === true` | no | not built | n/a for a local user |
| Settings › Environment (user) | hidden when `cloudOrganizationActive === true` | yes | has it | covered |
| Settings › Repositories (per repo) | hidden unless `cloudOrganizationActive === false` and there are repos | yes | has it | covered |
| Settings › Cloud setup ("Cloud" group, `Legacy` badge) | organization `kind === "personal"` and the cloud entitlement | no | not built | n/a |
| Settings › Organization (Admin group: Preferences, Members, Billing; Cloud computer, Environment, MCP, Personal/Shared Prompts) | `organizationSettingsEnabled` (`t9e().enabled`) | no | not built | n/a |
| `/diagnostics` | Help › Diagnostics... (`open_diagnostics_page`), no gate found | **yes** | no route, no menu item | **missing**: a real gap |
| `/dashboard`, `/routines` | sidebar entries built only for a cloud organization (`fc(organization) === "cloud"`, bundle @ 10,028,800) | no (inferred from the sidebar builder; the route guards were not traced) | not built | n/a for a local user |
| `/team` | command palette `view-team` | not traced | not built | unverified |
| First-run onboarding (`first-run-onboarding`) | harness redirected to `/` | yes | has it | needs a harness seed with onboarding not yet completed |
| Sidebar repo actions menu (`menu-repo-actions`) | harness step failed (hover-only "…" button, gaps 10 and 16) | yes | has it | capture by clicking the button through a DOM dispatch, as the alignment sweep does |

## 3. Inventory items never located on a screen

686 of 898 inventory items have no captured state on either side, so their "missing" status is unverified (the map says so). By kind: 326 toasts, 87 menu items, 55 dialogs, 47 empty states, 44 popovers, 38 menus, 29 tabs, 26 routes, 22 selects, 8 settings pages, 3 sheets, 1 settings row. By owning team: triage 268, shell 177, chat 49, cloud-org 42, workspaces 35, routines 32, git-review 30, terminal-scripts 29, settings 15, onboarding-auth 9.

Of the 26 unlocated routes, 13 are cloud-only (`/automations*`, `/routines/*`, `/settings/cloud*`, `/settings/organization*`), one is a developer route (`/dev/simulated-route-error`) and the rest are index routes that redirect (`/settings`, `/settings/user`, `/settings/repos`). The dialogs that a local user can reach and that need a state to verify include: Reset chat?, Discard changes?, Discard file changes?, Discard comment?, Unsaved Changes, Change root path?, Create a private GitHub repo?, Version history, Feedback, Conductor Passport, Custom provider, MCP status, Select MCP servers.

## 4. What was tried and could not be done

- **Native capture of the real Conductor window with REA** (`observe-native-ui`, `capture-native-ui-scenario`): refused with `screen-recording-denied` because the Reason worker shell on sven m5 max has no Screen Recording grant (`CGPreflightScreenCaptureAccess() == false`, `AXIsProcessTrusted() == false`). Granting both to the worker is a person's action in System Settings › Privacy & Security; until then every native reference is one of Sven's captures in `~/oc-native-refs/`.
- **Driving the live Conductor**: not done. It had a running Claude Code agent (`--resume f43a33df…`), so it was observed only through the window list, not clicked.
- **REA search and trace on the binary**: no string provider is configured on the Mac (Ghidra needs `GHIDRA_INSTALL_DIR` and a JRE; Hopper, IDA and kuna are absent), so the menu strings above come from a plain string table.
