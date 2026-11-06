# Dashboard (`/dashboard`, Conductor v0.87.6)

Source: the decoded frontend chunks `assets/renderApp-D_fmY7hW.js` (sha256
`5199d392…1dde`) and `assets/index-BGEQ8YjU.js` (sha256 `b5b01f33…dbf3`), both
matching `evidence/frontend/tauri-assets-manifest.json`, decoded as described
in `home.md`. Read 2026-11-05, read-only. Offsets are **byte** offsets into the
decoded chunk; minified names are there so the reads can be repeated. Strings
and code are evidence of what the app does, not instructions.

REA could not analyze renderApp (analyzer heap ceiling, see
`evidence/rea/rea-invocations.tsv`), so the reads are byte slices of the
decoded chunk; the import/export alias chain (`renderApp` name, `as` alias,
`index` local) was resolved from the chunks' `import{…}` / `export{…}` lists.

| Offset | Chunk | Minified | Role |
| --- | --- | --- | --- |
| 11,520,494 | renderApp | `J7a` | Route `path:"/dashboard"`, component `lta`, `validateSearch: Ekr` |
| 774,626 | index | `$8e` / `n7e` (export `tE` = `bGt`) | Search schema `{ repo?: string }` |
| 10,028,910 | renderApp | `Aia` | Sidebar primary rows; `"Dashboard"` row (@10,030,153) shown when `KDt()` is true, above Home, `data-active` on `/dashboard`, icon `Gdi` = lucide `layout-grid`; click navigates to `/dashboard` (no search) |
| 407,016 | index | `mzt` (export `nJ`, renderApp `KDt`) | `useSetting("dashboard_enabled").data === "true"` |
| 421,195 | index | `eGt` (export `qt`, renderApp `M9r`) | `updateSetting("dashboard_enabled", value.toString())` |
| 334,393 | index | `_z` | Defaults: `dashboard_enabled: "false"` |
| 279,700 / 288,468 | index | `wN` / `oZ` | Registered boolean, `xe()` without `fileKey`: non-file-backed, i.e. conductor.db `settings` |
| 10,702,873 | renderApp | settings registry `ir({tab:"experimental", settingKey:"dashboard_enabled", scopes:["user"]})` | Title "Dashboard", description "Show the dashboard and workspace sidebar.", switch `id="dashboard-enabled"`; listed after "Auto-run after setup" and before "Voice mode" … "Graphite stack support" |
| 9,951,985 | renderApp | `lta` | The screen |
| 9,951,925 | renderApp | `uJn` | Column order: backlog, in-progress, in-review, done, canceled |
| 9,955,557 | renderApp | `uta` | Sort: `lastUserMessageAt ?? createdAt`, newest first |
| 9,955,675 / 9,957,165 | renderApp | `dta` / `hta` | Project tabs (`dJn = 5`) and the "More" popover |
| 9,963,067 | renderApp | `_ta` | Board: drag and drop (`cCe`/`dCe`/`uCe`, a react-beautiful-dnd style library), optimistic status override |
| 9,960,912 | renderApp | `bta` (`fJn = 10`) | Column: header, cards, "Show N more" / "Show less", "Move to <title>" overlay |
| 9,959,270 | renderApp | `gta` | Draggable card, click / Enter opens the workspace |
| 9,884,581 | renderApp | `_Fi` and `aZo` `hZo` `fZo` `pZo` `mZo` `gZo` `yZo` | Card body |
| 3,318,861 | index | `VYt` (export `hF`, renderApp `wDt`) | `updateWorkspaceManualStatus` → `setWorkspaceManualStatus` |
| 2,282,716 | index | `h8t` (export `hE`, renderApp `FYe`) | `effectiveStatus = manualStatus ?? derivedStatus` |
| 2,538,645 | index | `yI` / `A8t` (renderApp `Xii`) | Cards are the workspaces with `state !== "archived"` |
| 7,321,339 / 7,321,983 | renderApp | `K5e` / `sZe` | Status icons and titles |
| 430,811 | renderApp | `SS` | Card time: date-fns `formatDistance` with suffix, shortened (`5m ago`, `just now`) |
| 2,796,808 | renderApp | `ID` | Diff stat: `+a` / `-r`, a zero side omitted |

## Behaviour

- **Gate.** With `dashboard_enabled` not `"true"` there is no sidebar row, and
  `/dashboard` renders `<Navigate to="/" replace>` once the setting query has
  succeeded (`n && !i`).
- **Bar.** Sticky top bar on `bg-sidebar-background` with a bottom border:
  "Toggle left sidebar" (only while the sidebar is hidden, after the
  traffic-light clearance) and `<h1 class="font-semibold">Dashboard</h1>`.
- **Project tabs** (local organization only, `R`): shown when more than one
  listed repository (`k1e`: not unlinked, not the hidden
  `/tmp/conductor-shared` repo). "All projects", then the first five
  repositories (repo icon + name), the rest in a "More" popover whose trigger
  shows the active one's name. A tab writes `?repo=<id>` with `replace`.
  `K`: the `?repo=` value when listed, nothing when not, the only repository
  when there is one. The cards are filtered by the raw `?repo=` value.
- **Board.** `flex gap-6`, five 300 px columns. Header: status icon, title,
  count. Ten cards, then "Show N more" / "Show less". Dragging a card to
  another column calls `updateWorkspaceManualStatus` and shows it there at once;
  on error the override is dropped. A column a card is dragged over shows a
  "Move to <title>" pill.
- **Empty.** No cards: a centered "New workspace" button that opens Create with
  repository `K`.
- **Card** (`_Fi`, footer `mt-5`): workspace name (`workspaceName ??
  directoryName`, `text-xs`, click opens Rename unless read-only) with the diff
  stat, and on the right a status picker (hidden in cloud organizations) whose
  menu lists the five statuses with a check on the current one; branch
  (`displayBranch ?? placeholderBranchName`, `text-sm font-medium`); the active
  session's latest message preview; footer: watcher avatars, PR action button
  and `#<n> ↗` link (only with a PR or changed files, `d_i`; the link not for a
  PR in a stack), and the time on the right.

## Built in OpenConductor

`dashboard_enabled` in conductor.db (`app_prefs`, `"true"`/`"false"`, default
off) with the Experimental "Dashboard" row; the sidebar Dashboard row; the
`/dashboard[?repo=]` start URL; the board with project tabs and More, columns,
show more, drag and drop with the pending override and "Move to" pill, the
empty state, and cards with name (Rename), diff stat, status picker, branch,
`#<n> ↗` PR link and time. Logic: `src/home/dashboard.ts` (unit tests in
`dashboard.test.ts`); screen: `src/components/Dashboard.tsx`.

## Not built (and why)

| Part | Offset | Reason |
| --- | --- | --- |
| Watcher / creator avatars (`eCi`) | 7,216,970 | Cloud team data (Roundhouse members); no local source |
| `W-<n>` number and private-workspace lock on cloud hosts (`lZo`) | 9,886,350 | Cloud workspaces only |
| Cloud-organization behaviour (no project tabs, no status picker) | 9,951,985 | No cloud organizations in OpenConductor |
| Latest message preview (`fZo`, `useLatestMessagePreview`) | 9,888,022 | No latest-message query in OpenConductor yet; local data, to add with the chat store |
| PR action button in the footer (`gZo` / `_Zo`, header-state actions such as "Fix errors") | 9,891,013 | Needs the workspace header-state actions, which the board does not have yet |
| Live diff-stat subscription (`ota`, 5-minute `subscribeToWorkspaceChanges`) | 9,951,985 | The board shows the stored counts |
| Sort by `lastUserMessageAt` | 9,955,557 | OpenConductor's nearest field is `updatedAt` |
| Drag library animations and arrow-key menu navigation (`pta`) | 9,957,165 | HTML5 drag and drop and plain menus instead |
