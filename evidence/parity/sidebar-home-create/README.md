# Parity: sidebar, Home and Create workspace

Verifier output for the sidebar, Home and Create-workspace areas. Each item is scored against Conductor v0.87.6 REA evidence on main. This folder contains no feature code.

## Sidebar re-read on main (`5045114`, 2026-11-05)

The 33 sidebar items were re-read on `5045114`; Home and Create verdicts are unchanged from `884f1f7`. Sidebar parity is **54.5%** (12 implemented, 9 partial, 6 backend only, 6 missing), all areas **52.9%**, 45 builder obligations open (21 sidebar).

- Closed: `top-bar`, `primary-nav`, `workspaces-group`, `ws-branch`, `search`, `footer-actions`, `colors`.
- Moved up: `computer-switcher` (missing to partial: the row exists, no name, no menu), `ws-unread` (backend to partial: unread rows render semibold, nothing sets them).
- `colors` was measured again with REA `capture-browser-scenario` and `compare-web-screenshots` (threshold 24) through `tools/sidebar-screens/`: the sidebar region (x<256) differs by 0.90% dark / 0.88% light populated, 0.62% collapsed and 0.61% / 0.59% on empty Home. Evidence IDs are in [screens/rea-compare-5045114.json](screens/rea-compare-5045114.json).

## Result on main (`884f1f7`, 2026-11-05)

| Area | Items | Implemented | Partial | Backend only | Missing | Verified parity | Previous (`d846158`) |
|---|---|---|---|---|---|---|---|
| Sidebar | 33 | 5 | 10 | 7 | 11 | **35.6%** | 22.7% |
| Home | 18 | 4 | 7 | 0 | 7 | **41.7%** | 31.9% |
| Create workspace | 17 | 7 | 6 | 2 | 2 | **61.8%** | 20.6% |
| **All** | 68 | 16 | 23 | 9 | 20 | **43.8%** | 24.6% |

Each item is weighted: implemented 1, partial 0.5, backend only 0.25, missing 0. "Backend only" means the logic or a registered Tauri command exists and is tested, but nothing in the UI reaches it. Per-item findings are in [sidebar-home-create.main.md](sidebar-home-create.main.md). Every item that is not implemented is filed as a builder obligation in [builder-obligations.md](builder-obligations.md) (52 open).

**What changed since `d846158`.**

- **Create workspace is now wired to the backend.** `CreateWorkspaceDialog.tsx` calls `add_repository`, `list_branches` and `create_workspace`. It shows the city-name placeholder and validation errors, and it renames the workspace after the first message through `rename_workspace_branch`. Cmd+N, the sidebar row, each repo's "+" and the palette all open it.
- **Open project is real.** The sidebar "+" and the Home card use the native picker, then `inspect_project_folder` (`src-tauri/src/project.rs`) and `add_repository`. Errors appear as toasts.
- **Palette handlers cover sidebar navigation.** `PaletteHost.tsx` handles go-home, next and previous workspace, Cmd+1..9 and workspace search.
- **The DB crate gained workspace setters, but it is still not linked into the app.** `crates/openconductor-db` now has pin, unread, manual and derived status, archive and unarchive, hidden and icon setters. `src-tauri/Cargo.toml` does not depend on it, so these count as backend only.

**Still the main gaps.**

- Setup never runs on create.
- The sidebar and Home still read the localStorage shell state, not `list_workspaces` or the DB.
- Archive deletes a localStorage row with no confirmation.
- The sidebar structure and colours still differ from the reference.

## Screen comparison (REA)

Captured on this machine with REA 6.8.0 `capture-browser-scenario` (Chromium 155, 1440x900, same locale and timezone as the references) on the Vite build of `884f1f7`. Compared with `compare-web-screenshots`. All Evidence IDs are in [screens/rea-compare-884f1f7.json](screens/rea-compare-884f1f7.json). The populated captures seed the shell's localStorage with 3 repositories and 6 workspaces shaped like the reference fixture.

| Pair (reference vs ours) | Changed pixels, threshold 0 | Threshold 24 | Comparison Evidence (t=24) |
|---|---|---|---|
| Populated sidebar, dark: `sidebar--repos-expanded--dark` vs [ours](screens/ours-sidebar-populated-dark.png) | 100% | 4.36% | `ev_3accc141…` |
| Populated sidebar, light: `sidebar--repos-expanded--light` vs [ours](screens/ours-sidebar-populated-light.png) | 100% | 4.39% | `ev_d67f80ba…` |
| Create, dark: `create-workspace--from-repo--dark` vs [ours](screens/ours-create-dialog-dark.png) | 100% | 7.62% | `ev_90c92854…` |
| Create, light: `create-workspace--no-repo--light` vs [ours](screens/ours-create-dialog-light.png) | 100% | 89.09% | `ev_78687f2f…` |
| Empty Home, dark: `home--empty-signed-in--dark` vs ours | 100% | 3.73% | `ev_e74c2b2e…` |

What the captures show:

- **Populated sidebar.** The reference has, from top to bottom:
  1. A toggle and back/forward arrows.
  2. A computer switcher.
  3. Home, Create and Search rows.
  4. A "My workspaces" label.
  5. Repo rows with an initial avatar, a count and hover "..." / "+" actions.
  6. Workspace rows with a branch icon and the branch-style title, with unread rows bold.
  7. A help and settings footer.

  Ours has the logo, Home and "New workspace" rows, an uppercase "Repositories" header, chevron repo rows, workspace rows with a status dot and short name, and a version footer. The diff stat on a row matches (+15 -1). The sidebar edge is at x=248 vs 256.
- **Create.** The reference is a centred composer with:
  - a repo chip and a "..." menu
  - a prompt area
  - a model and effort picker
  - an attach button and a Create button

  Ours is a titled modal form with a prompt box, Create from, Repository, Base branch and Workspace name fields, and Cancel/Create buttons.

  In light theme the reference dims the whole window to mid-grey behind the composer and ours uses a light scrim. That causes most of the 89%. The light reference is also the no-repo state, while ours has repositories, so the layout comparison there is approximate.
- **Colours.** These are unchanged since the last pass. Ours are cool greys (dark sidebar #121417, main #17191d). The reference uses warm near-blacks (#1c1817, #141110).

## Gap list, by priority

The full list, with the owner of each item, is in [builder-obligations.md](builder-obligations.md).

1. **Run setup on create, and show it** (owner: create-workspace, with setup-and-run-scripts). Call the setup lifecycle from `crates/scripts` after `create_workspace`, and keep its log. Show initializing and setting-up states on the new workspace. Respect `auto_run_after_setup`. Clean up incomplete workspaces on start. Items: `create.setup-script`, `create.initializing`, `create.failure`, `create.autostart-run`.
2. **Load the sidebar and Home from the backend** (owner: sidebar and home, with persistence). Link `crates/openconductor-db` into the app. Read repositories and workspaces from it, or from `list_workspaces`, instead of localStorage. This lifts 7 backend-only sidebar items at once: `repo-hide`, `repo-icon`, `repo-order`, `ws-pinned`, `ws-unread`, `rename`, `archived-view`.
3. **Rebuild the sidebar to the reference structure** (owner: sidebar): `sidebar.top-bar`, `computer-switcher`, `primary-nav` (add Search), `workspaces-group`, `footer-actions`, `colors` (256 px width, warm tokens), row titles and icons (`ws-name`, `ws-branch`).
4. **Make archive safe** (owner: sidebar). Call `WorkspaceManager::archive` through a command, with confirmation and the git-busy refusal. Add an archived view with restore (`sidebar.archive`, `sidebar.archived-view`).
5. **Match the create composer** (owner: create-workspace). Use the reference layout and the dimmed backdrop, with a model and effort picker. List PRs and issues so Create from works in the desktop app. Read the branch-prefix settings. Start the agent session with the first message. Items: `create.page`, `create.from-ref`, `create.branch-prefix`, `create.first-message`.
6. **Finish Open project** (owner: home). Add the init / create-GitHub-repo dialog for folders with no `.git` or no origin (`home.open-project-flow`). Add a real clone with progress (`home.clone-github`). Make quick start do a git init and create the first workspace (`home.new-project`).
7. **Use the workspace status model** (owner: sidebar): derived status plus a manual override (`sidebar.ws-status`).
8. **Add the remaining sidebar features** (owner: sidebar): sections and drag, workspace numbers shown in rows, the row actions menu, the add menu with recents, resizing and its persisted width, transparency, footer usage.
9. **Add the remaining Home features** (owner: home): routes, dashboard, recents on Home and in the clone dialog, repo search, first run, the theme colours.

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

Detectors only test presence. For example, a schema column in the unwired DB crate counts as a match. The score comes from the verdicts. On `884f1f7`, the 3 remaining `(recheck)` flags match only schema in the unlinked DB crate (`sidebar.sections`, `create.in-section`) or a detector that finds no settings key (`sidebar.visibility-settings`, where the verdict credits the persisted toggle).

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
- **Reference coverage.**
  - The references are Chromium renders, not WKWebView.
  - PR #81 and PR #115 added populated-sidebar, create and menu references, so this pass scores sidebar and create layout.
  - There is still no reference for the archived view, the sections UI or the clone dialog. Those items are scored from code only.
