Scored `origin/main`: 79 source files. Detector parity **54.4%**. Verified parity **24.6%** (verdicts read on `origin/main`, 2026-11-05 (main d846158)).

| Area | Items | Implemented | Partial | Backend only | Missing | Verified parity | Detector parity |
|---|---|---|---|---|---|---|---|
| sidebar | 33 | 2 | 10 | 2 | 19 | 22.7% | 45.5% |
| home | 18 | 2 | 7 | 1 | 8 | 31.9% | 47.2% |
| create | 17 | 0 | 1 | 12 | 4 | 20.6% | 79.4% |

| ID | Verdict | Detector | Feature | Finding |
|---|---|---|---|---|
| `sidebar.home-entry` | partial | partial | Sidebar entry that returns to Home, plus a keyboard command to go Home | Sidebar Home button works (src/components/Sidebar.tsx); no go-to-Home shortcut is wired (keybinding registry declares commands only). |
| `sidebar.top-bar` | missing | partial | Sidebar top bar with a sidebar toggle button and back/forward history arrows | No in-sidebar toggle button (toggle is keyboard-only, plus a Home button when hidden) and no back/forward navigation; the reference shows all three at the top of the sidebar. |
| `sidebar.computer-switcher` | missing | missing | Computer/account switcher at the top of the sidebar (initial avatar, name, chevron) | Sidebar starts with our logo and name; the reference starts with a computer/account switcher. |
| `sidebar.primary-nav` | partial | partial | Primary nav rows Home, Create and Search above the workspace list | Home row only; no Create or Search rows. |
| `sidebar.repo-groups` | implemented | implemented | Workspaces listed under their repository, repositories as collapsible groups | Repos render as collapsible groups with nested workspace rows (Sidebar.tsx, store toggleRepo). |
| `sidebar.workspaces-group` | missing | missing | Workspace list grouped under a sentence-case 'my workspaces' label rather than an uppercase repositories header | We show an uppercase 'Repositories' header with a '+'; the reference shows a sentence-case 'my workspaces' label. |
| `sidebar.repo-order` | backend | implemented | Manual, persisted ordering of repositories | crates/openconductor-db/src/repos.rs lists repos by display_order, created_at and appends new ones at the end, but the app does not depend on that crate and the sidebar renders insertion order from localStorage. |
| `sidebar.repo-hide` | missing | partial | Hide and unhide a repository, with a toggle to show hidden ones | No hide/unhide; hidden column exists only in the unwired DB crate schema. |
| `sidebar.repo-icon` | missing | partial | Per-repository icon (icon, emoji, favicon or uploaded image) next to the repo name | No repository icon support. |
| `sidebar.add-repo` | partial | implemented | Add-repository control reachable from the sidebar | Sidebar '+' opens the Open-project dialog, which only appends to localStorage; it does not call the registered add_repository command. |
| `sidebar.ws-name` | partial | implemented | Workspace row shows the workspace name, distinguishing user-set from generated names | Row shows the name; no user-set vs generated distinction (user_set_* flags not modelled in the UI). |
| `sidebar.ws-branch` | partial | implemented | Workspace branch visible from the sidebar row | Branch appears only in the row tooltip. |
| `sidebar.ws-status` | partial | implemented | Status indicator from a derived status with optional manual override (default in-progress) | Status dot uses our own idle/working/needs-review/archived model, not derived/manual status with in-progress default (src/state/types.ts). |
| `sidebar.ws-diffstat` | partial | partial | Line additions/deletions on each row, colored, with a setting to color unselected rows | +/- counts render from stored placeholder numbers; not computed from git, no colour setting. |
| `sidebar.ws-unread` | missing | partial | Unread marker, mark-as-unread action and jump-to-next-unread command | No unread state, action or command; column only in the unwired DB crate. |
| `sidebar.ws-pinned` | missing | partial | Pin workspaces into a pinned group at the top | No pinning; pinned_at only in the unwired DB crate. |
| `sidebar.sections` | missing (recheck) | implemented | User navigation sections: create, rename, delete, emoji; move a workspace into or out of a section | No sections UI or commands; navigation_sections only in crates/openconductor-db/migrations/0005_navigation_and_favorites.sql (unwired). |
| `sidebar.drag-to-section` | missing | missing | Drag a workspace row onto a section | No drag and drop. |
| `sidebar.ws-numbers` | missing | missing | Workspace numbers shown optionally, with Cmd+1..9 switching | No numbers or Cmd+1..9 handler; registry entries in src/keybindings are declarations without handlers. |
| `sidebar.ws-next-prev` | missing | missing | Next/previous workspace commands | Declared in the keybinding registry only; no handler. |
| `sidebar.search` | missing | missing | Search/filter workspaces | No workspace search. |
| `sidebar.rename` | missing (recheck) | implemented | Rename a workspace (local only), optionally also renaming the branch | No user rename. src/workspace/naming.ts plans the automatic first-message rename only, and is not imported by the UI. |
| `sidebar.archive` | partial | implemented | Archive with confirmation, refusing while a git operation is in progress, recording an archive commit | UI archive (WorkspaceView) deletes the localStorage row without confirmation or busy check. Backend WorkspaceManager::archive has the busy guard and archive commit but is not a registered command. |
| `sidebar.archived-view` | backend | missing | Browse archived workspaces and unarchive one | WorkspaceManager::restore exists (src-tauri/src/workspace/mod.rs); no command, no UI. |
| `sidebar.resize-toggle` | partial | partial | Resizable sidebar and show/hide toggles for left and right sidebars | Toggle works via Cmd+B and '[' (src/state/shortcuts.ts, App.tsx); the sidebar is a fixed 248px column with no resize. |
| `sidebar.footer-usage` | missing | missing | Optional CPU/memory usage readout in the sidebar footer | Footer shows app name/version only. |
| `sidebar.footer-actions` | missing | missing | Sidebar footer with help and settings icon buttons | Footer shows app name, version and platform text; the reference shows help and settings icon buttons. |
| `sidebar.transparency` | missing | missing | Sidebar transparency (vibrancy) setting | No vibrancy/transparency. |
| `sidebar.colors` | missing | partial | Sidebar background, border and width match the reference screens in light and dark | Measured on REA captures at 1440x900: sidebar edge at x=248 vs 256; dark sidebar #121417 vs #1c1817; light sidebar #eeeeeb vs #fcfcfb. REA compare-web-screenshots (threshold 24): 3.1% (dark) / 5.4% (light) of sidebar pixels differ. |
| `sidebar.ws-actions` | missing | missing | Workspace actions menu on a row (copy info, rename, archive, pin, section) | No row context menu or actions menu. |
| `sidebar.empty-state` | implemented | implemented | Empty state when there are no repositories or workspaces | Muted single-line empty state matches evidence/screens/home.md. |
| `sidebar.add-menu` | missing | missing | Sidebar add menu offering the three Home actions plus recent local repositories not yet added (spinner while loading) | '+' opens a dialog directly; no three-action menu, no recents. |
| `sidebar.visibility-settings` | partial (recheck) | missing | Left sidebar visibility and width persisted as settings (default visible, width 256) | Visibility persists inside the localStorage app state, not as a setting; width is fixed (248px vs evidence default 256). |
| `home.route` | partial | partial | Home is the root route and the default screen | Home is the default screen, but there is no router or '/' route (selection state in src/state/store.ts). |
| `home.org-states` | missing | missing | Home renders nothing while the organization loads and redirects a cloud organization to all-workspaces | No organization concept; no loading or cloud redirect state. |
| `home.layout` | implemented | implemented | Centered wordmark (light/dark variants) above three label-only entry cards in a 1-to-3 column grid, whole area a window drag region | Matches evidence/screens: three label-only cards in a 1-to-3 grid sit at the reference position (y 368-495; x offset 4 px from the narrower sidebar), wordmark centered above, drag region, fade-in. Differences: card icons for GitHub (cloud vs globe) and Quick start (sparkle vs folder-plus); the wordmark is our own brand by design. |
| `home.colors` | missing | partial | Home background and entry-card fill match the reference screens in light and dark | Measured: dark main #17191d vs #141110, dark card #24272d vs #211e1c; light main #f7f7f5 vs #ffffff, light card #efefec vs #fafaf9. Every pixel differs at threshold 0 (REA compare-web-screenshots). |
| `home.sidebar-toggle` | implemented | implemented | When the left sidebar is hidden, Home shows a toggle button with its shortcut, offset past the traffic lights | Toggle shown only when the sidebar is hidden, with tooltip and shortcut hint (HomeScreen.tsx). |
| `home.add-local` | partial | implemented | Add an existing local repository via a folder picker, with default-branch detection | Dialog with folder picker adds to localStorage with defaultBranch hard-coded to main; backend add_repository (git toplevel) and default_branch detection exist but are not called. |
| `home.open-project-flow` | backend | partial | Open project: folder picker; no .git leads to an add dialog that offers git init; a missing origin (non-GitHub setting off) leads to the same dialog; otherwise add with a file:// remote; errors in a toast | Only the backend toplevel check exists (service.rs add_repository). No .git/init dialog, origin check, file:// remote or error toast. |
| `home.clone-github` | partial | partial | Clone a GitHub repository by URL into a chosen folder, with progress | Dialog parses GitHub URLs but performs no clone and has no destination picker or progress. |
| `home.new-project` | partial | partial | Create a new project: local folder, git init, optional private GitHub repo, then a first workspace | Quick start dialog with placeholder templates; no git init, no GitHub repo, no first workspace on disk. |
| `home.duplicate-repo` | partial | implemented | Refuse adding a repository that is already added | Store silently ignores a duplicate path/remote; no already-exists message. Backend add_repository returns the existing id. |
| `home.no-repo-guard` | partial | implemented | Home explains that a repository must be added before creating a workspace | Sidebar empty line exists; creating a workspace with no repository is not reachable, and no Home explanation is shown. |
| `home.status-overview` | missing | missing | Home shows workspaces with their status (status matrix option, mine vs all) | Home shows no workspace list or statuses. |
| `home.dashboard-routes` | missing | missing | Dashboard and all-workspaces routes | No /dashboard or /all-workspaces screens. |
| `home.recent` | missing | missing | Recent workspaces list | No recent workspaces. |
| `home.repo-search` | missing | missing | Search the repository list | No repository search. |
| `home.recents` | missing | missing | Clone dialog shows recent repositories with loading placeholders and a screen-reader status | Clone dialog has no recent repositories. |
| `home.first-run` | missing | missing | First-run onboarding route before Home | No onboarding. |
| `home.persist` | partial | implemented | Repositories and workspaces persist in SQLite (conductor.db shape), surviving restart | UI state lives in localStorage; backend keeps a TSV repo registry; the Conductor-shaped SQLite schema in crates/openconductor-db is not used by the app. |
| `create.entry` | partial | implemented | Create-workspace action per repository (sidebar and Home) | Per-repo '+' instantly adds a localStorage row with an adjective-noun name; no dialog, no worktree. |
| `create.page` | missing | missing | Full-screen create-workspace page with its own composer and tab navigation | No create page or composer. |
| `create.from-ref` | backend | implemented | Create a workspace from a PR, branch or issue | src/workspace/createFlow.ts models PR/branch/issue sources with tests; not used by the UI. |
| `create.base-branch` | backend | implemented | Choose the base branch new workspaces branch from; remember the intended target branch | create_workspace accepts a base branch and fetches origin/<base> first (mod.rs create); createFlow defaults it to the repo default branch; no UI. |
| `create.branch-picker` | backend | partial | Branch picker with search, loading, empty and error states | list_branches command is registered; no picker UI. |
| `create.worktree` | backend | implemented | Each workspace is a git worktree on its own branch in a configurable workspaces directory | create_workspace runs git worktree add -b <branch> <data_dir>/workspaces/<slug>/<name> <base>; registered but never invoked by the UI. |
| `create.branch-prefix` | backend | implemented | Branch name prefix setting (none, user-based or custom) | naming.ts resolveBranchPrefix and settings keys exist; no settings UI and not wired to creation from the UI. |
| `create.placeholder-name` | backend | implemented | Generated placeholder name/branch, replaced when the agent names the branch (rename-on-branch setting) | City names with rarity tiers and first-message rename plan (naming.ts, tested); the UI still uses src/state/names.ts adjective-noun names. |
| `create.validation` | backend | implemented | Validate workspace names and branch names before creating | validateWorkspaceName/validateBranchName (naming.ts) and git check-ref-format (git.rs valid_branch_name); no UI surfaces errors. |
| `create.copy-files` | backend | implemented | Copy ignored files (worktreeinclude / include globs / .env*) into each new workspace | files_to_copy.rs resolves .worktreeinclude / globs / .env* and create() copies them; only reachable through the unwired command. |
| `create.setup-script` | backend | implemented | Run the repository setup script on creation and keep its log | run_setup exists but create() does not call it and no log path is kept. |
| `create.initializing` | backend | implemented | Initializing state with progress while the workspace is created | createFlow.ts progress reducer (initializing -> setting_up -> ready/failed); no UI. |
| `create.failure` | backend | partial | Creation failure surfaced with logs; incomplete workspaces cleaned up on start | Failed state modelled in createFlow.ts; no failure UI and no startup cleanup of incomplete workspaces. |
| `create.in-section` | missing (recheck) | implemented | Create a workspace directly inside a sidebar section | No sections. |
| `create.first-message` | backend | partial | Draft the first agent message, then create the workspace and send it | createFlow.ts carries the first message in the create request; no composer and no session start on create. |
| `create.number` | missing | missing | Assign a per-workspace number on creation | No workspace numbers (schema column only in the unwired DB crate). |
| `create.autostart-run` | missing (recheck) | implemented | Optionally start the run script automatically after setup | crates/scripts parses a scripts.auto_run_after_setup setting, but nothing acts on it and that crate is not an app dependency; workspace::scripts::spawn_run is never called after setup. |
