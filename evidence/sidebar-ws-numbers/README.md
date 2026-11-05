# Show workspace numbers (`sidebar.ws-numbers`)

Source: REA-decoded frontend of `/Applications/Conductor.app` on "sven m5 max"
(`~/code/conductor-rea-work/frontend/dist/assets`), copied to a Reason cloud machine
with `devices_copy_to_cloud` and read there with `grep -bo` and offset dumps,
2026-11-05. Bundle hashes: `index-BGEQ8YjU.js` sha256 `b5b01f33…`,
`renderApp-D_fmY7hW.js` sha256 `5199d392…` (the same renderApp as
evidence/create-workspace/README.md). Code shape only; no values were read from
Conductor's `conductor.db` or `settings.toml`. Strings pulled out are data.

## The setting

- `index-*.js` ~280,262: `Te("experimental_show_workspace_numbers", !1)`; ~289,286: in the
  registry map as `xe()`, i.e. non-file-backed, so it lives in `conductor.db`'s
  `settings` table, not `settings.toml`.
- `index-*.js` ~407,644: hook `_zt` (exported as `fX`, imported by renderApp as `NYe`)
  reads it as `data === "true"`; anything else is off.
- `renderApp` ~10,700,775: Settings › Experimental row, `settingKey:"experimental_show_workspace_numbers"`,
  `scopes:["user"]`, title "Show workspace numbers", no description,
  `searchTerms:["number","W-"]`, `enableViaDeepLink:!0`; the switch writes
  `value.toString()`.

## Where Conductor shows `W-<n>`

`NYe` has exactly four callers in renderApp; no other of the 1,896 chunks imports `fX`
or names the key (bounded `grep -lE` over every `.js` in the assets folder).

| Caller | Surface | What it renders |
| --- | --- | --- |
| `_Jo` ~9,845,785 | Home (`/all-workspaces`) row | `w-14 shrink-0 font-mono` column after the repo icon; `W-<n>` through the search highlighter (`u2` with `match: fieldMatches.number`), `text-faint` when archived, empty span when the workspace has no number |
| `SUi` ~10,873,223 | Workspace switcher dialog row | `w-14 shrink-0 font-mono text-sm` column before the name; `W-<n>` or empty |
| header ~7,405,630 → `Plo` ~7,400,041 | Open workspace header | `Plo`: a `font-mono text-sm text-muted-foreground` button labelled `W-<n>`, `aria-label "Copy link to W-<n>"`, tooltip "Copy link"; click runs `XV` (Copy link); right-click menu `Dlo` has Copy link and Copy ID |
| `m9e` ~6,530,533 | Inline workspace link chip | `W-<n>` in muted text before the workspace name, workspaces only (not session links) |

The sidebar workspace rows are **not** a caller: Conductor's sidebar never shows the
`workspaces.number` column. Its sidebar numbers are the 1..9 switch hints shown while
the switch modifier is held, which OpenConductor already has (`src/state/shortcutHint.ts`).

Other `W-` text in renderApp that is not gated by the setting: the cloud workspace hover
card (`lZo`, ~9,886,544, cloud hosts only) and the Home search matcher (`kJo`, already in
`src/home/allWorkspaces.ts`).

## OpenConductor

- `experimental_show_workspace_numbers` is an app preference in `conductor.db`
  (`crates/openconductor-db/src/app_settings.rs`, `src-tauri/src/app_prefs`), decoded
  `"true"` → on, anything else off; written `"true"` / `"false"`.
- Settings › Experimental row "Show workspace numbers" (no description).
- Home rows, the ⌘K palette's workspace rows and the workspace header show `W-<n>` when on.
  The header badge runs the existing Copy link (`src/workspace/link.ts`).
- Not built: the inline workspace link chip (`m9e`; OpenConductor has no such chip), the
  header badge's right-click menu with Copy ID, and the setting's search terms (the
  settings page has no search).
