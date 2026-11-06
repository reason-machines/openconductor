# UI program ledger: OpenConductor vs Conductor, screen by screen

One row per node of Sven's UI audit program. A node is done when its side-by-side image
(real Conductor left, OpenConductor right, same window size; rules in
[side-by-side/README.md](../side-by-side/README.md)) shows it matching, and that image is linked
from a merged PR.

The coordinator Session owns this file. Builder Sessions update their own row in the PR that
changes the node: owner Session id, PR numbers, status and the date of the side-by-side image
that justifies the status.

## Columns

- **Node**: the screen area. The slug in backticks is the `<node>` part of image file names.
- **Owner Session**: the child Session building the node (Session id), or `unassigned`.
- **PRs**: PRs for the node, newest last (`#123`, draft or merged).
- **Side-by-side status**: one of
  - `missing`: OpenConductor has no equivalent screen or control;
  - `wrong`: OpenConductor has it but it does not match Conductor;
  - `matches`: the latest side-by-side image shows no difference Sven would call out.
- **Last verified**: date and OpenConductor commit of the side-by-side image behind the status,
  linked to the image. `seed` means no side-by-side exists yet (see Seed below).

## Nodes

| Node | Owner Session | PRs | Side-by-side status | Last verified |
|---|---|---|---|---|
| Home `home` | unassigned | #457, #501 | wrong | seed |
| Sidebar `sidebar` | unassigned | #491, #505 | wrong | seed |
| Header + title bar `header` | unassigned | #504, #514 | wrong | seed |
| Chat tabs + chat area + composer `chat` | unassigned | #516 | wrong | seed |
| Right panel: All files / Changes / Checks `right-panel` | unassigned | | wrong | seed |
| Setup / Run / Terminal strip `strip` | unassigned | #509 | wrong | seed |
| Settings: Personal (General, Account, Appearance, Default models, Git, Ports) `settings-personal` | unassigned | | wrong | seed |
| Settings: Agents & environment (Agents, Environment) `settings-agents-env` | unassigned | | wrong | seed |
| Settings: Repositories (per repo: Environment, Git, Scripts, Actions, Misc) `settings-repos` | unassigned | | wrong | seed |
| Settings: More (Experimental, Advanced) `settings-more` | unassigned | | wrong | seed |
| Settings: Organization and Cloud (cloud org only) `settings-org` | unassigned | | missing | seed |
| Dialogs and menus `dialogs-menus` | unassigned | | wrong | seed |
| Toasts `toasts` | unassigned | | wrong | seed |

Settings groups follow Conductor's settings navigation as read from its bundle
([evidence/settings/NOTES.md](../../evidence/settings/NOTES.md), "Settings pages"): Personal,
Agents & environment, Repositories, More. Conductor shows Ports and the Organization/Cloud pages
only for a cloud organization and redirects a local user to General; whether OpenConductor builds
them is the coordinator's call.

## What each node covers

Scope comes from Sven's decisions for the program; anything not listed is matched to Conductor
as-is.

- **Home**: Conductor's Home with the pixel wordmark in our name, three cards and the cities line;
  the sidebar's Home entry opens it.
- **Sidebar**: repo avatars, workspace rows with branch icons, `+N −M` counts, the FREE badge;
  the sidebar header is part of the window drag region.
- **Header + title bar**: breadcrumb `repo › branch ···` (repo avatar, chevron separator, overflow
  menu), the Open in button and its menu, the right-panel toggle at the far right; a drag region
  along the whole top (`data-tauri-drag-region` on the title-bar strip, sidebar header and main
  header, never on buttons).
- **Chat tabs + chat area + composer**: a tab per chat above the chat, a `+` with tooltip
  "New chat, same files ⌘T" and the ⌘T shortcut, several chats per workspace; transcript and
  composer as in Conductor.
- **Right panel**: tabs "All files", "Changes" with count badge, "Checks"; toolbar icons on the
  right (collapse tree, search, new file). File tree with folder and file-type icons, hover row
  highlight, expand chevron on hover, monospace names; files open through Open in, no in-app
  editor.
- **Setup / Run / Terminal strip**: collapsible strip under the right panel with tabs Setup, Run,
  Terminal, a `+` and a collapse chevron. Run's empty state is a dashed box "Run tests or a
  development server to test changes in this workspace" with an "Add run script" button. The
  bottom-of-workspace terminal stays removed; the terminal is a tab here.
- **Settings**: one node per page group above.
- **Dialogs and menus**: every dialog, sheet, context menu, popover and select (create project,
  clone, rename, keyboard shortcuts, account, workspace context, repo actions, model picker, help,
  command palette, Open in menu).
- **Toasts**: sonner toasts, their copy, placement and actions.
- **Across all nodes**: no blue accent. Active tab underlines, selected states, buttons (Run
  included), links, focus rings and the Open in icon tint are neutral black/grey, set once in the
  theme tokens, never per component.

## Seed

No side-by-side image exists yet, so every status above is a seed from
[parity/ui-map.md](../ui-map.md) (generated 2026-11-05 against OpenConductor `2e13137`) and Sven's
decisions. Those ui-map references are Conductor's extracted frontend rendered in Chromium on
Linux, not the native macOS app, and several PRs merged since (#471 file tree, #477 tool rows, #481
terminal strip), so a seed status is a starting point, not a verification. The first
side-by-side image for a node replaces its seed.

PRs merged before this table was added are listed in the PRs column from their titles on main;
their side-by-side images (for example `home-native.jpg`, `title-drag-region--workspace--light.png`)
and the per-screen verdicts of the final UI pass run 1 below predate the naming and window-size
rules, so the coordinator re-checks each before changing a seed status.

| Node | Seed basis |
|---|---|
| `home` | ui-map `home` wrong (copy 79%); `home-empty` matches, but the wordmark, cards and cities line are Sven's open asks |
| `sidebar` | ui-map `sidebar-after-archive` matches, but repo avatars, branch icons, `+N −M` and FREE badge are Sven's open asks |
| `header` | Sven's asks (breadcrumb, Open in, panel toggle, drag region); no ui-map state isolates the header |
| `chat` | ui-map `workspace-chat`, `workspace-new-chat`, `workspace-tool-calls` wrong; chat tabs partial per the 2026-11-05 parity re-review |
| `right-panel` | ui-map `diff-*` wrong; Sven's asks for tabs, toolbar and tree |
| `strip` | Sven's asks (Setup/Run/Terminal tabs, Run empty state, Run button not blue) |
| `settings-personal` | ui-map General, Account, Default models, Appearance wrong; Git matches; Ports missing |
| `settings-agents-env` | ui-map Agents, Environment wrong |
| `settings-repos` | ui-map repo Environment, Scripts, Actions, Misc wrong; repo Git matches |
| `settings-more` | ui-map Experimental, Advanced wrong |
| `settings-org` | ui-map: OpenConductor has no organization or cloud settings |
| `dialogs-menus` | ui-map dialog and menu states all wrong; 56 of 64 dialogs and 39 of 39 menus missing in the inventory |
| `toasts` | ui-map `toast-copied-link` wrong; 326 of 327 inventory toasts missing |

## Native references

Real-app captures from Sven's Mac belong under `evidence/screens/native/`. As of this table's first
commit that directory does not exist (the run 1 pass below used Sven's captures in
`~/oc-native-refs/` on his Mac, which are not committed); the only Conductor references in the repo are the
Chromium harness renders in [evidence/screens](../../evidence/screens) and
[parity/ui-map](../ui-map). Side-by-side images need the native app on the left (see the
side-by-side README).

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
| Alignment: nav column | 256 px nav; Back 66.8×28 at (182, 6), 16 px icon, `px-1.5 py-1`; group title `px-2 py-1.5 text-xs` 28 px; link `gap-3 px-2 py-1.5` 32 px, icon x 14, text x 42, 14/20 | Was 220 px (an old styles.css rule beat settings.css), Back 60.8×22, titles 20 px, links gap 10 / pad 10, line-height normal. Now 256 px, Back 66.8×28 at (182, 6), icon 16, links gap 12 / pad 8, icon x 14, text x 42, 14/20 | **matches** ([align-nav.png](../side-by-side/settings/align-nav.png)) |
| Alignment: rows | Content x 296, h1 24/32 at y 64; controls right edge 1192; switch rendered inline in a block wrapper, 1.5 px above the row centre | Content x 260 → 296 (from the nav width); switch was 1.5 px lower than Conductor on every page, now the same wrapper layout and the same y (General, Git, Experimental measured) | **matches** ([align-switch-row.png](../side-by-side/settings/align-switch-row.png)) |
| Nav: account switcher + Search settings | "Ada Demo's Mac ⌄" switcher and "Search settings ⌘F" above Personal | not built | feature gap (not alignment) |

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

## Final UI pass (run 2, main `0b89bf8`, 2026-11-06)

**What ran.** Every state in [tools/ui-map/states.json](../../tools/ui-map/states.json) on both sides, regenerated end to end on a Reason cloud computer: Conductor 0.87.6's frontend decoded from the real binary on sven m5 max (sha256 `0ba55751…831d`) and rendered by REA `capture-browser-scenario` (REA 6.8.0 on the cloud computer); OpenConductor built from `0b89bf8` (`npx tauri build --debug --no-bundle`) and driven by tauri-driver under Xvfb, 1280×820, dark theme, fixture HOME; REA `compare-web-screenshots` at thresholds 0 and 24; `build_map.py`. 65 reference captures, 44 OpenConductor captures plus 3 that stopped at a step, 47 diffs. The full regenerated map is [parity/ui-map.md](../ui-map.md); what the map cannot see (native menu bar, native dialogs, gated pages and why) is in [parity/ui-map-coverage.md](../ui-map-coverage.md).

**Totals** (states and inventory items; `c3c7b31` in brackets): 963 entries, 781 missing (780), 137 wrong (160), 45 matches (23). States: 22 missing, 38 wrong, 5 match. Settings rows matching went from 11 to 30.

**What these images are.** The left side of each diff is Conductor's own frontend in Chromium with mocked IPC and synthetic data, not the native window, so these are not side-by-side images under [side-by-side/README.md](../side-by-side/README.md) and do not change any node's seed status above. Seed data differs between the sides (the reference has six workspaces and a transcript, OpenConductor one fresh worktree), so pixel ratios include content differences. Background tone differs on every screen because OpenConductor uses the Neutral grading Sven chose; that is intended, not a finding. The diff and side-by-side JPGs are committed under `parity/ui-map/diff/`; the raw PNGs are not.

### Ledger: every screen

| Screen | Status | Was (`c3c7b31`) | t24 | Copy | Missing from OpenConductor (first 4 of Conductor's strings) | Evidence |
|---|---|---|---:|---:|---|---|
| Onboarding, signed out `onboarding-signed-out` | **wrong** | wrong | 99.3% | 86% | "privacy" | [diff](../ui-map/diff/onboarding-signed-out.jpg) |
| First-run onboarding `first-run-onboarding` | **wrong** | wrong | 96.8% | 7% | - | [diff](../ui-map/diff/first-run-onboarding.jpg) |
| Home, no projects `home-empty` | **matches** | matches | 3.5% | 93% | "view pricing" | [diff](../ui-map/diff/home-empty.jpg) |
| Home with projects `home` | **wrong** | wrong | 4.3% | 73% | "open project"; "open github project"; "quick start"; "view pricing" | [diff](../ui-map/diff/home.jpg) |
| All workspaces list `all-workspaces` | **matches** | matches | 1.1% | 92% | "view pricing" | [diff](../ui-map/diff/all-workspaces.jpg) |
| Create workspace composer `create` | **wrong** | wrong | 8.6% | 77% | "open project"; "open github project"; "quick start"; "select repo" | [diff](../ui-map/diff/create.jpg) |
| Create: repo picker open `create-repo-picker` | **wrong** | wrong | 8.9% | 78% | "open github project"; "quick start"; "select repo"; "add project" | [diff](../ui-map/diff/create-repo-picker.jpg) |
| Workspace: chat transcript `workspace-chat` | **wrong** | wrong | 6.1% | 82% | "next unread"; "view pricing"; "copy final message"; "show message actions" | [diff](../ui-map/diff/workspace-chat.jpg) |
| Workspace: new empty chat `workspace-new-chat` | **wrong** | wrong | 3.6% | 88% | "add chat transcripts"; "next unread"; "view pricing" | [diff](../ui-map/diff/workspace-new-chat.jpg) |
| Chat: tool calls expanded `workspace-tool-calls` | **wrong** | wrong | 7.4% | 83% | "next unread"; "view pricing"; "copy final message"; "show message actions" | [diff](../ui-map/diff/workspace-tool-calls.jpg) |
| Diff: file, unified `diff-unified` | **wrong** | wrong | 11.2% | 88% | "archive workspace"; "view pricing"; "copy file contents"; "filter files" | [diff](../ui-map/diff/diff-unified.jpg) |
| Diff: file, split `diff-split` | **wrong** | wrong | 11.3% | 88% | "archive workspace"; "view pricing"; "copy file contents"; "filter files" | [diff](../ui-map/diff/diff-split.jpg) |
| Diff: entire file `diff-entire-file` | **wrong** | wrong | 5.8% | 88% | "archive workspace"; "view pricing"; "copy file contents"; "filter files" | [diff](../ui-map/diff/diff-entire-file.jpg) |
| Workspace needing permission `needs-permission` | **missing** | missing | n/a | n/a | - | the OpenConductor seed has no workspace with a pending permission request |
| Dashboard `route-dashboard` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /dashboard |
| Routines `route-routines` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /routines |
| New routine `route-routines-new` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /routines/new |
| Team `route-team` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /team |
| Diagnostics `route-diagnostics` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /diagnostics |
| New member onboarding `route-new-member-onboarding` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /new-member-onboarding |
| Cloud collaboration onboarding `route-cloud-collab-onboarding` | **missing** | missing | n/a | n/a | - | OpenConductor has no route or view for /cloud-collab-onboarding |
| Login `login` | **missing** | missing | 99.3% | 0% | "sign in to continue"; "privacy" | [diff](../ui-map/diff/login.jpg) |
| Settings > General `settings-general` | **wrong** | wrong | 3.3% | 89% | "enter"; "chime"; "account menu"; "search settings" | [diff](../ui-map/diff/settings-general.jpg) |
| Settings > Account `settings-account` | **wrong** | wrong | 5.0% | 73% | "linear"; "connect linear so conductor can use issu"; "billing"; "manage your conductor plan and payment d" | [diff](../ui-map/diff/settings-account.jpg) |
| Settings > Default models `settings-models` | **wrong** | wrong | 4.8% | 71% | "loadout"; "choose which models you want to use"; "share"; "empty" | [diff](../ui-map/diff/settings-models.jpg) |
| Settings > Agents `settings-providers` | **wrong** | wrong | 10.0% | 83% | "authentication"; "cli"; "account menu"; "search settings" | [diff](../ui-map/diff/settings-providers.jpg) |
| Settings > Environment `settings-environment` | **wrong** | wrong | 3.0% | 86% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-environment.jpg) |
| Settings > Git `settings-git` | **matches** | matches | 4.8% | 92% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-git.jpg) |
| Settings > ports `settings-ports` | **missing** | missing | n/a | n/a | - | OpenConductor's settings have no ports page |
| Settings > Appearance `settings-appearance` | **wrong** | wrong | 6.0% | 89% | "active"; "function sum(a, b) { return a + b; }"; "account menu"; "search settings" | [diff](../ui-map/diff/settings-appearance.jpg) |
| Settings > Keyboard shortcuts `settings-key-bindings` | **wrong** | wrong | 5.2% | 37% | - | [diff](../ui-map/diff/settings-key-bindings.jpg) |
| Settings > Experimental `settings-experimental` | **matches** (changed) | wrong | 3.4% | 95% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-experimental.jpg) |
| Settings > Advanced `settings-advanced` | **wrong** | wrong | 7.4% | 88% | "account menu"; "search settings"; "search settings shortcut"; "browse for executable" | [diff](../ui-map/diff/settings-advanced.jpg) |
| Settings > Big terminal `settings-terminal` | **missing** | missing | 3.2% | n/a | - | [diff](../ui-map/diff/settings-terminal.jpg) |
| Settings > internal `settings-internal` | **missing** | missing | n/a | n/a | - | OpenConductor's settings have no internal page |
| Settings > tide-web > Environment `settings-repo-environment` | **wrong** | wrong | 2.7% | 88% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-repo-environment.jpg) |
| Settings > tide-web > Git `settings-repo-git` | **matches** | matches | 3.6% | 91% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-repo-git.jpg) |
| Settings > tide-web > Scripts `settings-repo-scripts` | **wrong** | wrong | 3.5% | 67% | "commands that run when workspaces are se"; "runs before a workspace is archived"; "run scripts"; "shortcuts for quick actions, like runnin" | [diff](../ui-map/diff/settings-repo-scripts.jpg) |
| Settings > tide-web > Actions `settings-repo-actions` | **wrong** | wrong | 6.1% | 74% | "fix errors preferences"; "add custom instructions sent to the agen"; "resolve conflicts preferences"; "add custom instructions sent to the agen" | [diff](../ui-map/diff/settings-repo-actions.jpg) |
| Settings > tide-web > Misc `settings-repo-misc` | **wrong** | wrong | 6.2% | 92% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-repo-misc.jpg) |
| Settings > tide-web > Misc, scrolled to Remove repository `settings-repo-misc-lower` | **wrong** | wrong | 6.4% | 92% | "account menu"; "search settings"; "search settings shortcut" | [diff](../ui-map/diff/settings-repo-misc-lower.jpg) |
| Settings > Organization > github `settings-org-github` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > members `settings-org-members` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > preferences `settings-org-preferences` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > computer `settings-org-computer` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > environment `settings-org-environment` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > mcp `settings-org-mcp` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Organization > prompts `settings-org-prompts` | **missing** | missing | n/a | n/a | - | OpenConductor has no organization settings |
| Settings > Cloud setup `settings-cloud-setup` | **missing** | missing | n/a | n/a | - | OpenConductor has no cloud settings |
| Settings search `settings-search` | **missing** | missing | 4.7% | n/a | - | [diff](../ui-map/diff/settings-search.jpg) |
| Command palette `palette-all` | **wrong** | wrong | 6.9% | 47% | "add project"; "toggle theme"; "toggle zen mode"; "send feedback" | [diff](../ui-map/diff/palette-all.jpg) |
| Command palette: Workspaces tab `palette-workspaces` | **wrong** | wrong | 23.0% | 77% | "open project"; "open github project"; "quick start"; "all projects" | [diff](../ui-map/diff/palette-workspaces.jpg) |
| Command palette: search `palette-search` | **wrong** | wrong | 17.5% | 76% | "open project"; "open github project"; "quick start"; "navigation" | [diff](../ui-map/diff/palette-search.jpg) |
| Clone GitHub repo dialog `dialog-clone-github` | **wrong** | wrong | 5.0% | 76% | "open project"; "open github project"; "quick start"; "choose a recent repo or paste a clone ur" | [diff](../ui-map/diff/dialog-clone-github.jpg) |
| Create project dialog `dialog-create-project` | **wrong** | wrong | 7.7% | 80% | "open project"; "open github project"; "quick start"; "gstack" | [diff](../ui-map/diff/dialog-create-project.jpg) |
| Rename workspace dialog `dialog-rename-workspace` | **wrong** | wrong | 4.3% | 74% | "open project"; "open github project"; "quick start"; "archive workspace" | [diff](../ui-map/diff/dialog-rename-workspace.jpg) |
| Keyboard shortcuts dialog `dialog-keyboard-shortcuts` | **wrong** | wrong | 5.7% | 73% | "open project"; "open github project"; "quick start"; "view pricing" | [diff](../ui-map/diff/dialog-keyboard-shortcuts.jpg) |
| Account / computer menu `menu-account` | **wrong** | wrong | 7.3% | 69% | "open project"; "open github project"; "quick start"; "log out" | [diff](../ui-map/diff/menu-account.jpg) |
| Workspace context menu `menu-workspace-context` | **wrong** | wrong | 6.1% | 79% | "open project"; "open github project"; "quick start"; "view pricing" | [diff](../ui-map/diff/menu-workspace-context.jpg) |
| Workspace context menu > Set status `menu-workspace-status` | **wrong** | wrong | 7.5% | 75% | "open project"; "open github project"; "quick start"; "archive workspace" | [diff](../ui-map/diff/menu-workspace-status.jpg) |
| Composer model picker `menu-model-picker` | **missing** (changed) | wrong | 10.3% | n/a | - | [diff](../ui-map/diff/menu-model-picker.jpg) |
| Sidebar repo actions menu `menu-repo-actions` | **wrong** | wrong | 5.4% | 73% | - | [diff](../ui-map/diff/menu-repo-actions.jpg) |
| Help menu `menu-help` | **wrong** | wrong | 10.3% | 67% | "open project"; "open github project"; "quick start"; "discord" | [diff](../ui-map/diff/menu-help.jpg) |
| Toast: copied link `toast-copied-link` | **wrong** | wrong | 5.7% | 69% | "open project"; "open github project"; "quick start"; "archive workspace" | [diff](../ui-map/diff/toast-copied-link.jpg) |
| Sidebar after archiving a workspace `sidebar-after-archive` | **wrong** (changed) | matches | 4.3% | 88% | "archive workspace"; "view pricing" | [diff](../ui-map/diff/sidebar-after-archive.jpg) |


### Status changes since `c3c7b31`

- `settings-experimental` wrong → **matches** (t24 4.9% → 3.4%, copy 88% → 95%).
- `sidebar-after-archive` matches → **wrong**: copy fell below 90% because "archive workspace" (the row's archive tooltip/label) and "view pricing" (the FREE badge) are not on OpenConductor's screen. Pixels unchanged (4.3%).
- `menu-model-picker` wrong → **missing**: a lane artefact plus a real difference. Since #561 the composer chip reads "Opus 4.8 High" (Settings › Default models default `opus`), while Conductor's reads "Opus 5", so the lane's `"Opus 5"` click matches nothing and the menu never opens.

### Native pass on the Mac (not completed)

- **Conductor, real window:** REA `observe-native-ui` refused (`screen-recording-denied`; REA-GAPS 20). The live Conductor had a running agent, so it was not clicked. The only native Conductor references remain Sven's captures in `~/oc-native-refs/` (6 Conductor images; `conductor-main.png` and `conductor-settings-general.png` are the same file, sha256 `552d17f4…`, so there is no native Settings reference).
- **OpenConductor, built app:** the CI build of `0b89bf8` (`~/OpenConductor-ci-0b89bf84`, ad-hoc signed) was copied as `OCFinalPass2` on a throwaway HOME with three fixture repos and captured once through Reason's computer tool (Home with sidebar, light theme). The rest of the walk failed: the Mac's load average was 88 on 18 cores from other Sessions' builds, computer use returned a run of transient errors, and a later snapshot resolved to another Session's OpenConductor window with the same bundle id, so the run stopped there rather than click in someone else's app (reported to the Reason team). The copy was quit and left in `~/ocfp-75177d01`.
- **Launch crash, again:** the first copy, run from `/tmp`, panicked in setup with `Failed to setup app: error encountered during setup hook: unknown path` (tauri `app.rs:1444`), the crash run 1 recorded; the same bundle moved under `~` launched. That points at `/tmp` → `/private/tmp` canonicalisation of the resource dir, not at the identifier change run 1 suspected; not confirmed.

### Gaps found in this pass (owning node)

1. **Native menu bar** (`header` / shell): 7 of 8 Help items, Check for Updates, Settings... (⌘,), custom Quit and Window › Close Window are missing. Diagnostics... routes to `/diagnostics`, which OpenConductor does not have. ([coverage §1](../ui-map-coverage.md))
2. **`/diagnostics` page** (shell): reachable by every Conductor user from Help; missing.
3. **Big terminal placement** (`settings-more`): Conductor appends the tab to the last group (More, after Advanced); OpenConductor shows it as a separate untitled group.
4. **Keyboard shortcuts settings page** (`settings-personal`): Conductor shows it only to internal users; OpenConductor lists it for everyone.
5. **Default model chip** (`chat`): "Opus 4.8 High" vs Conductor's "Opus 5".
6. **Home with projects** (`home`): OpenConductor's Home turns into a workspace list ("Today", search, Create workspace) once a workspace exists; Conductor keeps the wordmark, three cards and the cities line ([diff](../ui-map/diff/home.jpg)). Wordmark, card icons (globe vs cloud, folder-plus vs sparkle), cities line and FREE badge still differ ([diff](../ui-map/diff/sidebar-after-archive.jpg)).
7. **Command palette** (`dialogs-menus`): opens anchored to the top of the main pane at a different width; Conductor centres it over the window (t24 23.0% for the Workspaces tab, [diff](../ui-map/diff/palette-workspaces.jpg)).
8. **Workspace header** (`header`): Conductor shows `repo › branch ···`, the Open in split button, a PR status and the right-panel toggle; OpenConductor shows `repo / name` with branch chips ([diff](../ui-map/diff/workspace-chat.jpg)).
9. **Harness gaps that keep states unverified** (tools/ui-map): seed `experimental_big_terminal_mode = true` for `settings-terminal`; a not-yet-onboarded seed for `first-run-onboarding`; a DOM-dispatched click for `menu-repo-actions`; update the `menu-model-picker` selector; `settings-search` has no search input in OpenConductor (a real missing control: Conductor's "Search settings ⌘F"). 686 of 898 inventory items are still on no captured screen.

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
