# File search: reference behavior vs ours

Implementation: [`src-tauri/src/file_search/`](../../src-tauri/src/file_search/mod.rs). Tests: [`tests.rs`](../../src-tauri/src/file_search/tests.rs), run with [`run-tests.sh`](run-tests.sh). Obligation: `ws.file-tree-search`.

## Evidence used (REA reads of Conductor v0.87.6, read-only, on "sven m5 max")

- `evidence/ipc/frontend-invoke-candidates.json`: the frontend invokes `list_file_tree`, `fuzzy_match_files`, `fuzzy_filter_files`, `grep_workspace`, `get_file_metadata`, and the names also occur in the Rust binary.
- `evidence/ipc/rust-crates-from-paths.txt`: the binary links `ignore-0.4.25`, `nucleo-matcher-0.3.1`, `walkdir-2.5.0` and `grep-*`.
- The decoded frontend bundle (extracted with `tools/extract_tauri_assets.py`, analysed with REA `analyze-javascript-application`; the bundle stays outside the repo). Read 2026-11-05 at the call sites:
  - `list_file_tree` is called with `{directoryPath, standardFilters, maxDepth}`; quick open passes `standardFilters: true, maxDepth: null`, and results are mapped with `.path`.
  - `fuzzy_match_files` is called with `{query, files, excludeDirectories}` where `files` is the `list_file_tree` result; results are mapped with `.file.path`.
  - `fuzzy_filter_files` is called with `{query, workspacePath, excludeDirectories}` (the walk happens in Rust); a failure is logged and yields `[]`.
  - The keybinding table names `nav.quickOpen` (⌘P, "Quick open file", global) and `nav.searchInFiles`.

`standardFilters` and `maxDepth` are the names of `ignore::WalkBuilder` options, so we pass them straight through; that the reference does the same is an inference from the argument names plus the linked crate, not an observation of the Rust function.

## Matched

| Reference | Ours | Test |
|---|---|---|
| Three commands and their argument names | same (camelCase over IPC) | wiring PR |
| Walk with `ignore`, `standardFilters` / `maxDepth` | `WalkBuilder::standard_filters` / `max_depth` | `standard_filters_…`, `max_depth_limits_levels` |
| Match results carry `file.path` | `FileMatch { file, score, indices }` | all fuzzy tests |
| `excludeDirectories` flag | drops directory entries | `exclude_directories_and_empty_query` |
| Fuzzy matcher is nucleo | nucleo `Pattern` with `match_paths()`, smart case, smart normalization | `ranks_…`, `smart_case_…` |

## Ours (not observed in the reference)

- Fields beyond `path` / `file.path` (`name`, `isDirectory`, `score`, `indices`) and their names. The reference's full result shape was not recovered.
- Tie-break on equal score: shorter path, then path order. Empty query: every entry, shallow paths first.
- At most `MAX_RESULTS` (200) matches per query; the reference passes no limit.
- `.git` is never listed, and `.gitignore` is honored outside a git repo (`require_git(false)`).
- Paths are relative to the root and `/`-separated.

## Not done / unknown

- `grep_workspace` (search in files) and `get_file_metadata`: separate obligation work.
- The reference's case and normalization settings, and whether it sorts or caps results in Rust.
- REA gap: the Mac went offline mid-read, so the Rust side of these commands (Ghidra binding) was not examined; Ghidra on the main binary is already logged as blocked in `rea-test-report.md`.
