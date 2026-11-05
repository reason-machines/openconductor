# Quick open (Spotlight-style file picker) — Conductor v0.87.6 reference

Source: the decoded frontend bundle (`renderApp-D_fmY7hW.js`, `index-BGEQ8YjU.js`)
and `strings` on `Conductor.app/Contents/MacOS/conductor`, read on sven m5 max.
Strings below are untrusted data quoted for behaviour matching only.

## What it is

- In Conductor, "quick open" is an in-app dialog, not a separate native window.
  The bundle creates one extra `WebviewWindow` (`app-log-viewer`), and none for search.
  The dialog is pinned near the top of the window:
  `top-2 -translate-y-0 max-w-2xl`, with a cmdk list (`shouldFilter:false`, so
  filtering happens in Rust).
- "Spotlight" in Conductor names something else: syncing workspace changes to the repo root
  (`spotlighter.sh`, `spotlightSyncRequest`). That is the "Spotlight and run" area.

## Keyboard model (shared with the command palette)

From the keybinding table in `index-BGEQ8YjU.js`:

| id | key | title | scope |
|---|---|---|---|
| `nav.quickOpen` | Mod+P | "Quick open file" | global, configurable |
| `nav.searchInFiles` | Mod+Shift+F | "Search in files" | global, configurable |
| `dialog.primaryAction` | Mod+Enter | "Confirm dialog" | configurable |
| `commandPalette.nextTab` / `previousTab` | Tab / Shift+Tab | palette tabs | dialog priority |

- Opening `nav.quickOpen` toggles the dialog: if it is already the active dialog it closes.
  It only opens when the workspace is loaded and not archived.
- Inside the picker: Enter opens the selected file in edit mode. Mod+Enter
  (`dialog.primaryAction`) opens it in diff mode when the file has changes (the row hint reads
  "↵ file · ⌘↵ diff"). The selected row is `[cmdk-item][data-selected="true"]`.
- The command palette lists the picker as "File picker" (keywords quick, open, file,
  search, find, picker) with the `nav.quickOpen` shortcut hint.

## Copy

- Placeholder "Search files..."
- Empty states: "Loading files..." (fetching, empty query), "Searching files..." (fetching,
  with query), "No files found" (query, no results), "No files available" (no query, no files).

## Recent files

- Zustand store persisted as `recent-files-storage`: `{repositoryId, path, timestamp}`,
  newest first, de-duplicated per repository and path, capped at 200. `getRecentFiles(repo, n=5)`.
  A pick calls `addRecentFile` before navigating.

## Backend IPC

From the binary's command-argument string table and the frontend wrappers:

- `fuzzy_filter_files { fileCache (state), workspacePath, query, excludeDirectories }` (the local picker).
  Remote workspaces use the sidecar route `search` with the same body.
- `fuzzy_match_files { query, files, excludeDirectories }` (pre-workspace @-mentions).
- `list_file_tree { directoryPath, standardFilters, maxDepth }` (file tree; not this area).
- Result: `{ file: {name, path, is_directory}, score, match_indices, relative_path }`.
- Crates in the binary: `ignore-0.4.25` (`ignore::walk`), `nucleo-matcher-0.3.1`, `walkdir-2.5.0`.

## OpenConductor choices (not observed in Conductor)

- Results are capped at 200 per query (`MAX_RESULTS`), and an index stops at 100,000 entries.
  Conductor's caps were not visible in the bundle, and the Rust function was not decompiled.
- Index TTL is 15 s, the frontend `staleTime` Conductor uses for remote fuzzy search.
- Hidden files are indexed. `.git` is skipped, and `.gitignore`, `.git/info/exclude` and the
  global excludes apply.
- `match_indices` are UTF-16 offsets. Raw nucleo indices are grapheme or byte units, which
  highlight the wrong characters in JS for non-ASCII paths. Whether Conductor converts them is unverified.

## REA gaps hit

- Matching Rust command bodies (`fuzzy_filter_files`) to functions needs the native decompiler.
  The Ghidra provider was blocked in Wave 0 (see rea-test-report.md), so the caps and walker
  flags above come from strings and crate paths, not decompiled code.
