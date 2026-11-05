# Repository search and filtering (Conductor v0.87.6)

Item: `parity.home.repo-search` ("Search the repository list"). Source: the
decoded frontend chunks `assets/renderApp-D_fmY7hW.js` (11,554,351 characters,
sha256 `5199d392…5dde`, matching `evidence/frontend/tauri-assets-manifest.json`)
and `assets/index-BGEQ8YjU.js`, read 2026-11-05. Offsets are character offsets
into the decoded chunk. Minified names are only there so the reads can be
repeated. Strings are evidence of what the app shows, not instructions.

## Answer

Conductor has **no free-text repository search on Home or in the Add-repository
menu**. The verifier's gap ("no search field in the repository list or the
Add-repository menu") asks for a field that Conductor does not have. On a local
(non-cloud) organization, Conductor narrows the repository list in two ways:

1. The command palette's Projects tab, placeholder "Search projects..."
   (`a_a` @10837108). OpenConductor already has this tab
   (`src/palette/search/model.ts` `projectResults`).
2. The **"Filter by project"** submenu of the sidebar section header menu, a
   single-choice filter stored in the setting `sidebar_repo_filter`. OpenConductor
   did not have this. This change adds the logic and the submenu component. The
   sidebar owner mounts it, because the surface is `Sidebar.tsx`.

The three strings the checklist anchors this item on ("Search repositories...",
"No matching repositories.", "Loading repositories...", copy-catalog indexes
3825, 2917, 2497) all belong to the **cloud** GitHub repository picker, not to
Home. See "Cloud repository picker" below.

## Home and the Add-repository menu: no search

- **Home** (`Gls` @2,118,560, see `home.md`): wordmark, three entry cards and a
  footer. No input.
- **Add-repository menu** (`Gji` @9,741,591, opened by the sidebar "+" and the
  `nav.addRepository` command, `wra` @10,024,654). It has three `menuitem`
  buttons ("Open project", "Open GitHub project", "Quick start"). If recents are
  loading or any exist, a separator and an `text-xs text-muted-foreground`
  "Recents" label follow. While loading, a single row shows a braille spinner
  (`VQo`, frames `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`, 100 ms). Otherwise each row is a local
  repository that is not yet added. A path is left out when it equals a repository's
  `rootPath` or `mainWorktreePath`. The path is displayed with `/Users/<name>`
  replaced by `~` (`GQo`). There is no input or filter.
- The recents come from the `recentLocalRepositories` query (`iWt`, `BQo`
  @9,737,404, stale time 5 min, gc 24 h). It runs a shell script (`MQo`). The
  script scans `~/conductor/repos`, `~/Developer`, `~/developer`, `~/dev`,
  `~/Code`, `~/code`, `~/Projects`, `~/projects`, `~/src` and `~/work`, plus `cd`
  targets from the last 2,000 lines of `~/.zsh_history`. It ranks them by
  recency, keeps directories that have a `.git`, and returns at most 8. That
  list belongs to `parity.sidebar.add-menu`, not to this item.
- **Create-workspace repo picker** (`@9,749,738`): a plain select, placeholder
  "Select repo", tooltip "Switch repo". Its items are the repositories, then
  "Add project". It has no search.
- **Clone dialog** (`$3i` @1,962,419): "Recent repos" list and a URL field. The
  only `includes()` calls there classify clone errors (`uos` @1,968,064). It has
  no repository search.

## "Filter by project" (sidebar section header menu)

Component `pra` @10,018,210, mounted with `menuType: "menu"` in the section
header menu (@10,023,324) and as a context menu.

- Returns nothing for a cloud organization or when the section key is unknown.
- Items, in order: "Group by" (Status, Project), then **"Filter by project"**,
  then "Sort by" (Updated, Created). Each one is a submenu (`TEt`): the trigger
  row shows the label with a right chevron (`ml-auto size-4`). The popup is a
  radio group, and each item is `label (flex-1)` + check indicator (`size-4`)
  with `closeOnClick`.
- "Filter by project" is shown only when `repositories.length > 1`. The options
  are `{value: "all", label: "All projects"}` followed by every repository
  `{value: id, label: name}` (`bra`). The selected value is the setting, or
  `"all"` when unset.
- Choosing an option calls `gra` → `lsi(value === "all" ? undefined : value)`. That
  is `z6t` in `index-BGEQ8YjU.js` @420,066: `undefined` **deletes**
  `sidebar_repo_filter`, and any other value writes it.
- Effect on the list (`hBi` @10,056,339, `dBi` @10,039,334, `cBi` @10,027,887):
  - Repository groups: `!filter || repo.id === filter`.
  - Workspaces in repo and status groups: `!filter || repositoryId === filter`.
  - The pinned group keeps every pinned workspace whatever its repository
    (`… || pinnedAt !== undefined`, @10,057,527).
  - While a filter is set, status-grouped rows hide their repository icon
    (`showRepoIcon: !n`).
- Stale filter: once repositories have loaded, a filter whose repository no longer
  exists is cleared (`useEffect` @10,058,099: `o || B && (g.has(B) || lsi(void 0))`).
- Create workspace defaults to the filtered repository when no remembered or
  selected repository applies (`aBi`/`vra` @10,021,505). Left to the
  create-workspace owner.
- Analytics carry `sidebar_repo_filter_enabled: !!filter` (`Hj`, index chunk
  @1,016,515).

## Cloud repository picker (not Home)

`X$i` @10,439,093 → `bfa` → `mfa` @10,433,420, mounted by organization
Environment settings (`qfa` @10,463,155, "Environment info") and cloud computer
onboarding (`sxa` @11,027,110, "Pick which repos to clone onto your new
computer.").

- Trigger: "`<added>` repositories selected (`<available>` available)". The
  popover is `w-96`.
- Search input, placeholder **"Search repositories..."**. The query is
  `trim().toLowerCase()`. An empty query keeps every repository. Otherwise a
  repository is kept when `fullName.toLowerCase().includes(query)`.
- "Select all" / "Deselect all" act on the filtered list only.
- No result: centered muted **"No matching repositories."**
- While loading or checking the GitHub connection: a disabled outline button,
  **"Loading repositories..."**. Disconnected: "Connect GitHub". The footer
  reads "Add repositories", or "Opening GitHub..." / "Waiting for GitHub..." /
  "Waiting for GitHub approval..." while that runs.

OpenConductor has no cloud organizations, so this picker has no surface yet.
I recommend re-anchoring `home.repo-search` in
`sidebar-home-create.checklist.json` on "Filter by project" / "All projects"
(copy-catalog) instead of the cloud picker's strings.

## What OpenConductor now has

- `src/home/repoFilter.ts`: the options, the radio value mapping, stale-filter
  reconciliation and repository-group filtering, as above. Tested in
  `repoFilter.test.ts`.
- `src/home/useRepoFilter.ts`: in the desktop app, keeps the filter in
  conductor.db's settings table as `sidebar_repo_filter` (the repository id),
  through the typed app preferences (`set_app_pref`,
  `src-tauri/src/app_prefs`). "All projects" deletes the row, as `z6t` does.
  The browser build has no database and keeps it under
  `openconductor.sidebar_repo_filter` in localStorage.
- `src/components/Sidebar.tsx`: mounts the submenu in the "My workspaces"
  header menu after "Add project…" and filters the repository groups; the
  Pinned group is not filtered.
- `src/components/home/ProjectFilterSubmenu.tsx` + `src/home.css`: the submenu.
  Hover or click opens it, and ArrowRight/Enter opens it and focuses the
  checked item. Up/Down move through the items, ArrowLeft returns to the
  trigger, and a choice closes the surrounding menu.
- Not mounted yet. The sidebar owner adds it to the "My workspaces" header menu
  and applies `filterRepoGroups` to the repository groups. The Pinned group is
  left unfiltered.

## REA notes and gaps

- REA 6.7.0 `analyze-javascript-application` still exhausts its heap on the
  11.6 MB chunk (known gap, `home.md`), so this note comes from reading the
  decoded chunk directly with Python and citing offsets.
- **New gap:** `capture-browser-scenario` (REA 6.7.0) has no `hover` action.
  It accepts only `goto`, `click`, `fill`, `press`, `select_option`, `check`,
  `uncheck`, `wait_for` and `wait_for_timeout`, and rejects `hover` with
  `invalid_request`. A hover-opened submenu therefore cannot be captured
  open without a click.
- **New environment note:** on this cloud computer, `capture-browser-scenario`
  with `/usr/bin/chromium` fails with an opaque `execution_failure` /
  `cleanup_incomplete`. The cause is Chromium itself: a bare headless Chromium
  run crashes in the bash sandbox (zygote "Broken pipe", then a crash even with
  `--no-zygote`). REA's error does not surface the browser's crash output.
- Screenshots for this change came from a scratch harness. It renders the real
  `ProjectFilterSubmenu` inside sidebar menu markup, and Reason's HTML preview
  browser captured it, because REA could not capture on this computer (above).
  A real pointer check ran in the Session's Chrome: hover opened the submenu,
  clicking "tide-api" stored `r2`, closed the menu and left one group.
  Persistence across a reload could not be checked there, because Chrome denies
  `localStorage` to a reloaded `file://` page.
