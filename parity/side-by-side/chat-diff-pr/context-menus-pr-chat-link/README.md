# Right-click menus: PR number and chat links

Conductor 0.87.6 against OpenConductor, dark theme. Captured with REA 6.8.0
`capture-browser-scenario` (right-click steps) by
[tools/context-menus/capture-links.mjs](../../../../tools/context-menus/capture-links.mjs)
from [links-shots.json](../../../../tools/context-menus/links-shots.json); REA
evidence ids and `compare-web-screenshots` results are in
[captures.json](captures.json). Conductor's behaviour was read from its
extracted bundle (`renderApp-D_fmY7hW.js`) as data.

| Menu | Conductor | OpenConductor | Status |
| --- | --- | --- | --- |
| PR number (header PR control `#N` and status pill `RFt`, PR title "#N" `sKo`) | `w_i` in `gy` `min-w-[180px]`: Open in &lt;target&gt; (arrow-up-right, ⌘⇧G), the other targets for a github.com PR, Copy link (copy), Copy number (hash) | main's `PrBadgeMenu.tsx` (#683, on the `PR #N` chip) is reused through the new `usePrBadgeMenu` hook on these triggers too | Matches the bundle; no Conductor capture (see gaps) |
| Open target URLs (`fds`) | Linear `linear.review/<owner>/<repo>/pull/<n>`, Graphite `app.graphite.com/github/pr/<owner>/<repo>/<n>`, non-GitHub PR: "Open in GitHub" / "Open remote" (`Zsi`) | `prUrlFor`, `prOpenItems` in main's `prLinks.ts` (unit tests in `prLinks.test.ts`) | Matches |
| Copy toasts (`n5`) | "Copied PR link to clipboard", "Copied PR number to clipboard", "Failed to copy to clipboard" | Same strings through the workspace `notify` | Matches |
| Chat markdown link (`cEi` -> `EQ`) | Copy link address (copy icon); toast "Copied address to clipboard" | `LinkMenu.tsx` on the shared `ContextMenu`; toast through the transcript's `notify` | Matches (side-by-side below) |
| File links in chat (`EQ` with `copyLabel` "Copy file path" + "Open in Finder") | Paths Conductor turns into `conductor-file://` links | Not built: OpenConductor draws inline-code paths as buttons, not links | Gap |

Shots:

- `sbs-pr-pill--dark.png`: the header PR control's `#42`, OpenConductor only.
- `sbs-pr-tab-number--dark.png`: "#42" in the PR tab title, OpenConductor only.
- `sbs-chat-link--dark.png`: a markdown web link in a reply, both apps. The
  Conductor side uses the screens harness scenario `chat-link` (populated plus
  a `[session docs](https://docs.example.com/auth/sessions)` link in lisbon's
  last reply). OpenConductor's browser preview echoes the prompt in its reply,
  so the shot sends the link as the prompt.

## Gaps

- No Conductor capture of the PR menu: Conductor fills its PR info (`Ko`) from
  its GitHub API layer, which the screens harness refuses, so neither the
  header pill nor the PR tab title exists there. The menu is checked against
  the bundle (`w_i`, `fds`, `d7t`, `Zsi`, `n5`) instead.
- Clipboard contents and the toasts were not observed on screen (REA has no
  clipboard read; the shots stop with the menu open).
- Not run in the Tauri/WebKit build; Chromium with a mocked backend only.

## REA gaps hit

- `capture-browser-scenario` has no clipboard read and no way to assert a
  toast after selecting a menu item without a second scenario.
- `rea search` still refuses JavaScript targets, so the bundle was read as
  plain text.
