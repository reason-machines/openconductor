# Right-click menus: Review button

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
| Review button menu `u6s`: Edit before sending | `ReviewButton` | Matches: one item, disabled with the button in an archived workspace; the menu shifts inside the window at the right edge |

![Review button](sbs-review-button--dark.png)

The Changes row (`Svs`), chat tab and PR badge menus landed in #683 with their own
side-by-side captures (tools/side-by-side/shell-menus.mjs).

## REA gaps and harness issues hit

- `rea capture-browser-scenario --schema` prints only `{inputJson: string}`; the action
  schema (`click` with `button: "right"`) had to be read from REA's bundled zod schema.
- With a long `TMPDIR`, capture-browser-scenario fails with a generic `execution_failure`
  and no step detail; `TMPDIR=/tmp/t` works.
- Conductor's extracted dist ships no Geist font files; the capture overlays
  OpenConductor's byte-identical files without touching the shared dist.
- `tools/screens` needs `npm ci` there (sql.js) before server.mjs serves.
