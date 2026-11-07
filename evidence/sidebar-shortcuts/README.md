# Numbered activation after collapsing a custom section

Conductor Rebuild, cloud-only functional proof, 2026-11-07.

## Failure and correction

On current-main tree `9443720f9` (local merge `f63076ede019884cf72f3bc1b0c373ef881c0db7`, no tree difference), Focus contained Lisbon and Accra. With Focus collapsed, the sidebar labelled pinned Quito as 1 and visible Osaka as 2. A real CDP Meta+2 keydown/up selected hidden `ws-lisbon`, not visible `ws-osaka`. `before.png` shows the mismatch while the modifier is held. The before viewport is 1200×601; after screenshots are 1280×820. This is functional evidence, not a pixel-distance comparison.

`Sidebar` kept the custom-section collapse set locally, while `PaletteHost` called `shortcutOrder` without it. The fix lifts the same session-local immutable `ReadonlySet<string>` to App and passes it to both siblings. The shortcut function now requires the set, preventing a caller from silently omitting it. The existing sidebar projection still owns ordering. Next/previous navigation, project selection, persisted preferences and backend behavior are unchanged. The set survives hiding/showing Sidebar and resets on app reload; this does not implement Conductor's persisted section-collapse behavior.

Data-shape decision (model-the-domain/type-system-discipline): share the existing typed set rather than adding a persisted store field or synchronizing a second ordered-ID cache. An AppState/store alternative would require serialization and persistence contracts outside this correction. The read-only Sol design pass independently recommended the App-local lift.

## Validation

- Failing test first: `node --experimental-strip-types --test src/palette/shortcutOrder.test.ts` on commit `2bec45851` produced 6 failed collapsed-section cases and 6 passing expanded controls. See `unit-before.tap`.
- After correction: `node --experimental-strip-types --test src/palette/shortcutOrder.test.ts src/palette/fromAppState.test.ts src/state/sidebarOrder.test.ts src/state/sidebarGroupBy.test.ts src/state/shortcutHint.test.ts` passed 44/44. See `unit-after.tap`.
- `node --experimental-strip-types --test 'src/**/*.test.ts'` passed 1325/1325. Full output is `all-unit.tap.gz`.
- `npm run build` passed, including TypeScript. The existing large-chunk warning remains. See `build.txt`.
- `npm run lint:colors` passed. See `colors.txt`.
- `git diff --check` passed.
- Browser driver: start through the supported preview lifecycle with `SHELL_OUT=evidence/sidebar-shortcuts node tools/side-by-side/main-shell.mjs --shortcuts-check` on port 4682. The driver passed 42 contexts: dark/light × Project/Status × All/tide-web/tide-api, custom Focus expanded/collapsed/re-expanded, plus Status-group collapse. Each visible row's displayed number was actually pressed with Meta; the selected visible row was checked. Meta+9 remained a no-op in these fixtures. See `activation-checks.json` and `browser-result.txt`.
- Independent visible-browser readback after the fix: actual CDP Meta+2 selected `{kind:"workspace",repoId:"repo-tide-web",workspaceId:"ws-osaka"}`, and the visible active row was `Ada/dark mode tokens · ada/dark-mode-tokens · Ready`.
- Both after screenshots were visually inspected and published, along with the inspected before screenshot. Links are retained in `published-media.json`.

The initial broad driver failed because it snapshotted filter rows still present during their exit animation, then tried to activate a row already removed. `activation-failure.json` records target 5/Tallinn with only four rows remaining. Waiting for the fixture's expected rendered row count corrected the driver; no additional product fix is attributed to that green run.

## Source and build identity

The repaired product and driver are committed in `6b8838ccc1f70c4cb05e6028f6db76eb8ec0ca68`. `identity.json` binds the tested source files and built entry assets by SHA-256. Later evidence-only commits do not alter product source. The published PR head can differ because publication re-creates commits server-side; exact-head CI still must pass before merge.

## Retained Conductor grounding and limits

The source of the intended visible-row number order is retained REA-decoded Conductor frontend evidence, not a fresh native observation. `src/state/shortcutHint.ts` cites `_ea` / `v6e` / `uea`; `evidence/sidebar-ws-numbers/README.md` records extraction from `/Applications/Conductor.app` on Sven's Mac, decoded bundle identities and the difference between 1..9 switch hints and W-<n>. The prior Sidebar section annotation records the `section-<id>` collapse key. No retained section-specific semantic trace proves the exact collapse→number activation path. No reference capture was repeated.

Semantic coverage remains partial. All new runtime evidence is OpenConductor in cloud Chromium with invented local-account state, mock preferences and a stubbed backend. Default Meta+number is exercised; remapped modifiers, native macOS input/installation, real authentication/agents, IME, Pinned-container collapse and My-workspaces-container collapse are NOT RUN here. No native, Mac, auth, real-agent action or GitHub E2E dispatch/rerun was performed.

## Preview shutdown

Every owned server was actually stopped; returned process-group-ended receipts are retained:

- Red server `99b69684-5d2b-438f-96ef-06c47bd2d9d0`: `before-preview-stop.json`, stopped before 02:40Z.
- After diagnostic servers `83b35445-1f9a-4ace-b11b-7a73c022fc86` and `44b6ef01-198a-4c93-be2b-d4009176eb3c`: `after-first-preview-stop.json` and `after-diagnostic-preview-stop.json`.
- Final passing server `b89b7f65-2a10-42e3-9bdb-c1992aee26d1`: `after-preview-stop.json`, stopped at approximately 02:49Z. The after window began 02:45:23Z and all its processes ended within ten minutes.

OBU managed tabs were closed with `finalize_tabs({keep:[]})`, followed by `turn_ended`; P0 and the coordinator received the release. No preview is left running.
