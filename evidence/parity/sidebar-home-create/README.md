# Parity: sidebar, Home and Create workspace

Verifier output for the sidebar, Home and Create-workspace areas. Each item is scored against Conductor v0.87.6 REA evidence on main. This folder contains no feature code.

## Result on main (`0e2531b`, 2026-11-05)

| Area | Items | Implemented | Partial | Backend only | Missing | Verified parity | Previous |
|---|---|---|---|---|---|---|---|
| Sidebar | 33 | 12 | 13 | 4 | 4 | **59.1%** | 54.5% (`5045114`, #261) |
| Home | 18 | 9 | 5 | 0 | 4 | **63.9%** | 41.7% (`884f1f7`) |
| Create workspace | 17 | 11 | 4 | 0 | 2 | **76.5%** | 61.8% (`884f1f7`) |
| **All** | 68 | 32 | 22 | 4 | 10 | **64.7%** | 52.9% |

Each item is weighted: implemented 1, partial 0.5, backend only 0.25, missing 0. "Backend only" means the logic or a registered Tauri command exists and is tested, but nothing in the UI reaches it. Per-item findings are in [sidebar-home-create.main.md](sidebar-home-create.main.md). Every item that is not implemented is filed as a builder obligation in [builder-obligations.md](builder-obligations.md) (36 open, was 45).

All 68 items were re-read on `85e00bb`. The diff from there to `0e2531b` was then read too, and the 6 items it touches were re-read on `0e2531b`: #278 (row menu, pins, unread, status) and #269 (Home card tokens). Compared with the last verdicts on main, 17 items changed: 16 up and 1 down.

**What changed since the last verdicts** (`5045114` for the sidebar, `884f1f7` for Home and Create).

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
5. **Finish Home flows** (owner: home). Quick start should create a real first workspace under the registered repo id, and the GitHub repo should be optional. Clone should refuse a duplicate. Home should get recents and a repo search field,. Items: `new-project`, `duplicate-repo`, `recent`, `repo-search`.
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
