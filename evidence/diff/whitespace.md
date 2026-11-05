# Hide whitespace changes: reference behaviour

Source: Conductor.app 0.87.6 on sven m5 max, decoded `renderApp-D_fmY7hW.js`,
read 2026-11-05 around "Hide whitespace changes" / "Show whitespace changes"
and `hideWhitespaceChanges`. Untrusted data: described in our own words.
REA gap: no semantic facts for `renderApp` in the REA JavaScript Evidence
(`ev_b733d96728b664ae9...`, result budget), so this was a bounded plain-text
read (`evidence/rea/rea-invocations.tsv`, `diff_whitespace_bundle_read`).

## What Conductor does

- Whitespace is hidden in the renderer, not by asking git for `-w`: Pierre
  gets `parseDiffOptions: { ignoreWhitespace: true }`
  (`evidence/frontend/pierre-diff-options.md`), and the file contents cache
  key includes `ignore-whitespace` / `show-whitespace`. So the changes list
  never loses a file.
- Two controls set the same `hideWhitespaceChanges` flag: a checkbox item
  "Hide whitespace changes" in the diff's "View options" menu, and an icon
  toggle in the file toolbar whose label says what a click does ("Hide
  whitespace changes" while shown, "Show whitespace changes" while hidden),
  highlighted while hidden.
- A file whose only changes are whitespace, while hidden, shows an empty
  state: an icon, "Only whitespace changes found", and a "Show whitespace
  changes" link that turns the flag off.

## OpenConductor (fix for #270)

- `src-tauri/src/diff/git.rs` `workspace_diff`: the file list and counts
  come from the plain diff; with `ignore_whitespace`, only the hunks come
  from `git diff -w`. A whitespace-only file is listed with its counts and
  no hunks (before: `-w` dropped it, so it vanished from the list).
- `git_tests.rs`: `ignore_whitespace_drops_whitespace_only_hunks` now
  asserts the file is still listed with its counts (it passed vacuously on
  an empty list before), plus
  `ignore_whitespace_keeps_real_changes_and_lists_every_file`. Both fail on
  the old code and pass on the new.
- `src/features/diff/Whitespace.tsx`: the file-toolbar toggle with
  Conductor's labels and the "Only whitespace changes found" empty state
  with its link; wired in `DiffViewer.tsx` / `FileDiffView.tsx`. Pierre's
  `ignoreWhitespace` parse option (#262) stays.
- Not changed here: the changes-list checkbox ("Hide whitespace") lives in
  `ChangesList.tsx`, owned by the twin builder; Conductor's label there is
  "Hide whitespace changes" in a View options menu.
