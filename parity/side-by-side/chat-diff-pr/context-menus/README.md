# Right-click menus: chat, diff and PR screens

Conductor | OpenConductor captures of each right-click menu, taken with REA
`capture-browser-scenario` (right-click step) in Conductor's extracted frontend
(tools/screens/server.mjs, mocked IPC) and in OpenConductor's Vite build, then
compared with `compare-web-screenshots`. Rerun:

```bash
npx vite build
DIST=~/conductor-fe/dist TMPDIR=/tmp/t node tools/context-menus/capture.mjs [shot ...]
```

| Conductor menu (renderApp) | Our element | Status |
| --- | --- | --- |
| File context menu `Svs` (Changes row, via `syi`): View, Open in ▸ (1-9), Copy path, Copy relative path, ── Discard changes | `FileContextMenu` on a Changes row | Matches: items, order, icons, separator, number keys, copy toasts (`n5`) |
| Review button menu `u6s`: Edit before sending | `ReviewButton` | Matches: one item, disabled with the button in an archived workspace; the menu shifts inside the window at the right edge |

Attach in chat is in `Svs` but the Changes row passes no attach handler, so
Conductor does not show it there either.

![Changes row](sbs-diff-file-row--dark.png)

![Review button](sbs-review-button--dark.png)

Chat tab, PR number and chat link menus are split into their own pull requests.

## REA gaps and harness issues hit

- `rea capture-browser-scenario --schema` prints only `{inputJson: string}`; the action
  schema (`click` with `button: "right"`) had to be read from REA's bundled zod schema.
- With a long `TMPDIR`, capture-browser-scenario fails with a generic `execution_failure`
  and no step detail; `TMPDIR=/tmp/t` works.
- Conductor's extracted dist ships no Geist font files; the capture overlays
  OpenConductor's byte-identical files without touching the shared dist.
- `tools/screens` needs `npm ci` there (sql.js) before server.mjs serves.
