# UI map tooling

Builds [parity/ui-map.md](../../parity/ui-map.md) and [parity/ui-map.json](../../parity/ui-map.json): every Conductor screen, route, panel, dialog, menu, popover, toast, empty state and settings page and row, each with a Conductor reference screenshot, an OpenConductor screenshot from the built app, a REA visual diff and a status (missing / wrong / matches).

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

The OpenConductor lane runs every state in a fresh app session on a copy of one seeded HOME (repos tide-web, tide-api, dotfiles; one workspace in tide-web with two uncommitted files; dark theme), with `HOME` pointed at a scratch dir so nothing touches the real home.

Status rules and the REA gaps hit are at the top and bottom of the generated map.

## Owning team

Every state and item has a `team` (JSON) / Team column (Markdown): a default owner by area from `TEAM_RULES` in `build_map.py`, matched in order over route, settings page, host state, id, name and copy. Items with nothing to place them by go to `triage` for the coordinator. Reassign by editing `TEAM_RULES` and rerunning `python3 tools/ui-map/build_map.py`.

## Side-by-side records

A builder who fixes a state usually cannot rerun the OpenConductor lane (it needs a Linux debug build, tauri-driver and WebKitWebDriver). Instead, they can capture both apps in that state with REA `capture-browser-scenario`: Conductor's extracted frontend in the `tools/screens` harness, and OpenConductor's built `dist/` in Chromium with Tauri IPC mocked. They score the pair with REA `compare-web-screenshots` at the map's viewport and write it to `parity/ui-map/side-by-side.json` under the state's id. `build_map.py` uses the record in place of both captures of that state, under the same status rules. Each record names the lane capture it supersedes (`supersedes_oc_png_sha256`). Once the OpenConductor lane captures the state again, the lane's capture wins. Rows that use a record link its committed image in `parity/side-by-side/` and name the lane in `openconductor.note`.

