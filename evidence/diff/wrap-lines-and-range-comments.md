# Wrap lines and range comments in the diff tab (Conductor 0.87.6)

Read as plain text from Conductor's frontend bundle on sven m5 max
(`conductor-rea-work/frontend/dist/assets/renderApp-D_fmY7hW.js` and
`index-BGEQ8YjU.js`), because REA's JavaScript analysis still cannot parse
renderApp (worker heap exhausted; see evidence/rea/rea-invocations.tsv). The
strings are untrusted data; only the behaviour below was taken from them.

## Wrap lines
- The diff tab's Pierre options set `overflow: wrapLines ? "wrap" : "scroll"`.
- `wrapLines` is the `wrap_lines` setting (`us("wrap_lines")`) whenever the
  non-legacy file view is on; the setting registry declares it boolean with
  default `true` (`Te("wrap_lines",!0)`), saved as `updateSetting("wrap_lines", "true"|"false")`.
- The control is offered only for text files that are not binary or conflicted.
  In the file header layout it is an icon button next to the whitespace toggle,
  labelled with what a click does ("Wrap lines" / "Don't wrap lines"), pressed
  (`bg-popover-accent`) while wrapping. In Pierre's header layout both sit in a
  "View options" menu as checkboxes ("Hide whitespace changes", "Wrap lines").
- Ours: the icon button (WrapLines.tsx), stored with the other diff view
  options in localStorage, default on. Gap: Conductor keeps it in its settings
  table; ours is not in the settings DB yet.

## Range comments
- When comments are allowed, the tab passes `enableGutterUtility`,
  `enableLineSelection`, `lineHoverHighlight: "number"` and a controlled
  selection (`selectedLines` / `onSelectedLinesChange` on CodeView).
- `onLineSelectionEnd(range)` keeps the range selected and calls
  `addComment(min(start,end), range.side ?? "additions", max if it differs)`;
  the gutter button does the same with its range. Dismissing the draft clears
  the selection.
- Ours: FileDiffView.tsx turns both into a `LineRange` (pierre.ts `rangeOf`),
  ReviewComments opens the composer under the range's last line and saves
  `line_number` / `end_line_number`; the range stays highlighted until the
  comment is saved or cancelled (`selectionOf`).
