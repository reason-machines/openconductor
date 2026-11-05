# Parity: sidebar, Home and Create workspace

Verifier output for the sidebar, Home and Create-workspace areas, scored against Conductor v0.87.6 REA evidence on main. No feature code here.

## Result on main (`685ba9b`, 2026-11-05)

| Area | Items | Implemented | Partial | Backend only | Missing | Verified parity |
|---|---|---|---|---|---|---|
| Sidebar | 27 | 2 | 9 | 1 | 15 | **25.0%** |
| Home | 17 | 2 | 7 | 1 | 7 | **33.8%** |
| Create workspace | 17 | 0 | 1 | 12 | 4 | **20.6%** |
| **All** | 61 | 4 | 17 | 14 | 26 | **26.2%** |

Weights: implemented 1, partial 0.5, backend only 0.25, missing 0. "Backend only" means tested logic or a registered Tauri command exists, but no UI path reaches it. Per-item findings: [sidebar-home-create.main.md](sidebar-home-create.main.md).

The main finding is that the UI and the backend are not connected. The frontend (`src/`) is still the localStorage scaffold. Its only `invoke` call is `app_info`. The six registered workspace commands (`add_repository`, `list_repositories`, `list_branches`, `branch_name_is_taken`, `create_workspace`, `list_workspaces`) are never called. `src/workspace/createFlow.ts` and `src/workspace/naming.ts` are not imported by any component. The Conductor-shaped SQLite schema in `crates/openconductor-db` is not an app dependency. Connecting those pieces moves 12 create-workspace items from 0.25 to at least 0.5.

## Gap list, by priority

1. **Connect create-workspace end to end.** Add a create dialog or page (repo, name, base-branch picker, create-from, first message) that calls `create_workspace` and `list_branches`, shows `createFlow` progress (initializing, setting up, ready, failed), and runs the setup script after the worktree is created. Today `create()` never runs setup. Items: `create.entry`, `create.page`, `create.base-branch`, `create.branch-picker`, `create.from-ref`, `create.worktree`, `create.validation`, `create.initializing`, `create.failure`, `create.setup-script`, `create.first-message`.
2. **Connect the sidebar and Home to the backend.** Read repos and workspaces from `list_repositories` and `list_workspaces`, not localStorage. Open project should call `add_repository` and follow the evidence flow: no `.git` leads to an init dialog, a missing origin respects the non-GitHub setting, otherwise the repo is added with a `file://` remote, and errors show in a toast. Use the city names from `naming.ts` instead of `src/state/names.ts`. Items: `home.add-local`, `home.open-project-flow`, `home.duplicate-repo`, `home.persist`, `create.placeholder-name`, `sidebar.add-repo`.
3. **Use the workspace status model.** Replace idle/working/needs-review with a derived status plus a manual override (default in-progress), as in `workspaces.derived_status` and `manual_status`. Item: `sidebar.ws-status`.
4. **Add archive and restore commands.** Expose `WorkspaceManager::archive` and `restore` as commands. Add a confirmation and the git-busy refusal, plus an archived-workspaces view. Items: `sidebar.archive`, `sidebar.archived-view`.
5. **Build the missing sidebar features** (each is schema-only or absent): pinning, unread state and next-unread, sections (create, rename, emoji, move, drag, create-in-section), repo order, hide and icon, rename, search, next/previous workspace, workspace numbers with Cmd+1..9, a row actions menu, an add menu with recents, a resizable width with 256 as default, transparency, and footer resource usage.
6. **Build the missing Home features**: organization loading and cloud redirect, a router with `/`, `/dashboard` and `/all-workspaces`, a status overview, recent workspaces, repo search, recents in the clone dialog, a real clone, and a quick start that runs `git init` and creates the first workspace.
7. **Build the remaining create features**: branch-prefix settings UI, workspace numbers, and auto-run after setup. `crates/scripts` parses `auto_run_after_setup`, but nothing acts on it.

The visual-token gaps (sidebar colours, low-contrast dark mode, fonts, diff-stat colours, letter-spacing) are tracked by the separate sidebar token review (verifier 285aa125). This checklist does not score them.

## Files

- [sidebar-home-create.checklist.json](sidebar-home-create.checklist.json): 61 items. Each has evidence references: copy-catalog indices, routes, schema columns, IPC keys, ledger obligations, CLI flags and evidence files. Each also has regex detectors. Features are described in our own words. Conductor strings are referenced only by catalog index, pinned by a sha256 prefix in [sidebar-home-create.copy-pins.json](sidebar-home-create.copy-pins.json).
- [sidebar-home-create.verdicts.json](sidebar-home-create.verdicts.json): the verdict for each item, from reading the code on main.
- [sidebar-home-create.main.json](sidebar-home-create.main.json) and [.md](sidebar-home-create.main.md): the scored output.
- `tools/parity_check.py`: `validate` checks that every reference resolves against `evidence/`. `pin` re-pins copy indices. `score --ref <git ref>` or `score --tree <dir>` scores a checkout. CI runs `validate` and a smoke `score`.

To re-verify after a merge, run `python tools/parity_check.py score --ref origin/main`. Then re-read every item marked `(recheck)`, plus any item whose detector status changed, and update its verdict. Detectors only detect presence. For example, a schema column in the unwired DB crate counts as a match. The verdicts are the score.

## REA use and gaps found

- **Reference data.** The reference is Wave 0 REA evidence on main: the copy catalog and routes from `analyze-javascript-application`, the schema from `inspect-sqlite-database`, the CLI help from `capture-process`, and the obligation ledger. It also uses `evidence/screens/home.md` and `evidence/create-workspace/README.md`. REA's app graph is module-level, with no component tree, so it cannot place UI strings in components.
- **No REA comparison on main.** `rea compare-application-versions` needs two authenticated JavaScript Application Graphs of versions of the same app. A clean-room rebuild has no shared identity, so the comparison was not meaningful. Instead, REA 6.8.0 (`rea-agents`) `analyze-javascript-application` was run on the built frontend from PR #10 (`vite build`, 3 files, 163 KB) on a Linux cloud machine (2 vCPU, Node 22.23.4).
- **REA bug: the analyzer stalls on a small bundle.** It hit `provider_timeout` at the default 300 s, then again at `--analysis-timeout-ms 900000`: 15 min wall time with only 2 min 51 s of user CPU. Partial Evidence `ev_11eebfcd2279d007895a0a6968095aaba614f8b10ff70ddd43d2415454dedb3f` reports `parsed_javascript_files: 0`, `skipped_javascript_files: 2`. Conductor's 54 MB tree finished in 179 s on macOS, so this looks like a stall in the worker on Linux, not slow parsing.
- **REA gap: hidden input schema.** `compare-application-versions --schema` still shows only `inputJson: string`. The real schema is only in `dist/mcp-catalog-full.json` (also logged in Wave 0).
- **No screenshots.** There are no screenshots of Conductor, because native UI capture is blocked by TCC. Layout, spacing, row height and menu contents are not scored.
