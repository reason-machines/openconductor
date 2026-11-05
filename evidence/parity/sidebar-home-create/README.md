# Parity: sidebar, Home and Create workspace

Verifier output for the sidebar, Home and Create-workspace areas. Each item is scored against Conductor v0.87.6 REA evidence on main. This folder contains no feature code.

## Result on main (`d846158`, 2026-11-05)

| Area | Items | Implemented | Partial | Backend only | Missing | Verified parity |
|---|---|---|---|---|---|---|
| Sidebar | 33 | 2 | 10 | 2 | 19 | **22.7%** |
| Home | 18 | 2 | 7 | 1 | 8 | **31.9%** |
| Create workspace | 17 | 0 | 1 | 12 | 4 | **20.6%** |
| **All** | 68 | 4 | 18 | 15 | 31 | **24.6%** |

Each item is weighted: implemented 1, partial 0.5, backend only 0.25, missing 0. "Backend only" means the logic or a registered Tauri command exists and is tested, but nothing in the UI reaches it. Per-item findings are in [sidebar-home-create.main.md](sidebar-home-create.main.md).

**The main finding: the UI and the backend are not connected.**

- The frontend (`src/`) is still the localStorage scaffold. Its only `invoke` call is `app_info`.
- The six registered workspace commands are never called: `add_repository`, `list_repositories`, `list_branches`, `branch_name_is_taken`, `create_workspace` and `list_workspaces`.
- No component imports `src/workspace/createFlow.ts` or `src/workspace/naming.ts`.
- `crates/openconductor-db` has the Conductor-shaped schema and a repository model, but the app does not depend on it.

Connecting these pieces would raise 15 items from 0.25 to at least 0.5.

## Screen comparison (REA)

Both screenshots are 1440x900 Chromium renders captured with REA `capture-browser-scenario`. The reference is `evidence/screens/home--empty-signed-in--{dark,light}.png`. Ours is [screens/](screens), the Vite build of main with no repositories.

| Theme | REA `compare-web-screenshots`, threshold 0 | Threshold 24 | Our capture Evidence | Comparison Evidence (t=24) |
|---|---|---|---|---|
| Dark | 100% of pixels differ | 3.69% differ | `ev_1f6d55f6…` | `ev_85e60727…` |
| Light | 100% of pixels differ | 3.76% differ | `ev_8520a552…` | `ev_8fab76c5…` |

- **What matches.** The Home entry cards sit where the reference puts them (y 368-495, 4 px left because our sidebar is narrower). There are three label-only cards in a grid with the wordmark centred above. The sidebar empty-state line matches.
- **Colours are off across the whole screen.** Values are ours vs the reference, sampled from the captures.
  - Dark: sidebar #121417 vs #1c1817, main #17191d vs #141110, card #24272d vs #211e1c. Ours are cool greys; the reference uses warm near-blacks.
  - Light: sidebar #eeeeeb vs #fcfcfb, main #f7f7f5 vs #ffffff, card #efefec vs #fafaf9.
- **Geometry.** Our sidebar edge is at x=248; the reference is at x=256.
- **Sidebar structure differs.** The reference has, from top to bottom:
  1. A toggle and back/forward arrows.
  2. A computer switcher.
  3. Home, Create and Search rows.
  4. A sentence-case "my workspaces" label.
  5. Help and settings buttons in the footer.

  Ours has a logo and name, a Home row, an uppercase "Repositories" header with a "+", and a version line.
- **Card icons.** Two card icons differ: cloud vs globe, and sparkle vs folder-plus.

## Gap list, by priority

1. **Connect create-workspace end to end.**
   - Add a create dialog or page with a repo picker, name, base-branch picker, create-from source and first message.
   - It should call `create_workspace` and `list_branches`, and show `createFlow` progress: initializing, setting up, ready, failed.
   - Run the setup script after the worktree is created. `create()` never runs it today.
   - Items: `create.entry`, `create.page`, `create.base-branch`, `create.branch-picker`, `create.from-ref`, `create.worktree`, `create.validation`, `create.initializing`, `create.failure`, `create.setup-script`, `create.first-message`.
2. **Connect the sidebar and Home to the backend.**
   - Read repos and workspaces from `list_repositories` and `list_workspaces`, or from the DB crate, instead of localStorage.
   - Open project should call `add_repository` and follow the evidence flow:
     - No `.git`: show the init dialog.
     - No origin: respect the non-GitHub setting.
     - Otherwise: add the repo with a `file://` remote.
     - Errors: show a toast.
   - Use the city names in `naming.ts` instead of `src/state/names.ts`.
   - Items: `home.add-local`, `home.open-project-flow`, `home.duplicate-repo`, `home.persist`, `create.placeholder-name`, `sidebar.add-repo`, `sidebar.repo-order`.
3. **Restructure the sidebar to match the reference screens.** Add the top bar (toggle and back/forward), the computer switcher, the Home / Create / Search rows, the "my workspaces" grouping, the help and settings footer, a 256 px width, and the sidebar colour tokens. Items: `sidebar.top-bar`, `sidebar.computer-switcher`, `sidebar.primary-nav`, `sidebar.workspaces-group`, `sidebar.footer-actions`, `sidebar.colors`, `sidebar.visibility-settings`.
4. **Use the theme tokens for Home.** Set the background and card fill (`home.colors`) and use the reference card icons.
5. **Use the workspace status model.** Replace idle/working/needs-review with a derived status plus a manual override, defaulting to in-progress (`sidebar.ws-status`).
6. **Expose archive and restore as commands.** Add confirmation, the git-busy refusal and an archived-workspaces view (`sidebar.archive`, `sidebar.archived-view`).
7. **Build the remaining sidebar features.** Each is schema-only or absent: pinning, unread and next-unread, sections (create, rename, emoji, move, drag, create-in-section), repo hide and icon, rename, search, next/previous workspace, workspace numbers with Cmd+1..9, a row actions menu, the add menu with recents, resizing, transparency, and footer resource usage.
8. **Build the remaining Home features.** These are the organization loading and cloud redirect, a router with `/`, `/dashboard` and `/all-workspaces`, the status overview, recent workspaces, repo search, recents in the clone dialog, a real clone, and a quick start that runs git init and creates the first workspace.
9. **Build the remaining create features.** These are the branch-prefix settings UI, workspace numbers, and auto-run after setup. `crates/scripts` parses `auto_run_after_setup`, but nothing acts on it.

## Files

- [sidebar-home-create.checklist.json](sidebar-home-create.checklist.json) has 68 items.
  - Each item cites evidence references: copy-catalog indices, routes, schema columns, IPC keys, ledger obligations, CLI flags and evidence files such as `evidence/screens/*`.
  - Each item has regex detectors.
  - Features are described in our own words. Conductor strings are referenced by catalog index only, pinned by sha256 prefix in [sidebar-home-create.copy-pins.json](sidebar-home-create.copy-pins.json).
- [sidebar-home-create.verdicts.json](sidebar-home-create.verdicts.json) holds the verdict for each item, from reading the code on main.
- [sidebar-home-create.main.json](sidebar-home-create.main.json) and [.md](sidebar-home-create.main.md) are the scored output. [screens/](screens) holds our REA captures.
- `tools/parity_sidebar_home_create.py` has three commands:
  - `validate` checks that every reference resolves against `evidence/`.
  - `pin` re-pins the copy indices.
  - `score --ref <git ref>` or `score --tree <dir>` scores a checkout.

  CI runs `validate` and a smoke `score`.

**To re-verify after a merge:**

1. Run `python tools/parity_sidebar_home_create.py score --ref origin/main`.
2. Re-read every item marked `(recheck)`, and every item whose detector status changed.
3. Update its verdict.

Detectors only test presence. For example, a schema column in the unwired DB crate counts as a match. The score comes from the verdicts. On main, all 6 `(recheck)` flags are schema columns or config fields with no behaviour behind them.

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
- **Not covered by the reference screens.** They are Chromium renders, not WKWebView, and cover only the empty Home. Populated sidebar rows, menus and the create dialog have no reference screenshots yet, so their layout is not scored.
