# Sidebar Group by

Conductor Rebuild, 2026-11-07. This increment follows merged #746 against main; it does not duplicate Sort by product changes.

## Reference

The unchanged frontend comes from Sven's real Conductor 0.87.6: [extraction provenance](../frontend/README.md), REA application evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. The retained renderApp SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

Four fresh REA browser scenarios ran on Reason cloud in an isolated, invented personal account with `supportsLocal: true`. Inputs, captured DOM, screenshots, IDs and screenshot hashes are retained here. All four images were viewed. They establish only:

- Group by offers Status and Project; Project starts checked.
- Status renders Done, In review, In progress, Backlog and Canceled, including empty groups. Nonempty collapsed groups show counts (1, 1, 4 in this fixture).
- Expanding In progress shows four rows across projects with repository badges, in activity order.
- Returning to Project collapses the destination repository groups.

These reference captures are dark-theme Chromium, not native macOS/WebKit. Static observations from the authenticated bundle additionally identify `pra` (menu/reset), `cBi` (manual-status override, pinned/section exclusion, project filter, timestamp sort), `Cra` (selected-row default collapse), and `lzt`/`H6t` (settings key). Static observations alone do not prove those paths executed.

## REA gap

`semantic-gap.json` retains the recovered exact renderApp semantic-evidence context: its worker exhausted the 1,098,907,648-byte heap. Trace `ev_3a0819e5f0cca66bde2e50224b94a2dce483f2565b1d6420240b224bab4fca77` is partial with zero Group by seed matches. This is incomplete coverage, not feature absence. No extraction or semantic-analysis rerun was made.

The initial capture attempt from a separate bash sandbox did not produce reference evidence; the successful captures ran inside the supported preview process alongside its server. The server was stopped and its slot released at the end. No native launch/input or real workspace mutation occurred.

## Implementation

A typed `repo | status` preference defaults legacy `section` and unknown values to Project. Desktop writes use conductor.db settings; browser builds use localStorage. Status groups reuse the existing effective workspace status and selected timestamp, leave Pinned and sections intact, and share order/collapse with keyboard navigation. Explicit collapse survives desktop UI preference serialization. Switching grouping collapses destination groups.

## Verification

Passed on Reason cloud:

- Before implementation on the main-a988e5a8-equivalent tree: `node --experimental-strip-types --test src/state/sidebarGroupBy.test.ts` failed all four behavior tests (`before.tap.gz`).
- After implementation: `node --experimental-strip-types --test src/state/sidebarGroupBy.test.ts src/state/sidebarOrder.test.ts src/settings/appPrefs.test.ts src/state/persisted.test.ts` passed 34/34 (`after.tap`). This includes the identical original four, plus empty groups, selected/default/explicit collapse, project reset, filtered selection, typed updates and UI preference parsing/round-trip.
- `node --experimental-strip-types --test $(find src -name '*.test.ts' -print)` passed 1,305/1,305.
- `npm run build` passed TypeScript and Vite.
- `npm run lint:colors` passed six tests and the scan.
- `node --check` passed for main-shell, Group by fixture/check/capture drivers; `git diff --check` passed.

The local command `cargo test --manifest-path src-tauri/Cargo.toml --lib app_prefs::tests::sidebar_grouping_decodes_legacy_and_round_trips_through_sqlite --offline` could not start because the local cache lacks aes-gcm. The identical named test did pass in macOS Tauri CI on the initial published head `7cf9cded4cca4d0c94a55d42e5e681312a89255f`, run 42320999796, job 128245257078, log line 2377. This proves the in-memory SQLite test, not native UI behavior.

## Rendered proof status and limits

The bounded cloud after-proof ran with `SHELL_OUT=.oc-tmp/sidebar-group GROUP_SIDES=oc node tools/side-by-side/main-shell.mjs --group-check --group-capture`, through `preview_start` on port 4682. Dark and light checks passed for five-group order/counts, cross-project row order/badges, Project collapse reset, selected-radio keyboard navigation and grouping preference reload. Eight REA captures, inputs, DOM, evidence IDs and hashes are retained as `oc-*` and `after-captures.json`; `browser-checks.json` records assertions. All eight were inspected in a cropped contact sheet; menu dark and expanded light were also viewed full-size. This is feature inspection, not pixel-exact parity.

These captures are the initial implementation, local source `7c9b7b49` corresponding to published head `7cf9cded`. The screenshots precede the browser filter and header-glyph corrections below. The reference bundle was not recaptured. The OpenConductor fixture mirrors the reference's existing statuses; this browser is not a native macOS/WebKit app or a real conductor.db connection.

The first driver timed out because it expected Status focus after reopening a submenu whose selected option was Project. The corrected driver waits for Project, then asserts ArrowUp to Status, ArrowDown to Project and ArrowLeft to the trigger. No product keyboard behavior was changed.

An additional actual browser check reproduced a product bug: choosing tide-web left all Status counts at 1/1/4 because the old browser project-filter hook kept private local state while Status groups and shortcut numbering read appPrefs. The correction removes that duplicate store and persists the shared preference. Its new regression failed before (4/5 tests passed) and passes after; `filter-before.tap.gz` and `filter-after.tap` retain the evidence. Focused tests now pass 35/35; the full frontend suite passes 1,306/1,306 (`filter-full.tap.gz`), build and color lint pass. A scoped CSS binding also restores the Done/Canceled glyph cutouts outside their original menu scope.

The final bounded cloud check ran `SHELL_OUT=.oc-tmp/sidebar-group-filter-final node tools/side-by-side/main-shell.mjs --group-filter-check` on local product source `0704b6fe`, whose tree is byte-identical to published `8f73c35e` (`eab310286682b65db2a05fe5c1252fbef352cf29`). Both themes passed filtered counts 0/1/2/0/0, the two matching row names, shortcut numbers 1/2, persisted filter/grouping/explicit collapse after reload, and All projects restoring four rows with numbers 1/2/3/4 and project badges. `filter-checks.json` records those results. `oc-filter-dark.png` and `oc-filter-light.png` were each viewed full-size, including the Done/Canceled cutouts. This verifies their rendered presence, not reference light-theme or pixel-exact parity.

The first final driver failed after expanding the group because its unqualified button locator also matched both workspace rows. `filter-driver-before.json` retains that failure. The driver now targets the observed status-header button and keeps every assertion. The first passing light screenshot caught the menu fade before unmount; the final driver waits for menu detachment before capture. The same check then passed in both themes with the final screenshots retained here. These are driver/capture corrections, not product or REA defects. The final driver SHA-256 is `70e245cef59b055a96c9e2204d929ec24936f06c5fae98321c5969430fa7f12c`.

On this product tree, the same 35 focused tests and all 1,306 frontend tests passed again. Production build, color lint, driver syntax, and diff checks passed. No native/Rust run was added.

All owned previews were stopped. The final run server `c587a123-c7c7-47a6-bba1-23032aab1f35` on port 4682 started at 01:20:09Z and stopped before 01:21Z, within the ten-minute allocation. `preview-stop.json` retains its actual stop receipt and both prior driver-attempt stop receipts. No native launch/input, real repository/data mutation, agent execution or CI dispatch occurred.

Reference light-theme, whole-menu geometry, country-map rendering, tooltip pixels, touch/small-window and exact native/WebKit build behavior remain gaps. Local Rust execution is unavailable; the initial-head CI test result above is separate. Packaging success is not installation or behavioral verification. No Conductor cloud/team/routines/triage/org/cloud-workspace UI is added.
