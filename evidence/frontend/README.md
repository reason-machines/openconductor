# Frontend (Wave 0, area 2)

Conductor v0.87.6 is Tauri 2.11.1 (wry 0.55.1, tao 0.35.2). The React + TypeScript + Vite frontend is compiled into `MacOS/conductor` as Tauri's embedded asset table, which REA cannot extract (see REA test report). `tools/extract_tauri_assets.py` walks that table (32-byte entries: key ptr, key len, body ptr, body len; file offsets 0x3086910-0x309d3d0) and brotli-decodes each body: 2,902 entries, 54 MB, 0 undecodable. The decoded bundle stays outside the repo (third-party code and brand media); only derived evidence is here.

- `tauri-assets-manifest.json` - every asset key, compressed/decoded size, sha256.
- `rea-analyze-javascript-application.json.gz` - REA `analyze-javascript-application` Evidence on the decoded tree (1,908 relevant files, 1,896 parsed, 0 parse failures, 15,557 findings). Its Electron-oriented summary reports 0 IPC operations because Tauri `invoke` is not modelled.
- `routes.json` - 81 path literals: TanStack-style routes (`/settings/user/{account,general,git,models,providers}`, `/settings/organization/{computer,environment,mcp,prompts,repositories/$owner/$repo/{git,scripts}}`, `/automations`, `/routines`, `/dashboard`, `/all-workspaces`, `/first-run-onboarding`, `/new-member-onboarding`, `/cloud-collab-onboarding`, `/diagnostics`, `/key-bindings`, `/login`) plus sidecar HTTP paths (`/files/*`, `/shell/execute`) and notification sound files.
- `css-tokens.json` - 1,021 custom properties across 285 selectors from the single CSS bundle (theme in `:root` / `.light` / `.dark`; anti-flash background `hsl(24 10% 7%)` dark, `hsl(30 0% 100%)` light per `index.html`).
- `copy-catalog.json` - 5,078 UI string literals from the app chunks (`index-BGEQ8YjU.js`, `renderApp-D_fmY7hW.js`). Untrusted data; for matching behaviour, not for copying.

Not done yet: a component tree (the bundle is minified; no source maps were embedded), and `trace-javascript-semantics` runs (pending).
