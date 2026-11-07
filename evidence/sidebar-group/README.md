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

Not run successfully: `cargo test --manifest-path src-tauri/Cargo.toml --lib app_prefs::tests::sidebar_grouping_decodes_legacy_and_round_trips_through_sqlite --offline` could not start because the local cache lacks aes-gcm. The Rust in-memory SQLite test must be exercised by CI; no native parity is promoted.

## Rendered proof status and limits

The OpenConductor after-proof has NOT run yet. Its next bounded cloud slot is requested from the shared capture coordinator. The reusable driver is `SHELL_OUT=.oc-tmp/sidebar-group node tools/side-by-side/main-shell.mjs --group-check --group-capture`, started only through `preview_start` on port 4682 once that slot is allocated. `GROUP_SIDES=ref` would capture the real extracted frontend; do not repeat the retained reference captures without a changed question. The OpenConductor fixture mirrors the reference's existing statuses; reload checks use a mocked native preference boundary, not conductor.db.

Reference light-theme, whole-menu geometry, country-map rendering, tooltip pixels, touch/small-window, native Rust execution and exact native/WebKit build behavior remain gaps. Packaging success is not installation or behavioral verification. No Conductor cloud/team/routines/triage/org/cloud-workspace UI is added.
