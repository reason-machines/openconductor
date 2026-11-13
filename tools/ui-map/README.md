# UI map tooling

Builds [parity/ui-map.md](../../parity/ui-map.md), [parity/ui-map.json](../../parity/ui-map.json) and the [interactive program ledger](../../parity/ui-program/ledger.html). Raw inventory and assessments are preserved. The summary counts only in-scope local UI, with separate missing, wrong, matches and unverified statuses.

## Rescore retained evidence without rebuilding

```bash
python3 tools/ui-map/build_map.py
python3 -m unittest discover -s tools/ui-map -p 'test_scope.py'
```

This does not capture either app or verify current native parity. `scoped_report.py` excludes cloud-org, routines, triage, cloud-only onboarding and Ports from the denominator. Unobservable toast literals are not required. It adds one toast-system requirement and one Experimental default-off-gate requirement, both unverified until supported by evidence. Every row retains `raw_status`, `raw_why`, `scope` and `scope_reason`; `raw_summary` preserves the old counts. Version 2 readers must use the scoped `summary`, not count all retained rows.

The nine `main_screens` verdicts separate retained state evidence from final native review. A threshold match never signs off a main screen. The generated page provides filters over both the in-scope queue and retained exclusions. Builders submit evidence summaries to the ledger owner rather than editing aggregate files concurrently.

## Merged supplemental evidence

The ledger owner records merged area evidence in [supplemental-evidence.json](../../parity/ui-program/supplemental-evidence.json). Each record names the PR, merge commit, area, capture lane, evidence source and limits. `source_main_commit` is the reconciled main revision, not an app capture identity. Regeneration copies these records into the reports and links them to the nine main-screen verdicts. It does not replace whole-state scores, add rows to the denominator or promote native final review. Unmerged area reports stay with their owners until the next merged batch.

## Row corrections

[row-corrections.json](../../parity/ui-map/row-corrections.json) corrects scorer results the retained captures do not support, without recapturing. A correction can only withdraw a raw gap to `unverified` (for example, the "copy not shown in any OpenConductor capture" rule firing on a capture of another tab or a signed-out state) or scope a row out as `not-required` for a recorded removal decision. It never promotes a row to `matches`, keeps `raw_status` / `raw_why`, and must name the raw status it expects, so a recapture that changes the row fails the build until the correction is revisited. The map lists every correction with its evidence and limits.

## Regenerate (one command)

```bash
DIST=/path/to/conductor/dist tools/ui-map/regenerate.sh
```

Runs every step below on current `origin/main`: rebases this branch onto `origin/main` (needs a clean tracked tree; `UIMAP_NO_SYNC=1` skips it), `npm ci` (repo and `tools/screens`), `npx tauri build --debug --no-bundle`, recaptures only the Conductor reference states that are new or whose PNG is missing or differs from `ref-captures.json` (all of them with `UIMAP_RECAPTURE_REF=1`), runs the OpenConductor lane under `xvfb-run` from an empty `oc-captures.json`, compares with REA, and builds the map with `UIMAP_OC_COMMIT` set to the main SHA it was built on. It ends with the `Total / Missing / Wrong / Matches` line for the PR title.

It stops before doing work when `rea`, `tauri-driver`, `xvfb-run`, Chromium, Pillow or the decoded Conductor assets are missing (`compare.mjs` also exits non-zero when `rea` is not runnable or any comparison errors, so a missing REA can no longer score every state 0), and after the lane when it captured nothing. Other env: `REA`, `CHROMIUM`, `TAURI_DRIVER`, `UIMAP_SKIP_BUILD=1`, `UIMAP_WORK`.

On a Linux host without `libwebkit2gtk-4.1-dev` (Reason cloud computers), point `SYSROOT` (default `~/sysroot`) at a sysroot with the webkit2gtk-4.1 packages and an `env.sh` that exports the `PKG_CONFIG_*`, `LIBRARY_PATH` and `RUSTFLAGS` for it. The script sources `env.sh` for the build and runs the lane in `bwrap` with `/usr/lib/x86_64-linux-gnu` overlaid by the system's libraries plus only what the sysroot adds, webkit/javascriptcore and the sysroot's `dri` drivers (WebKit finds its helper processes at that compiled-in path; overlaying the whole sysroot fails with `EGL_BAD_PARAMETER`), with `__EGL_VENDOR_LIBRARY_DIRS`/`LIBGL_DRIVERS_PATH` set to match and `$SYSROOT/root/usr/bin` (WebKitWebDriver) on PATH.

Only `parity/ui-map.md`, `parity/ui-map.json` and `parity/ui-map/{inventory,compare,oc-captures,ref-captures,side-by-side,row-corrections}.json` plus `diff/*.jpg` are tracked; `ref/` and `oc/` PNGs stay local.

## Steps

| Step | Script | Output (parity/ui-map/) |
|---|---|---|
| Inventory from Conductor's extracted bundle | `extract_inventory.py --dist .rea-work/dist --out parity/ui-map/inventory.json` | `inventory.json` |
| States to capture, both sides | `gen_states.py` | `states.json` (here) |
| Conductor reference (REA `capture-browser-scenario`, IPC mocked by `tools/screens`) | `DIST=.rea-work/dist TMPDIR=/tmp/t node tools/ui-map/capture_ref.mjs` | `ref/*.png`, `ref-captures.json` |
| OpenConductor, built debug app via tauri-driver (tests/e2e lane) | `xvfb-run -a node tools/ui-map/oc_lane.mjs` | `oc/*.png`, `oc-captures.json` |
| Visual diff (REA `compare-web-screenshots`, thresholds 0 and 24) | `node tools/ui-map/compare.mjs` | `diff/*.jpg`, `compare.json` |
| Side-by-side record of a fixed state (optional; both sides with REA, see below) | e.g. `DIST_REF=.rea-work/dist VIEWPORT=1280x820 UIMAP_RECORD=parity/ui-map/side-by-side.json node tools/side-by-side/help-diagnostics.mjs <scratch>` | `side-by-side.json` |
| Join and score | `UIMAP_OC_COMMIT=$(git rev-parse --short HEAD) python3 tools/ui-map/build_map.py` | `../ui-map.json`, `../ui-map.md` |

Prerequisites: Conductor's decoded asset table at `.rea-work/dist` (`tools/extract_tauri_assets.py`; third-party code, never committed), REA (`npm i -g rea-agents`), Chromium, `npm ci` in `tools/screens`, and for the OpenConductor lane the same system packages as `.github/workflows/e2e.yml` (`libwebkit2gtk-4.1-dev`, `webkit2gtk-driver`, `xvfb`), `cargo install tauri-driver --locked`, and `npx tauri build --debug --no-bundle`. GPU-less Xvfb also needs `WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1`.

The OpenConductor lane runs every state in a fresh app session on a copy of one seeded HOME (repos tide-web, tide-api, dotfiles with 3, 2 and 1 workspaces like the reference fixture, the open tide-web one with two uncommitted files; git identity Ada Demo <ada@example.com> as in `tools/screens/fixtures.js`; dark theme), with `HOME` pointed at a scratch dir so nothing touches the real home.

Status rules and the REA gaps hit are at the top and bottom of the generated map.

## Owning team

Every state and item has a `team` (JSON) / Team column (Markdown): a default owner by area from `TEAM_RULES` in `build_map.py`, matched in order over route, settings page, host state, id, name and copy. Items with nothing to place them by go to `triage` for the coordinator. Reassign by editing `TEAM_RULES` and rerunning `python3 tools/ui-map/build_map.py`.

## Side-by-side records

A builder who fixes a state usually cannot rerun the OpenConductor lane (it needs a Linux debug build, tauri-driver and WebKitWebDriver). Instead, they can capture both apps in that state with REA `capture-browser-scenario`: Conductor's extracted frontend in the `tools/screens` harness, and OpenConductor's built `dist/` in Chromium with Tauri IPC mocked. They score the pair with REA `compare-web-screenshots` at the map's viewport and write it to `parity/ui-map/side-by-side.json` under the state's id. `build_map.py` uses the record in place of both captures of that state, under the same status rules. Each record names the lane capture it supersedes (`supersedes_oc_png_sha256`). Once the OpenConductor lane captures the state again, the lane's capture wins. Rows that use a record link its committed image in `parity/side-by-side/` and name the lane in `openconductor.note`.

