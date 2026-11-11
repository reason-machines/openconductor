# Sidebar Sort by proof

Conductor Rebuild, 2026-11-07. Scoped local-account browser proof for PR #744, not whole-sidebar or native parity.

## Reference and fixture

The reference is the unmodified frontend extracted from Sven’s Conductor 0.87.6. See [frontend provenance](../frontend/README.md). `reference-hashes.json` verifies index.html and the index/renderApp assets against the extraction manifest. REA analysis ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367 covers that extracted bundle. `captures.json` records four fresh REA browser captures and their screenshot hashes.

`sidebar-sort-fixture.js` supplies invented personal-organization data with supportsLocal:true and opposing activity/creation dates. It does not alter the reference bundle. The reference uses SQL workspaces.local_id; the first fixture mistakenly used id and updated no creation timestamps. Correcting that fixture lets the same assertions pass. The old unknown-scope fixture is not evidence to remove menu options.

## Passed

- `before.tap`: the final sidebar-order regression against unchanged main f16d9338 failed 1 of 8 tests. Created incorrectly kept activity order.
- `node --experimental-strip-types --test src/home/sidebarSort.test.ts src/state/sidebarOrder.test.ts src/palette/fromAppState.test.ts src/settings/appPrefs.test.ts`: 27 passed, retained in after.tap.
- `SHELL_OUT=.oc-tmp/sidebar-sort SHELL_STATES=sidebar-sort SHELL_THEMES=dark,light node tools/side-by-side/main-shell.mjs --sort-check --capture`, started through preview_start on port 4682: the browser behavior portion passed; the following capture failed at its nested-text selector. After that correction, the same command with `--capture` only completed all four final REA captures.
- `checks.json`: both implementations in both themes change Osaka/Lisbon/Quito under Updated to Lisbon/Quito/Osaka under Created, restore Updated, and show the checked choice. Settled radio geometry is 120 × 32px with 14px/20px typography in all four cases. OpenConductor additionally passes ArrowRight/Down/Left focus navigation and Created persistence across reload.
- `node --check` for the changed proof scripts and `git diff --check` passed.

All four final screenshots were viewed before publication. The preview was stopped and its exact stop receipt sent to the Help owner. No Mac launch, stable-process input, credentials or real-data operation occurred.

## Capture limitations and corrections

The proof initially measured the reference during its scale transition and checked keyboard focus before its requestAnimationFrame. It now waits for settled row dimensions and the expected focus, retaining the exact assertions. REA’s initial OpenConductor capture did not reach the final screenshot because :text-is could not match the nested Sort by span. :has-text matches the observed menuitem on both implementations. The driver retains the failure evidence if capture fails. These were fixture/driver errors, not established REA defects.

## Follow-up reconciliation

After #744 merged, proof-only commit `d550a6a7` was reconciled with main `667ac60f` on the assigned branch. The net delta is these evidence files and the three fixture/driver corrections only; no product change is repeated. The same 27 focused tests, production build, color lint and proof-script syntax checks passed on the reconciled tree. The retained captures are the original bounded run, not a fresh capture of this later tree.

`git diff origin/main --check -- tools/side-by-side evidence/sidebar-sort/README.md` passed. The whole-delta whitespace check reports the two whitespace-only diagnostic lines in raw `before.tap`; that historical TAP output is retained verbatim.

## Remaining gaps

Group by is missing. Whole-menu geometry, surrounding shell, reference country-map rendering, tooltip pixels, small-window/touch and native macOS/WebKit parity are not claimed. The native owner proved an older source build, not a #734/#744 consuming build; exact-window capture failed. Package success is not installation or behavioral verification. Browser reload persistence uses the isolated fixture’s mocked native preference boundary, not the real conductor.db. Real Rust preference round-trip execution is delegated to CI.
