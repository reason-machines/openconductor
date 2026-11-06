# UI audit program ledger

## Final UI pass (run 1, after the batch merged up to #482)

**Build:** `~/OpenConductor-latest` (Developer ID signed, team 6N57FMKAZW), built from main `ff1dec619d85` ("evidence(parity): re-review chat/diff/PR on main 792cabb7 after #477", #482), built 2026-11-05T23:31Z. That is main's head, so no rebuild was needed.

**Setup:** a `ditto` copy of the signed app with only `CFBundleName`/`CFBundleDisplayName` set to `OCFinalPass` (so its window is distinguishable from the other OpenConductor instances running on the Mac) and re-signed ad hoc. It ran on a throwaway `HOME` under `/private/tmp/oc-fuip.*` with three fixture repos (tide-web, tide-api, dotfiles; bare origin + clone, one commit each), light theme, and a window of 1336×855, the same size as the running Conductor window. Sven's real HOME and repos were not touched. The real Conductor was not clicked or resized because it had live agent sessions running.

**Capture method:** `screencapture -l` failed with "could not create image from window" because this shell has no Screen Recording grant (`CGPreflightScreenCaptureAccess() == false`). OpenConductor was captured through Reason's Computer tool, which returns a 1280×819 window image. For Conductor I used Sven's native captures in `~/oc-native-refs/` and REA renders from `evidence/screens/`.

### Side-by-side images (Conductor left, OpenConductor right)

| Image | Conductor source | OpenConductor source |
|---|---|---|
| [home-empty-rea.jpg](../side-by-side/home-empty-rea.jpg) | REA render `home--empty-signed-in--light` | live, empty Home |
| [home-native.jpg](../side-by-side/home-native.jpg) | native `conductor-main.png` (Sven's real data) | live, empty Home |
| [workspace-native.jpg](../side-by-side/workspace-native.jpg) | native `conductor-workspace-filetree-run.png` | live workspace, Changes tab |
| [workspace-all-files-native.jpg](../side-by-side/workspace-all-files-native.jpg) | native `conductor-workspace-filetree-run.png` | live workspace, All files tab |
| [header-open-in-archive-misaligned.png](../side-by-side/header-open-in-archive-misaligned.png) | none (Sven's crop of ours, 3×) | the misalignment in question |

### Verdict per screen

| Screen | Verdict | What differs (owning node) |
|---|---|---|
| Title bar / window drag | **differs (likely broken)** | Every drag region uses `data-tauri-drag-region`, which calls `plugin:window\|start_dragging`. `src-tauri/capabilities/default.json` grants only `core:default`, and Tauri 2.12's `core:window:default` does **not** include `core:window:allow-start-dragging`. So every drag-region mousedown should be rejected by the ACL. A physical drag could not be produced from this session (see below), so this is source evidence, not an observed failure. (shell / title bar) |
| Home, empty | differs | Wordmark: Conductor shows its pixel-block wordmark; ours shows an app icon plus "OpenConductor" text, taller, pushing the cards about 20px lower. Card icons differ: Open GitHub project uses a globe in Conductor and a cloud in ours; Quick start uses a folder-plus in Conductor and a sparkle in ours. Conductor's sidebar empty state says "Add a project to get started."; ours lists repos with "No workspaces" under each (state difference from the fixture, not a defect on its own). (workspaces / home) |
| Sidebar | differs | Ours shows a "No workspaces" row under every empty repo, where Conductor shows the repo row with a count and nothing below. Ours also had a "Show hidden repositories" link while tide-web was hidden. Hover row with `…` and `+` matches in shape. Repo avatars: Conductor uses the GitHub owner avatar or a letter tile; ours uses a bare letter. (shell / sidebar) |
| Header and breadcrumb | differs | Conductor's breadcrumb is `repo › branch …` with a `›` chevron and a trailing `…` menu; ours is `repo / name` plus branch, target branch and status chips (`main`, `Idle`) that Conductor does not show in the header. Conductor has an Open-in split button plus a right-panel toggle; ours has the Open-in split button plus an **Archive** button. The Open-in split button and Archive button are vertically misaligned (Sven's crop). (shell / header) |
| Chat tabs | differs | Conductor's tab strip has a `+` new-tab button right after the tabs, with the tooltip "New chat, same files ⌘T" (Sven's native crop); ours has no `+` in the strip. Conductor's tab title is the chat title ("PDF Evidence Submission"), ours shows the workspace name. (chat / tabs) |
| Chat area and composer | differs | Composer shape, placeholder and `⌘L to focus` hint match. Model picker label format matches ("Opus 4.8 High" vs "GPT-5.6 Sol High"). Conductor shows a floating "Next unread ›" pill above the composer; not seen in ours (no unread state in the fixture, so unverified). The error line in ours ("Authentication required…") is a Reason agent sign-in error in the throwaway HOME, expected. (chat) |
| Right panel: All files | differs | Conductor's All files header has three icon buttons on the right (collapse all, search, open); ours has none. Conductor shows `Changes 0` with a count; ours shows `Changes` with no count. The tree rows (folder icon + mono name) match closely. (git-review / right panel) |
| Right panel: Changes | differs | Ours shows "All changes / Uncommitted" toggles and a Refresh button; empty-state copy "No changes on this branch yet." Not compared against a native Conductor Changes capture (none available). (git-review) |
| Right panel: Checks | not captured | Tab exists in ours; no Conductor reference available. |
| Setup / Run / Terminal strip | differs | Conductor's strip is `⌄ Setup Run Terminal +` with a collapse chevron, a Terminal tab and a `+`; its empty Run state is a dashed card "Run tests or a development server to test changes in this workspace" with an **Add run script** button. Ours is `Run  Setup •` (Run first, no Terminal tab, no `+`, no chevron), a disabled **▶ Run** button, "No run script configured", a "Use spotlight testing" checkbox and a monospace hint. Tab order, empty state and controls all differ. (terminal-scripts) |
| Settings pages | not captured | Navigation to Settings failed after the Computer tool's automation provider closed. Prior REA renders exist in `evidence/screens/settings--*`. |
| Dialogs and menus | partly checked | New workspace dialog opened and was closed. Right-click menus, popover menus and the 39 menus / 89 items in the UI map were **not** walked in this run. |
| Toasts | not captured | Conductor's native capture shows an update toast ("New update available" with See changes / Restart); no toast was triggered in ours. |
| Tooltips | partly checked | From the accessibility tree: ours has "Toggle left sidebar (⌘B)", "Go back (⌘[)", "Home (⌘⇧H)", "Create (⌘N)", "Search (⌘K)", "Settings (⌘,)", "Open in Finder (⌘O)", "Archive workspace". Conductor's new-tab tooltip "New chat, same files ⌘T" has no counterpart because ours has no `+` button. Delay and placement not measured. |
| Animations | not checked | Needs a screen recording, and none can be captured from this session. |
| Alignment sweep | done: sidebar alignment merged in #491 (squash f3831f7); header misalignment confirmed from Sven's crop | Sidebar FREE plan badge in the footer still open as a feature gap, not alignment. |

### Title-bar drag test

**Result: not proven. The source evidence points to a broken drag.**

- Reason's Computer tool drag (`from 700,40 → 600,140` on the header, and `140,18 → 40,118` on the sidebar top bar): the window stayed at 700,150. The tool reports that it posts mouse events to the process, which "cannot drive window-server drag sessions such as window moves", so this test cannot prove a drag works or fails.
- A CGEvent drag posted at the HID tap from the shell did nothing either: `AXIsProcessTrusted() == false`, so macOS dropped the synthetic events.
- Source: `core:window:allow-start-dragging` is missing from `src-tauri/capabilities/default.json`. A one-line fix adds it, then a person drags the window to confirm.

### Other findings from this run

1. **Launch crash when the bundle identifier changes.** A copy of the signed app re-signed ad hoc with `CFBundleIdentifier` changed panics in setup with `Failed to setup app: error encountered during setup hook: unknown path` (tauri `app.rs:1444`). The same copy with only the name changed launches. The crash also hits about one launch in five of a plain ad-hoc re-signed copy on a fresh HOME. It is likely `resource_dir()` → `StartingBinary` canonicalize, but that is not confirmed. Low user impact (a signed build launches), but it makes the e2e lane flaky on fresh HOMEs.
2. **Phantom workspaces in the fixture.** After registering three repos through `repositories.tsv`, the sidebar showed workspaces "S", "Sda" and "Yes" under tide-api, plus a chat whose first message was "s", and tide-web was hidden. None were created by this run. This could be state carried between launches of the same HOME, or a stray input; the cause is not confirmed.

### Screens captured vs not captured

- Captured live (OpenConductor): first-run onboarding, empty Home with sidebar, New workspace dialog, workspace view (header, chat tab, chat, composer, Changes, Run/Setup strip), All files.
- Not captured: Settings pages, Checks, Terminal, right-click menus, popovers, toasts, animations, and every live Conductor screen (no Screen Recording; the live Conductor window was left alone).

## Settings (repo + user settings)

Scope: user Settings (General, Account, Appearance, Agents, Models, Git, Environment, Experimental, Advanced) and repo Settings (Git, Environment, Scripts, Actions, Misc), shared Settings chrome only for Scripts and Actions. Reference: Conductor 0.87.6's frontend decoded from `/Applications/Conductor.app/Contents/MacOS/conductor` on sven m5 max (sha256 `0ba55751…831d`, 2,902 assets, `tools/extract_tauri_assets.py`), served by `tools/screens` and rendered in Chromium beside OpenConductor's build. Measurements use playwright-core because REA cannot hover (tools/ui-map/REA-GAPS.md 17-19). Images: [parity/side-by-side/settings/](../side-by-side/settings/).

| Item | Conductor (verified) | OpenConductor | Status |
|---|---|---|---|
| Tooltip: Back | "Esc", `side:"right"`, Root `delayDuration:100` (`I9a`); live: opens after ~115 ms, 36×24 at 4 px right of the button, fade + scale from 95% over 100 ms | Same text, side, delay and box (opens after ~103 ms) through the shared `Tooltip` (`delay` prop added) | **matches** ([back-tooltip.png](../side-by-side/settings/back-tooltip.png)) |
| Tooltip: Account › Linear Connect, Billing | "Opens settings in your browser", "Opens billing in your browser" (600 ms, top) | No Linear or Billing card (no Conductor account service) | n/a until those cards exist |
| Right-click: settings nav links | Every page link: one item, copy icon + "Copy link", copies `<scheme>://settings/<path>` (`t9a`, `TGt`) | none yet | open: PR (b) |
| Right-click: links in row text | "Open link", "Copy link" (`Q$r`, app-wide `X$r`) | none yet | open: PR (b) |
| Press state: buttons | `REe`: `transition-transform duration-150 ease-out` (cubic-bezier(0,0,.2,1)), `active:scale-[0.97]`, reduced motion keeps scale 1; ghost hover `bg-sidebar-accent` (#ffffff0d dark), instant | Settings `.btn`: same transition, scale .97 on `:active`, reduced-motion guard; Test button gets the ghost hover. Measured: both at scale 0.97 when `:active` | **matches** ([button-press.png](../side-by-side/settings/button-press.png)) |
| Transitions: switches, Back | Switch track `transition-colors duration-150`, thumb `transition-transform duration-150` (cubic-bezier(.4,0,.2,1)); Back `transition-colors` 150 ms | Same durations and easing (were `ease`) | **matches** |
| Transitions: nav links, comboboxes | none (`all 0s`) | none | matches |
| Alignment | Back: 28 px tall, right edge 6 px inside the 256 px nav; account switcher and "Search settings" above the groups | Back 22 px tall and 40 px further left; no account switcher or search | open: PR (d) |
