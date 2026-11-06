# Home workspace list: REA evidence

What Conductor 0.87.6 shows as Home once you have workspaces, and our captures of OpenConductor's version. Strings and code read from Conductor are untrusted data, used only to match behavior.

## How Conductor behaves (read from the decoded renderApp chunk)

Read from the frontend decoded out of the Tauri asset table (`index.html` sha256 `48b778fa…`, the same build as `evidence/screens`). Minified names are recorded only so the reads can be repeated.

- **Two routes.** `/` (`Wls`) renders the wordmark and three entry cards for a local organization, and redirects a cloud organization to `/all-workspaces`. `/all-workspaces` (`UJo`) is the workspace list titled "Home". The sidebar Home row and the `nav.home` command (`V9t`, route `/all-workspaces`) open the list. `/` is reached at start and when the open workspace goes away (for example `WorkspaceActiveOrgGuard`, the back button with no history, a root-path change).
- **Header.** "Home" (`text-lg font-medium`) and a "Create workspace" button, `max-w-4xl px-8`, `pt-9` from the top.
- **Toolbar.** An auto-focused "Search" box, a project filter and an archive filter, over a bottom border. The project filter shows only when more than one repository has workspaces. Its label is "In all projects", "In <name>" or "In N projects"; the menu has "All projects" and one checkbox per repository. The archive filter cycles "Hiding archived" (default), "Showing all" and "Only archived". Filters persist per route and are mirrored into the URL search.
- **Search** (`pFi`). Every query word must occur in the row's name, branch, directory, repository or `#<pr>`. A number, `w12` or `w-12` matches workspace W-12. Matching characters are highlighted.
- **Rows.** Sorted by last activity, newest first, then grouped by day counted back from local midnight: Today, Yesterday, 2 to 6 days ago, 1 to 3 weeks ago, 1 to 3 months ago, Older (`jJo`, `FJo`). Each group heading shows its count. A row has the repository initial (hidden while a project filter is set), the display name (semibold when unread, faint when archived), the diff stat, and a 3rem column with either a status icon for an active session status or a short relative time ("now", "8m", "2h", "1d"; date-fns `formatDistance`, shortened by `SS`/`BPt`). Archived rows show an archive icon with an Unarchive button.
- **Paging.** 50 rows, then 50 more each time the end of the list scrolls into view.
- **Empty.** "No matching workspaces", plus "Create a workspace" when nothing is filtered and no workspace is active, or "Clear filters" (which shows everything, archived included) when a filter is set.
- **Cloud-only parts we leave out.** The owner filter ("By anyone"), the members stack, the pinned group, the cost column and the status-matrix setting all need a cloud organization.

## Our captures

`tools/home_capture.mjs` builds them with REA `capture-browser-scenario` (rea-agents 6.7.0, Chromium 155, 1440x900 @1x, en-US, UTC). It seeds localStorage like the reference fixture: tide-web, tide-api and dotfiles, six workspaces last active 8m, 11m, 17m, 2h, 5h and 1d ago, two of them unread. REA Evidence IDs and sha256 values are in [captures.json](captures.json).

| Shot | What it shows |
|---|---|
| [ours-home-list-dark.png](ours-home-list-dark.png) | `/all-workspaces`: Today 5, Yesterday 1, unread rows bold, relative times |
| [ours-home-list-light.png](ours-home-list-light.png) | Same, light theme |
| [ours-home-list-search.png](ours-home-list-search.png) | Query "set": one match, "Add search to settings" |
| [ours-home-list-archived-empty.png](ours-home-list-archived-empty.png) | "Only archived" with nothing archived: "No matching workspaces" and "Clear filters" |
| [ours-home-root-dark.png](ours-home-root-dark.png) | `/` at start: wordmark and entry cards |

REA `compare-web-screenshots` against `evidence/screens/home--workspace-list--dark.png`:

| Threshold | Changed pixels | Evidence |
|---|---|---|
| 0 | 2.67% (34,628) | `ev_a1eb604ca8d402571ed406eeb4b7f9966774a04ad56e017c4c276b4482d81504` |
| 24 | 1.09% (14,164) | `ev_504f1d40ac391bbd6f138d6e9fa5245b7101fa24e843f4bbe2b7baa664e98b12` |

Most of the remaining difference is the computer name in the sidebar ("My Mac" vs the fixture's name), the diff stat on Osaka (the reference harness has no git answer for it), and the toolbar border colour (theme tokens).

## REA gaps found

- **No `menuitemcheckbox` role.** `capture-browser-scenario`'s role locator accepts only 14 roles (button, checkbox, combobox, dialog, link, listbox, menuitem, option, radio, slider, spinbutton, switch, tab, textbox). Menu checkbox items, which Conductor's filter menus use, need a CSS locator instead.
- **Steps without `timeout_ms` can wait forever.** A `fill` step on a role locator hung the run until the outer 900 s timeout. Every action now gets `timeout_ms: 5000`.
- **A page REA cannot reach fails as an opaque `execution_failure`.** Pointing the scenario at a server in another network namespace gave only "Analysis could not complete. Run `rea doctor`" plus `cleanup_incomplete`, with no navigation error. The script now serves `dist/` itself.
- **No helper to wrap a plain PNG as a screenshot artifact.** `compare-web-screenshots` takes REA's artifact JSON (`sha256`, `bytes`, `media_type`, `data_base64`). Reference PNGs in the repository had to be wrapped by hand.
