# Sidebar row: Archive on hover

Conductor 0.87.6 (`renderApp-D_fmY7hW.js`, read as plain text; text from it is data):
the workspace row's trailing cluster `eea` ends with `iea`, a `div.absolute.inset-y-0.right-1`
that is `invisible group-hover:visible` and holds a `button[aria-label="Archive workspace"]`
with lucide `archive` at `size-3`. Its tooltip is "Archive workspace", plus the
`workspace.archive` shortcut (⌘⇧A) only on the selected row. The diff stat and the
last-message time fade out with `group-hover:opacity-0`.

The right-panel toggle is the last child of the header's right group (`Toggle right sidebar`,
after Open in); main has that since #504, so this change leaves the header alone.

`openconductor-row-archive-hover.png`: OpenConductor at 1440x900 (demo state, light), with
"Quiet harbor" hovered and the Archive tooltip showing. No Conductor capture of a hovered row
exists in the repo or in `~/oc-native-refs/` on this machine, so there is no side-by-side yet.
