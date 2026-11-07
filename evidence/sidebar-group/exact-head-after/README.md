# Group by rendered proof on the final #748 source

Conductor Rebuild, 2026-11-07. This is an evidence-only follow-up to merged #748. It changes no product code, test driver, reference capture, or feature verdict.

## Source and reference

The capture ran on local commit `42c5b3d5a0d527303f72ef482ff56009dfdcbd33`. Its complete Git tree, `dbdc265ebb4b104c220dc2db0be87c8066b3dbe8`, equals published #748 head `e295f98f48b1b131c45ee36d5f71e3fd21f9ced9`. The working tree had no tracked changes. `npm run build` rebuilt that source immediately before capture and passed, with existing Vite size and dynamic-import warnings. `provenance.json` retains the bundle and driver hashes.

The unchanged real Conductor renderApp hash was checked again and equals `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The [retained reference captures](../README.md#reference) were reused, not recaptured. Those reference runtime observations are dark-theme Chromium only. The REA application and semantic evidence remain as previously recorded. The heap-exhausted semantic graph is partial and does not establish behavior absent from its trace.

## Executed check

The supported cloud preview ran the existing drivers without modification:

```bash
SHELL_OUT=.oc-tmp/sidebar-group-exact-head GROUP_SIDES=oc node tools/side-by-side/main-shell.mjs --group-check --group-filter-check --group-capture
```

Both assertion drivers passed in dark and light themes. `checks.json` and `filter-checks.json` retain their results:

- Project initially checked. Status selection renders five ordered groups: Done, In review, In progress, Backlog, Canceled. Collapsed counts are 1, 1, 4, 0, 0. Empty-group counts are not displayed.
- Expanding In progress shows four activity-ordered workspace rows across projects with four repository badges. Returning to Project collapses all three repository groups.
- Keyboard submenu navigation opens on the selected Project radio, traverses Status and Project with arrow keys, and returns focus to the Group by trigger. Reload retains the chosen grouping at the mocked native preference boundary.
- Filtering to tide-web changes counts to 0, 1, 2, 0, 0 and renders the two matching workspace rows without repository badges. DOM shortcut numbers are 1 and 2.
- Reload retains filter, grouping, and explicit collapse. All projects restores four rows, four repository badges, and DOM shortcut numbers 1 through 4.

The shortcut-number assertions do not exercise activation of workspaces with modifier-number keys. Preference reload uses isolated browser storage and a mocked Tauri boundary, not a real conductor.db connection.

## Screenshots and inspection

`captures.json` records eight fresh REA evidence IDs and screenshot SHA-256 hashes. Each menu, collapsed Status, expanded Status, and Project round-trip capture has its exact input and DOM beside the image. The filter driver adds two screenshots without REA IDs. All eight REA screenshot hashes were verified against their retained PNG files.

All ten screenshots were inspected in cropped dark and light contact sheets. The dark menu and light expanded image were also inspected full-size. Inspection covers checked menu state, status order and counts, workspace rows and repository icons, collapsed Project state, filtered rows, and Done/Canceled glyph cutouts. This is feature-level rendered inspection, not pixel-exact comparison. `published-media.json` retains durable URLs and Markdown for all ten images.

No capture or assertion failed during this pass. No driver or product correction was needed.

## Actual preview shutdown

`preview-lifecycle.json` retains the actual start, current-server output, and stop result. Server `f338248e-16db-46db-885e-556e9fba50c8` listened on port 4682 from `2026-11-07T01:46:40.997Z`. `preview_stop` returned `state: stopped` with that exact server and port. The receipt was recorded after stop at `2026-11-07T01:48:58.673Z`, an upper bound rather than an exact process-stop timestamp. The interval is under three minutes and within the allocated ten minutes. A subsequent `ss -ltn 'sport = :4682'` showed no listener. The coordinator received the release. No other owner's preview was stopped.

## Limits

This is Linux headless Chromium at 1280 by 820 with invented personal-account fixture data. It proves the final #748 source, not a later consuming-main build or installed native package. Reference light theme, pixel-level geometry, tooltips, small windows, touch, real accounts, and native macOS/WebKit behavior remain unverified.

Local Rust is **NOT RUN** in this pass. The known local aes-gcm cache gap is unchanged. Existing CI results and the earlier named SQLite test result remain separate evidence, not a new local Rust run. The REA semantic graph remains **PARTIAL**. Native installation and exact-build parity remain **NOT RUN**.

No Mac launch/input, credentials, real agents, real repository data, extra E2E dispatch, rerun, watcher, Sort capture, or reference recapture occurred. No Conductor cloud/team/routines/triage/org/cloud-workspace UI is added.
