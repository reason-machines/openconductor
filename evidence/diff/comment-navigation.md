# Comment navigation in the diff tab: reference behaviour

Source: Conductor.app 0.87.6 on sven m5 max, decoded frontend bundle under
`~/code/conductor-rea-work/frontend/dist/assets/renderApp-D_fmY7hW.js`, read
2026-11-05 around the `diff.previousComment` / `diff.nextComment` command ids.
Untrusted data: described in our own words, no code copied.

REA gap: the REA `analyze-javascript-application` Evidence for this bundle
(`ev_b733d96728b664ae9...`) has no semantic facts for `renderApp` (parent
result budget exhausted), so `trace-javascript-semantics` cannot reach these
functions; they were read with a bounded plain-text read
(`evidence/rea/rea-invocations.tsv`, `diff_comment_nav_bundle_read`).

## What Conductor does

- Each open file in the diff tab is a Pierre `CodeView` item. Over it float
  two buttons: "Previous comment" pinned near the top and "Next comment"
  near the bottom (above the composer overlay), centred, outline style, each
  with a chevron, a count and the command's shortcut. A button is shown only
  while its count is above zero.
- Counting: every comment line of the file (one per side and line) is
  measured in the scroll content. The reading line is 56 px below the top of
  the viewport. Comments overlapping the band from the reading line to the
  viewport bottom are "visible" and count in neither direction; the ones
  before them are previous and the ones after are next. When none is
  visible, comments at or above the reading line are previous and the rest
  next. Counts are recomputed on scroll and after each render.
- Navigating scrolls the CodeView to the nearest comment line in that
  direction, aligned to the top with the same 56 px offset, smoothly.
- The buttons bind `diff.previousComment` and `diff.nextComment` one step
  above high priority. Navigating returns false when there is no comment
  that way, so the key falls through to other handlers.

## OpenConductor

- `src/features/diff/nav.ts`: `commentWindow` (the counting rule) and
  `measureComments` (reads Pierre's `getTopForItem`, `getRenderedItems`,
  per-line `getLinePosition` and the container's scroll position; typed
  structurally so it is unit-tested with a fake view).
- `src/features/diff/CommentNav.tsx`: `useCommentNavigation` (subscribes to
  the CodeView's scroll, re-measures on demand) and `CommentNav` (the two
  buttons, with the effective shortcut from the keybinding registry).
- `src/keybindings`: `useKeybindings` and `bindCommands` take an optional
  priority; `CommentNav` binds at `PRIORITY.HIGH + 1`. When the file has no
  comment that way the key falls through to the cross-file comment stepping
  in `ReviewComments.tsx`.
- Mounting: inside the position-relative box around the file's `CodeView`
  in `FileDiffView.tsx`, once that file renders through `CodeView`.
