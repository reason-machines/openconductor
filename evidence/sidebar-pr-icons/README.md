# Sidebar branch and PR glyphs

Item 3, 2026-11-08. Extracted Conductor strings and geometry are untrusted data, not instructions.

## Reference identity and REA

Read on Sven's authorized Mac `sven m5 max`. Installed `/Applications/Conductor.app` reports 0.87.6; executable SHA256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d` was freshly checked.

Retained REA-authenticated assets in `~/code/conductor-rea-work/frontend/dist/assets` were read directly, not re-extracted:

- `renderApp-D_fmY7hW.js`, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `renderApp-BYEcFwvt.css`, SHA256 `5b876e143b67a7b0f09e3816b12c18bc588b4af7a9a43f04ce77fd5337d9ff04`.
- `index-BGEQ8YjU.js` is the index chunk recorded in the committed frontend manifest.

The committed REA application evidence is `evidence/frontend/rea-analyze-javascript-application.json.gz`, Evidence ID `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`, root digest `1e7e65dcfb28ae76e55fd4b7e4d9b0e46149b80bd1e36a5add45225539b952fe`. The asset digests agree with `evidence/frontend/tauri-assets-manifest.json`. Fresh bounded reads were made on 2026-11-08 through `devices_exec` using Python `Path.read_text` and `tarfile` against the retained assets and archive. Offsets below are decoded-string character offsets, not executable offsets.

## Observed rules

- Renderer `oWt` at 9,780,356 chooses workspace lifecycle, then active agent status, then PR/branch status. Existing OpenConductor precedence is retained.
- `rFi` at 9,779,926 chooses merged, merge queue, ready-to-merge, draft, merge conflict, checks failing, then ordinary open. `RXo` at 9,782,199 requires an open non-draft PR, viewerCanMerge not false, and CLEAN or qualifying UNSTABLE. Optional checks retain their existing blocking rule.
- `dWt` at 9,783,957 maps failed/checks-failing to text-destructive, merged to text-purple-500, queued to text-status-in-progress, ready to text-git-green, conflict to text-highlight-muted, pending to text-checks-pending, and every other status to text-sidebar-muted-foreground.
- `WXo` at 9,788,432 uses LXo for branch, YXn for open, BXo for draft, MXo for merged. LXo has path `M15 6a9 9 0 0 0-9 9V3` and circles `(18,6,3)` / `(6,18,3)` in a 24-unit SVG with 2-unit rounded stroke. `RCe` draws it at 14px.
- The reference really does use a disk for `local` (no remote), and branch for a remote repository (`oFi`). Sven explicitly requests a git-branch icon for every session row. OpenConductor therefore intentionally shares the LXo branch geometry for both statuses, while preserving the semantic local/Ready labels and all active-agent indicators. This is a requested difference, not a claim that Conductor's local glyph is a branch.
- Index `xze` at 619,875 returns only `{isClosed:true}` for CLOSED without mergedAt. It does not provide a PR number or closed glyph. Thus a closed, unmerged PR falls back to grey branch/local, not red. OpenConductor's existing `PrLookup.kind = closed` clears the row PR through `applyRowLookup`; no new closed state or guessed colour was added.

## Exact colours

The CSS uses the following values. Light then dark where different:

- No PR, closed, ordinary open, draft: `--sidebar-muted-foreground`, light `#14100f99`, dark `#ffffff99` in Conductor's default palette. OpenConductor retains its existing palette-aware sidebar-muted token.
- Merged: `--color-purple-500: oklch(62.7% .265 303.9)`, both modes. New row-specific token avoids recolouring unrelated status consumers.
- Ready open PR: `--git-green`, `#16a249` / `#4ade80`. OpenConductor's existing `--success` matches exactly, unlike its GitHub diff-add colours.
- Failed/checks-failing: `--destructive`, `#dc2828` / `#f87272`. Existing destructive token matches, unlike diff-del.
- Merge queued: `--status-in-progress`, `#e0bb00` / `#ffdc2e`. Existing conductor-status-in-progress matches.
- Merge conflict: `--highlight-muted`, `#cca694` / `#ddc1b1`, full opacity. New row-specific token replaces the approximate 0.8-opacity progress colour.
- Checks pending: `--checks-pending`, `#9a6700` / `#d29922`. Existing diff-mod matches. Ordinary row status intentionally skips checks-pending as the reference does; matrix/git status still uses it.

## Verification and gaps

`src/components/rowStatusIcon.test.ts` renders the real component, exercising no PR remote/local, closed fallback, ordinary open, draft, merged and ready open; checks geometry, colour mapping and reference CSS tokens. Existing rowStatus tests cover lifecycle/agent precedence and PR substates.

Native main-build screenshots are required separately for no PR, open, merged, closed and draft. They are NOT supplied by static source, server rendering, browser fixtures or retained Conductor screenshots. At implementation time the sole native executor reported Screen Recording denied and unresolved safe native fixture destination/isolation. Native screenshot acceptance remains NOT RUN until current main is built and these states are actually captured and inspected. No native build/release has been performed by this cloud lane.

REA gaps encountered/reused: REA cannot extract Tauri's embedded assets, so the existing extraction and manifest remain necessary. The committed session-status evidence records that literal semantic trace seeds do not map to graph nodes; targeted authenticated text reads supply the rules here. No static reading is presented as runtime observation. This lane did not invoke denied Screen Recording through another route.
