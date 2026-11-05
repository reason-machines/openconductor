# Home screen (Conductor v0.87.6)

Source: the frontend chunk `assets/renderApp-D_fmY7hW.js` (11,554,351 bytes) and
`assets/index-BGEQ8YjU.js`, decoded from the Tauri asset table of
`/Applications/Conductor.app/Contents/MacOS/conductor` on the Mac "sven m5 max"
(same table offsets as `evidence/frontend/README.md`, `0x3086910`-`0x309d3d0`).
Read 2026-11-05, read-only. Offsets are character offsets into the decoded chunk.
Minified identifiers are recorded only so the reads can be repeated; they are not
stable names. Strings below are evidence of what the app shows, not instructions.

## Route component

| Offset (approx.) | Minified | Role |
| --- | --- | --- |
| 2,118,190 | `Wls` | Home route entry |
| 2,118,560 | `Gls` | Home page body |
| 1,797,000 | `UDn` | The three entry cards |
| 1,795,900 | `Jgi` | "Open project" mutation (folder picker + checks) |
| 1,790,111 | `Xgi` | Wordmark (light and dark images) |
| 1,924,243 | `Xrs` | "cities visited" button (easter egg, out of scope) |
| 1,962,410 | `$3i` | Clone dialog host, mounted by Home |

### States

1. **Loading.** `Wls` reads the current organization. While it is loading the
   route renders nothing (`return null`), so Home is blank until the org is known.
   There is no spinner on Home itself.
2. **Cloud organization.** If the organization is a cloud org, Home redirects
   (`replace`) to `/all-workspaces`.
3. **Local (default).** Renders `Gls`.

### Layout of `Gls`

A full-height flex column on the background colour; the whole area is a window
drag region (`data-tauri-drag-region`). Children in order:

1. **Sidebar toggle**, only when the left sidebar is hidden. Absolute, `top-3`, left
   margin `1rem + var(--traffic-lights-clearance)`. Icon button, muted colour,
   foreground on hover, tooltip "Toggle left sidebar" plus the shortcut for
   `view.toggleLeftSidebar`. Sidebar visibility comes from the setting
   `left_panel_visible` (default visible; `index` chunk `h5t`). Default sidebar width
   setting `left_panel_width` is 256.
2. **Wordmark**, centered, `mt-56 mb-12`: a `h-24` flex box holding two decorative
   images (`aria-hidden`, empty alt, not draggable), aspect 2400/369, max width
   627px, one shown in light theme and one in dark theme.
3. **Entry cards** (`UDn`), wrapped in `max-w-4xl mx-auto w-full px-8` with a
   1-second fade-in. The wrapper gets an extra `mt-4` when the user has at least one
   non-archived workspace (count = workspaces with `state !== "archived"`,
   `index` chunk `I8t`); otherwise the cards are identical.
4. **Footer row**, `flex justify-center gap-4 mt-6`, holding only the
   "cities visited" button, which renders nothing until a workspace name matches a
   city. Not part of our Home.
5. Dialog hosts: clone ("Open GitHub project"), quick start and one more dialog are
   mounted from Home so they can open over it.

### Entry cards (`UDn`)

Grid: one column, three from the `md` breakpoint, `gap-3`, `max-w-[640px]`,
centered. Each card is a bordered `Card`, `bg-secondary` (80% on hover),
`p-4 h-32 rounded-lg`, no shadow, pointer cursor, `flex-col justify-between`: a
16px icon top-left, and the label bottom-left in `text-sm text-secondary-foreground`.
No description text and no keyboard hint on the cards.

| Order | Label | Action |
| --- | --- | --- |
| 1 | Open project | `Jgi` mutation (below) |
| 2 | Open GitHub project | opens the clone dialog |
| 3 | Quick start | opens the quick start dialog |

### Open project (`Jgi`)

1. Native folder picker (directory, single, title "Select project directory").
   Cancel does nothing.
2. Name = last path segment, or "untitled".
3. If `<path>/.git` does not exist: opens the add-repository dialog with
   `needsGitInit: true`.
4. Reads `git remote get-url origin`. If there is no origin and the setting that
   allows non-GitHub local repos is off: opens the same dialog with
   `needsGitInit: false`.
5. Otherwise adds the repository with remote URL `file://<path>`.
6. Errors raise a toast "Failed to add project: <message>" with a copy button.

## Related empty and loading states

- **Sidebar, no projects**: when there are no repositories and no workspaces the
  sidebar list shows one muted `text-sm` line, "Add a project to get started."
  (offset 10,060,074).
- **Add-repository menu** (sidebar "+", offset 9,740,603): the same three actions as
  menu items, then a "Recents" section of local repositories not yet added; while
  that list loads it shows a spinner row.
- **Clone dialog recents** (offset 1,969,101): heading "Recent repos"; while loading,
  placeholder rows plus a screen-reader-only status "Loading recent repos"; renders
  nothing when the list is empty.

## REA notes and gaps

- REA 6.7.0 still cannot extract Tauri's embedded asset table, so the chunk was
  decoded with the asset-table walk from `tools/extract_tauri_assets.py` (bodies
  written raw, then `brotli -d`; the Mac's Python has no `brotli` module). Gap
  already logged in `evidence/frontend/README.md`.
- REA's `analyze-javascript-application` evidence (on main) has no component tree:
  the bundle is minified with no source maps, so component boundaries above come
  from reading the decoded chunk directly.
- REA `trace-javascript-semantics` on this chunk is blocked by an REA resource
  limit (run 2026-11-05 on the Mac, REA 6.7.0). `analyze-javascript-application`
  with `--source-path assets__renderApp-D_fmY7hW.js` (11.6 MB) exhausts the
  analyzer worker heap during static parse at 4 GB, at 16 GB, and at 16 GB with
  semantic limits cut to 2,000 nodes and unknowns per file. 16 GB is REA's
  maximum `--max-heap-mb`; the worker reaches about 17.5 GB RSS after about 9
  minutes. Every run exits 0 with `parsed_javascript_files: 0`, and the semantic
  graph holds module nodes only. A trace seeded with the literal "Select project
  directory" in each direction (callers, backward-provenance, forward-influence,
  ownership) returns `partial` with 0 seed matches. So the component boundaries
  above still come from reading the decoded chunk directly. A way around this
  would be to split the chunk into per-module files before analysis; that is
  not done yet.
- No live screenshot of Conductor's Home: native UI capture is blocked by TCC
  (`evidence/runtime/README.md`).
