# Parity: sidebar, Home and Create workspace

Verifier output for the sidebar, Home and Create-workspace areas. Each item is scored against Conductor v0.87.6 REA evidence on main. This folder contains no feature code.

## Result on main (`99edc40`, 2026-11-05)

| Area | Items | Implemented | Partial | Backend only | Missing | Not applicable | Verified parity | `274ac80` | `962f017` | `66a892a` | `df07012` | `4b9dc87` | `d8b3b2e` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sidebar | 33 | 25 | 5 | 1 | 2 | 0 | **84.1%** | 79.5% | 78.0% | 75.0% | 70.5% | 65.9% | 65.9% |
| Home | 18 | 13 | 4 | 0 | 0 | 1 | **88.2%** | 88.2% | 88.2% | 88.2% | 88.2% | 85.3% | 62.5% |
| Create workspace | 17 | 14 | 2 | 0 | 1 | 0 | **88.2%** | 88.2% | 88.2% | 88.2% | 88.2% | 82.4% | 79.4% |
| **All** | 68 | 52 | 11 | 1 | 3 | 1 | **86.2%** | 84.0% | 83.2% | 81.7% | 79.5% | 75.0% | 68.4% |

**Since `274ac80`.** Read on `99edc40`. Merges: #423 (`99edc40`, sidebar add-repository menu, rail and native sidebar menu items), and #415, #418 and #422 (evidence, diff theme and chat; no item here).

- `sidebar.add-menu` partial to implemented (#423): "Add project…" in the My workspaces header menu, and ⌥⌘A, open the add-repository popover (Conductor's `wra`) with the shared body `Gji`: Open project, Open GitHub project, Quick start, then "Recents" with a spinner row while loading. Recents come from `recent_local_repos.rs`, a port of Conductor's `MQo` script (zsh history `cd` targets plus `.git` directories under fixed roots, newest first, at most 8), minus folders already added; a Recents row adds its folder through Open project's checks.
- `sidebar.resize-toggle` partial to implemented (#423): the old verdict was stale, since the rail has resized and saved `left_panel_width` since #332. #423 matches Conductor's rail `Nta` (drag previews, release saves, cancel reverts, double-click resets to 256, 40% window cap) and adds View > Toggle Left Sidebar / Toggle Right Sidebar beside ⌘B and ⌥⌘B. REA gap: which submenu Conductor puts those items in was not decompiled.
- `sidebar.visibility-settings` partial to implemented (stale since #332): `left_panel_visible`, `left_panel_width` and `right_panel_visible` are rows in conductor.db's settings table, as in Conductor.

**Since `962f017`.** Read on `274ac80`. Merges: #400 (`be4f789`, Copy link), #391 (`274ac80`, full workspace archive and unarchive), #411 and #395 (evidence only).

- `sidebar.ws-actions` partial to implemented (#400): the row menu now has every action Conductor's has, including Copy link with the ⌘⇧C hint, copying `openconductor://workspace?id=<id>` with Conductor's "Copied link" / "Failed to copy link" toasts. The copied link opens nothing until `app.deep-link` (unowned, outside this folder) handles `openconductor://` URLs.
- `sidebar.archive` stays partial, much narrower (#391): every archive path (row menu, WorkspaceView, palette, archive on merge) runs `archive_workspace`, which checkpoints the worktree, refuses while a git operation is in progress (sticky warning with an Archive retry that discards the operation state), records the archive commit under `refs/conductor-archive-heads/<id>`, runs the archive script and removes the worktree, following Conductor's `dYe`/`mYe`. The running-agents dialog matches Conductor's only confirmation. Left: "Stop agents and archive" does not cancel the running chat turn.
- `sidebar.archived-view` stays backend only: `unarchive_workspace` replaces `db_unarchive_workspace` and restores the worktree, checkpoint, `.context` and branch, but only the archive-on-merge toast can call it; there is still no archived-workspaces list.

**Since `df07012`.** Read on `66a892a`. Merges: #370 (sidebar sections, row status from every chat, 5-minute PR lookup for on-screen rows, Conductor's label rule), `407e222` (#271, #365: chat model/effort and queue keys; no item here), #384 (evidence only), #345 and #386 (settings rows and settings in conductor.db; no item here).

- `sidebar.sections` missing to implemented (#370): create, edit (name and emoji) and delete from the section header menu and New section…; Move to section ▸ and Remove from section in the row menu. Edits follow Conductor's `_Y`/`SY`/`wY`/`yY`/`kY`/`V2`, the projection follows `usa`, and the whole layout goes through `db_read_navigation_sections` / `db_write_navigation_sections` into conductor.db. Section reorder (`bY`) has no UI yet.
- `sidebar.ws-name` partial to implemented (#370): a stored `workspace_name` now shows before the PR title even when not user-set, the configured branch prefix is stripped before prettifying, and the target is `intended_target_branch ?? "main"`, as in Conductor's `$V`.
- `sidebar.ws-actions` stays partial, narrower: Move to section ▸ is in the row menu; only Copy link (Cmd+Shift+C) is missing.
- `sidebar.ws-status` stays partial, narrower: the session status is aggregated over every chat of the workspace and every on-screen row polls its PR every 5 minutes (Conductor's `G5e`). The chat queue still has only idle/working/cancelling/error, so the needs-* and waiting states never reach the icon.
- `sidebar.drag-to-section` stays missing: the sidebar's only drag reorders repository groups; rows are not draggable and sections are not drop targets.

**Since `4b9dc87`.** Read on `0f82f19`. Merges: #315 (sidebar repo icon, Rename workspace dialog, Filter by project mount with `sidebar_repo_filter` in conductor.db), #383 (an E2E test only, no item), #323 (this folder only). Main has since moved to `247d5a1` (#345, #386, #392: settings rows, settings in conductor.db, packaging records), which touches no sidebar, Home or create code; `colored_sidebar_diffs` moving into the settings table does not change `ws-diffstat`. `df07012` (#366, archive on merge for every workspace) registers `db_unarchive_workspace`, reached only from the archive-on-merge toast's Unarchive, so `sidebar.archived-view` stays backend only with new detail; its PR polling dispatches no row PR state, so `ws-status` is unchanged. #305 was re-read: its squash title says evidence, but it carries the numbering code, so the earlier "evidence only" reading of it was wrong.

- `home.repo-search` partial to implemented (#315): the section header's Filter by project submenu is mounted and narrows the repo groups (Pinned stays unfiltered), and the desktop app saves the choice as conductor.db's `sidebar_repo_filter` setting (raw repository id; All projects deletes the row), as Conductor's `z6t` does. The localStorage difference noted last pass is gone; only the browser build, which has no database, still uses localStorage.
- `sidebar.repo-icon` backend only to implemented (#315): `RepoIcon` follows Conductor's `U9` fallback order, the Change icon dialog has Icons (238 names), Emoji, Favicon and Upload, and `db_set_repo_icon` writes `repos.icon`. The Emoji tab is a curated subset (REA could not extract Conductor's runtime emoji dataset).
- `sidebar.rename` backend only to implemented (#315): `db_rename_workspace` follows Conductor's `renameWorkspace` (sibling symlink for a ready worktree, refusals for initializing, taken and invalid names) and saves `workspace_name` with `user_set_workspace_name = 1`; Also rename branch sets `user_set_branch_name`. No CLI `workspace rename` (the rebuild has no CLI).
- `create.number` missing to implemented (#305): `begin_workspace` numbers the row with `next_number` (highest `workspaces.number` plus one), `finish_workspace` keeps it, and the Home list matches `W-<n>`. The detector now also matches `next_number`. Showing numbers on rows stays with `sidebar.ws-numbers`.
- `sidebar.ws-actions` stays partial: the row menu now has Rename; Copy link and Move to section are still missing.
- `sidebar.ws-name` stays partial, narrower: rename sets `user_set_workspace_name`, which closes last pass's gap. REA on Conductor's `$V` (`renderApp-D_fmY7hW.js` @2,153,907) shows two differences left: Conductor shows a stored `workspace_name` before the PR title even when it is not user-set, and it strips the configured branch prefix before prettifying the branch.
- `create.page` stays partial: #388 (composer and full-screen `/create`) is open, not merged.
- `home.first-run` (implemented) and `home.org-states` (not applicable) are unchanged: nothing since #381 touches onboarding.

**Since `d8b3b2e`.** Read on `4d72807`; `4b9dc87` adds #373 (the diff target ref), which changes no item in these areas. Merges in these areas: #322, #343, #350, #354, #379 and #381 (Home), #327, #375 and #379 (create), #337 and #344 (sidebar row).

- `home.route` partial to implemented (#322): `{kind: "root"}` is `/`, the start screen unless a workspace was open, and the fallback when the open workspace or its repository goes away.
- `home.first-run` missing to implemented (#381): `FirstRunGate` shows `/first-run-onboarding` on a fresh install with no repositories (`first_time_onboarding_step` in the settings table), as Conductor's `Pya`/`Bxa` do.
- `home.new-project` partial to implemented (#350): Quick start creates the real first workspace and starts its setup script. The feature was re-worded: the GitHub repo step is required in Conductor's Quick start (`gbi`), not optional.
- `home.duplicate-repo` backend only to partial (#343, #379): a second clone of an added remote is its own project in a `<name>-v1` folder. Open project still refuses an already-added folder (`REPO_EXISTS`), where Conductor adds a second row.
- `home.status-overview` missing to partial (#322): the Home list at `/all-workspaces` groups rows by last activity with unread, diff stat and relative time, but the status column shows only "working".
- `home.dashboard-routes` missing to partial: `/all-workspaces` exists; `/dashboard` (REA: route `lta`, shown in the sidebar when `dashboard_enabled` is on, default off) does not.
- `home.recent` stays partial, re-read with REA: "Recent workspaces" is the palette's heading, backed by a persisted `recentWorkspaceIds` capped at 5. Ours is in memory only and capped at 8.
- `home.org-states` missing to **not applicable** (new verdict `n/a`, left out of verified parity and obligations): Conductor's loading and cloud-redirect states come from its cloud organizations API, which a local-only app does not have (REA in `evidence/screens/first-run-onboarding.md`, #381).
- `home.repo-search` stays partial: #354's Filter by project submenu is on main but not mounted. Sidebar PR #315 mounts it and keeps the filter in localStorage, not Conductor's `sidebar_repo_filter` settings row; that difference will be scored once #315 merges.
- `create.worktree` partial to implemented (#375): the `conductor_root_path` setting moves workspaces under `<root>/workspaces/<repo>`, editable in Settings › Advanced and shown per repo. Default root is the app data directory, not `~/conductor`.
- `create.initializing` stays partial with new detail (#327): a pending "Creating workspace..." row shows in the sidebar, but there is no initializing view or log.
- `sidebar.ws-name` and `sidebar.ws-status` stay partial (#344): the PR title is now saved and read back, but no rename sets `user_set_workspace_name`, and the row icon still never sees PR state for unopened workspaces or any needs-* session status.

**Since `8229113`.** #324 took `create.autostart-run` from partial to implemented (Settings › Experimental "Auto-run after setup", re-read on `7e75c2d`). `home.repo-search` was re-anchored (verdict unchanged, partial): REA on Conductor 0.87.6 (`renderApp-D_fmY7hW.js`, sha256 matches the asset manifest; Home builder 68dc657c, PR #354, offsets spot-checked by the verifier) shows Home and the Add-repository menu have no repository search. The old anchors ("Search repositories...", "No matching repositories.", "Loading repositories...") are the cloud GitHub repo picker (`mfa`, @10,435,221), which has no local surface. Local narrowing is the palette Projects tab ("Search projects...", already built) and the sidebar section header's "Filter by project" submenu (`pra`, @10,019,058: shown with more than one repository, "All projects" then each repository, "All projects" deletes `sidebar_repo_filter`). #354 adds that logic and submenu, tested but not mounted; the item closes once the sidebar owner mounts it in the section header menu and filters the repo groups.

**Since `0e2531b` (#289).** Four sidebar merges landed: #283 (hide/unhide repositories, show-hidden toggle, drag to reorder, repo menu) and the row-menu series #288, #293 and #312. Their items were re-read on `8229113`:

- `repo-order` partial to implemented: drag reorder writes `repos.display_order` through the registered `db_reorder_repos` (`sidebar_repo_commands.rs`).
- `repo-hide` backend only to implemented: Hide/Unhide repository in the repo menu, a Show hidden repositories toggle, and `db_set_repo_hidden` writes `repos.hidden`.
- `ws-pinned` partial to implemented: pins are now written through `db_set_workspace_pinned` (`sidebarPersist.ts`) and read back on reload.
- `ws-diffstat` partial to implemented: row counts come from the registered `sidebar_workspace_changes`, and unselected rows stay muted unless `colored_sidebar_diffs` is on.
- Still partial, with new detail: `ws-unread` is now saved (`db_set_workspace_unread`) but has no jump-to-next-unread command; `ws-status` saves the manual status (`db_set_workspace_manual_status`) but the row icon still ignores it; `ws-numbers` shows 1..9 hints while the switch modifier is held (`shortcutHint.ts`) but not the `workspaces.number` column.
- `home.duplicate-repo` re-worded and partial to backend only. Home builder c93ae9dd's REA read of Conductor 0.87.6 (decoded index chunk, `createRepo`) shows Clone and Open project never check for an already-added repo: a second add inserts a new `repos` row and Clone picks a unique folder (`name-v1`). The real `conductor.schema.sql` agrees: `repos` has no unique constraint on `remote_url` or `root_path`. "This repository already exists." is the GitHub repo-name check, so that copy reference was dropped. The old wording ("refuse a duplicate") was wrong. Against the corrected wording the rebuild diverges in every UI path (`REPO_EXISTS` refusal in Open project and the Add-repository menu, store drops the Clone result); only the tested `clone_repository` unique-folder logic matches.
- #305 was read as create-workspace evidence only, so `create.number` stayed missing; corrected on `0f82f19` (it carries the numbering code).

Each item is weighted: implemented 1, partial 0.5, backend only 0.25, missing 0; an item marked not applicable (`n/a`) is left out. "Backend only" means the logic or a registered Tauri command exists and is tested, but nothing in the UI reaches it. Per-item findings are in [sidebar-home-create.main.md](sidebar-home-create.main.md). Every item that is not implemented is filed as a builder obligation in [builder-obligations.md](builder-obligations.md) (22 open; 26 on `4b9dc87`, 31 on `d8b3b2e`, 36 on `0e2531b`, 45 before).

All 68 items were re-read on `85e00bb`. The diff from there to `0e2531b` was then read too, and the 6 items it touches were re-read on `0e2531b`: #278 (row menu, pins, unread, status) and #269 (Home card tokens). Compared with the last verdicts on main, 17 items changed: 16 up and 1 down.

**What changed from the last verdicts to `0e2531b`** (`5045114` for the sidebar, `884f1f7` for Home and Create).

- **The sidebar has a row actions menu** (#278): mark read/unread, pin into a Pinned group, set status (manual, then derived, then in-progress), and archive. `ws-actions` moved from missing to partial, and `ws-pinned` from backend only to partial. These changes are local state only: nothing writes them back to conductor.db yet.
- **Home colours match** (#269). The card fill and border are pixel-identical to the reference in both themes, so `home.colors` is now implemented.
- **conductor.db is the source of truth in the desktop app** (#224). `crates/openconductor-db` is linked. The sidebar and Home load from `db_list_repos` and `db_list_workspaces`. Add, clone, create, rename and archive write rows, and startup removes incomplete workspaces. `home.persist` and `create.failure` are now implemented. `repo-order` went from backend only to partial, because the sidebar now uses the DB order.
- **Create runs setup and starts the agent.** The dialog calls `scripts_config` and `setup_script_start`, which run on the now-linked `oc-scripts`, and shows the setup log. The first message is sent to Reason (#194). PR and issue lists come from `pr_list_open` and `gh_issue_list_open` (#203). Settings › Git feeds the branch prefix. `setup-script`, `first-message`, `from-ref` and `branch-prefix` are now implemented.
- **Home's project flows are real.** Clone runs `clone_repository` with streamed progress and recent repositories (#230, #189). A folder with no `.git` or no origin opens a dialog that runs git init and creates the GitHub repo (`github_repo_create`). Quick start runs `create_new_project`.
- **One verdict went down after a closer read.** `create.worktree` dropped to partial: the workspaces directory is fixed, and no setting changes it. `create.autostart-run` went up from backend only to partial. Auto-run after setup now works, but only the repo scripts config file can turn it on.

**Still the main gaps.**

- Sidebar row state does not round-trip. Pin, unread and status changes are never written to conductor.db. The row icon still shows the old status model. Diff stats are 0/0 from the DB, and the user-set name is not mapped.
- There is no user rename, no repo hide or icon, no archived view and no safe archive. The row menu has no copy-info or section items.
- Home has no workspace overview, no dashboard routes and no first run.

## Screen comparison (REA)

Captured on this machine with REA 6.8.0 `capture-browser-scenario` (Chromium, 1440x900, same locale and timezone as the references) on the Vite build of `0e2531b`, using `tools/sidebar-screens/capture.mjs`. Compared with `compare-web-screenshots` through `tools/sidebar-screens/compare.py`. The comparison Evidence IDs are in [screens/rea-compare-0e2531b.json](screens/rea-compare-0e2531b.json). The populated captures seed localStorage with 3 repositories and 6 workspaces shaped like the reference fixture (the browser build has no Tauri, so it still reads localStorage).

| Pair (reference vs ours) | Whole frame, t=24 | Sidebar x<256, t=24 | Whole frame on `884f1f7` | Capture Evidence |
|---|---|---|---|---|
| `sidebar--repos-expanded--dark` vs [ours](screens/ours-sidebar-populated-dark.png) | 2.80% | 0.90% | 4.36% | `ev_f0e80361…` |
| `sidebar--repos-expanded--light` vs [ours](screens/ours-sidebar-populated-light.png) | 2.70% | 0.88% | 4.39% | `ev_127ac024…` |
| `sidebar--repos-collapsed--dark` vs ours | 2.75% | 0.62% | - | `ev_38fc1662…` |
| `home--empty-signed-in--dark` vs [ours](screens/ours-home-empty-dark.png) | 2.71% | 0.61% | 3.73% | `ev_8137d269…` |
| `home--empty-signed-in--light` vs [ours](screens/ours-home-empty-light.png) | 2.60% | 0.59% | - | `ev_4b5732b8…` |

Pixel samples from the same captures:

| Point | Reference | Ours |
|---|---|---|
| Sidebar fill, dark / light | #1c1817 / #fcfcfb | #1c1817 / #fcfcfb |
| Main background, dark / light | #141110 / #ffffff | #141110 / #ffffff |
| Home entry card fill, dark / light | #211e1c / #fafaf9 | #211e1c / #fafaf9 |
| Home entry card border, dark / light | #373433 / #eae8e6 | #373433 / #eae8e6 |
| Sidebar right edge | x=255 | x=255 |

What is left in the frames:

- **Sidebar.** The row order, icons, section header, footer and spacing line up with the reference. The remaining differences are the computer name (we always show the default name) and how long titles truncate next to the diff stat.
- **Home.** The wordmark and the cards sit at the same positions, and the colours match. The GitHub and Quick start card icons differ. The wordmark is our own brand by design.
- **Create.** It was not re-captured in this pass, because `shots.json` has no create scenario. The create screens in [screens/](screens) are still from `884f1f7`. `create.page` is scored from code: it is still a modal form, not the reference composer.

## Gap list, by priority

The full list, with the owner of each item, is in [builder-obligations.md](builder-obligations.md).

1. **Write the row state back to conductor.db and show it** (owner: sidebar, with persistence). Register commands over `workspaces::set_pinned_at`, `set_unread` and the manual status, and call them from the row menu. Drive the row icon from the effective status. Map `user_set_workspace_name`, and supply real diff stats. Items: `ws-pinned`, `ws-unread`, `ws-status`, `ws-name`, `ws-diffstat`.
2. **Finish workspace and repo actions** (owner: sidebar). Add a rename dialog, then copy info and move to section in the row menu. Archive needs a confirmation, the git-busy refusal and `WorkspaceManager::archive`. Add an archived view with restore, and repo hide and icon. Items: `ws-actions`, `rename`, `archive`, `archived-view`, `repo-hide`, `repo-icon`, `repo-order`.
3. **Sections** (owner: sidebar, with create-workspace): `navigation_sections` commands and UI, drag to a section, and create inside a section. Items: `sections`, `drag-to-section`, `create.in-section`.
4. **Home overview and routes** (owner: home): workspace status overview, dashboard and all-workspaces routes, a '/' route, and first run. Items: `status-overview`, `dashboard-routes`, `route`, `first-run`, `org-states`.
5. **Finish Home flows** (owner: home). Quick start should create a real first workspace under the registered repo id, and the GitHub repo should be optional. Adding an already-added repo again should make a new project, as Conductor does, instead of being refused or dropped. Home should get recents, and the sidebar section header a "Filter by project" submenu (#354, mounted by the sidebar owner). Items: `new-project`, `duplicate-repo`, `recent`, `repo-search`.
6. **Create composer and initializing state** (owner: create-workspace). Build the reference composer with a model and effort picker. Show an initializing sidebar row while the worktree is created. Add a workspaces-directory setting and workspace numbers. Items: `page`, `initializing`, `worktree`, `number`.
7. **Remaining sidebar chrome** (owner: sidebar): the computer switcher menu and name, the add menu with the Home actions and recents, resize with a persisted width, a visibility setting, numbers shown in rows, transparency, and footer usage.
8. **Auto-run after setup toggle** (owner: setup-and-run-scripts): a UI for `auto_run_after_setup`, and `save_repo_scripts` writing it.

## Files

- [sidebar-home-create.checklist.json](sidebar-home-create.checklist.json) has 68 items.
  - Each item cites evidence references: copy-catalog indices, routes, schema columns, IPC keys, ledger obligations, CLI flags and evidence files such as `evidence/screens/*`.
  - Each item has regex detectors.
  - Features are described in our own words. Conductor strings are referenced by catalog index only, pinned by sha256 prefix in [sidebar-home-create.copy-pins.json](sidebar-home-create.copy-pins.json).
- [sidebar-home-create.verdicts.json](sidebar-home-create.verdicts.json) holds the verdict for each item, from reading the code on main.
- [sidebar-home-create.main.json](sidebar-home-create.main.json) and [.md](sidebar-home-create.main.md) are the scored output. [screens/](screens) holds our REA captures.
- [builder-obligations.md](builder-obligations.md) and [.json](builder-obligations.json) have one open obligation per item whose verdict is not implemented. Each obligation names an owner, other builders it depends on, the gap, a done-when rule, and the linked REA ledger obligations and evidence. It closes only when a verifier re-reads the item on main and records `implemented`.
- `tools/parity_sidebar_home_create.py` has four commands:
  - `validate` checks that every reference resolves against `evidence/`.
  - `pin` re-pins the copy indices.
  - `score --ref <git ref>` or `score --tree <dir>` scores a checkout.
  - `obligations --ref <git ref>` writes the builder obligations from the verdicts.

  CI runs `validate` and a smoke `score`.

**To re-verify after a merge:**

1. Run `python tools/parity_sidebar_home_create.py score --ref origin/main`.
2. Re-read every item marked `(recheck)`, and every item whose detector status changed.
3. Update its verdict.
4. Run `python tools/parity_sidebar_home_create.py obligations --ref origin/main --json evidence/parity/sidebar-home-create/builder-obligations.json --md evidence/parity/sidebar-home-create/builder-obligations.md`.

Detectors only test presence. For example, a schema column in the unwired DB crate counts as a match. The score comes from the verdicts. On `0e2531b`, 3 `(recheck)` flags remain. `sidebar.sections` and `create.in-section` match only the `navigation_sections` migration, which no code uses. `sidebar.visibility-settings` has a detector that finds no settings key, and its verdict credits the persisted toggle. This pass added detectors for the computer row, the section header and the palette's project search, so those no longer raise false flags.

## REA use and gaps found

- **Reference.** These sources are on main:
  - Wave 0 REA evidence: the copy catalog and routes (`analyze-javascript-application`), the schema (`inspect-sqlite-database`), the CLI help (`capture-process`) and the obligation ledger.
  - `evidence/screens/*`: REA `capture-browser-scenario` captures.
  - `evidence/screens/home.md` and `evidence/create-workspace/README.md`.
- **Comparison.** I captured our build with REA `capture-browser-scenario` (rea-agents 6.8.0, Chromium headless, same viewport and locale) and compared it with REA `compare-web-screenshots`. The other verifier's `tools/rea_compare_main.sh` already covers `compare-application-versions` on the whole tree, so I did not repeat it.
- **REA bug: `analyze-javascript-application` stalls on a small bundle.**
  - Input: PR #10's `vite build` (3 files, 163 KB) on a Linux cloud machine (2 vCPU, Node 22.23.4).
  - It hit `provider_timeout` at 300 s, then again at `--analysis-timeout-ms 900000`. The second run took 15 min of wall time but only 2 min 51 s of user CPU.
  - The partial Evidence `ev_11eebfcd2279d007895a0a6968095aaba614f8b10ff70ddd43d2415454dedb3f` shows `parsed_javascript_files: 0` and `skipped_javascript_files: 2`.
  - Conductor's 54 MB tree finished in 179 s on macOS, so this is a stall, not slow parsing.
- **REA gap: CLI and MCP shapes differ for `compare-web-screenshots`.**
  - The MCP schema takes one object `{before, after, channel_threshold}`. The CLI takes two positional artifact files plus `--channel-threshold`.
  - Passing the MCP-shaped JSON to the CLI fails with `VALIDATION_ERROR` "afterJson missing", without hinting at the positional form.
  - `--schema` shows `inputJson: string` for several workflow tools. The real schema is only in `dist/mcp-catalog-full.json` (also logged in Wave 0).
- **REA gap: no region compare.** `compare-web-screenshots` reports whole-image metrics only. It has no region or mask option, so I computed the sidebar-only vs main-area split (3.1% / 3.8% dark, 5.4% / 3.4% light at threshold 24) with Pillow on the same PNGs.
- **REA environment gap: capture fails with an opaque `execution_failure` when TMPDIR is long.**
  - Chromium aborts with "Socket path too long" for its singleton socket under this Session's TMPDIR, which is more than 100 characters long.
  - REA reports only `execution_failure` and `cleanup_incomplete`, with "Run `rea doctor`", and drops the browser's stderr.
  - Running it with `TMPDIR=/tmp/t` works.
  - REA could surface the browser's exit reason, or use a short profile directory.
- **REA gaps re-checked on `85e00bb` and `0e2531b` (rea-agents 6.8.0).**
  - The long-TMPDIR capture failure is now a hang. With this Session's 91-character TMPDIR, `capture-browser-scenario` for one Home shot had not returned when `timeout 120` fired, and the process tree outlived the timeout until the sandbox killed it after 200 s. With `TMPDIR=/tmp/t`, the same shot finished in 18 s. The likely cause is unchanged: Chromium's singleton socket path is longer than the Unix socket limit. The previous pass got a fast `execution_failure`; this one got no result and no error at all.
  - `compare-web-screenshots` still has no region or mask option. The sidebar split in the table above is computed with Pillow on the same PNGs.
  - `inspect-sqlite-database` (for `tools/parity_check.py --rea`) was run with Node.js 24.22.2 from nodejs.org, because the machine's Node.js 22.23.4 is below the version the tool really needs (gap 1 in [../README.md](../README.md)).
- **Reference coverage.**
  - The references are Chromium renders, not WKWebView.
  - PR #81 and PR #115 added populated-sidebar, create and menu references, so this pass scores sidebar and create layout.
  - There is still no reference for the archived view, the sections UI or the clone dialog. Those items are scored from code only.
