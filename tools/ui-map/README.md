# UI map tooling

Builds [parity/ui-map.md](../../parity/ui-map.md) and [parity/ui-map.json](../../parity/ui-map.json): every Conductor screen, route, panel, dialog, menu, popover, toast, empty state and settings page and row, each with a Conductor reference screenshot, an OpenConductor screenshot from the built app, a REA visual diff and a status (missing / wrong / matches).

| Step | Script | Output (parity/ui-map/) |
|---|---|---|
| Inventory from Conductor's extracted bundle | `extract_inventory.py --dist .rea-work/dist --out parity/ui-map/inventory.json` | `inventory.json` |
| States to capture, both sides | `gen_states.py` | `states.json` (here) |
| Conductor reference (REA `capture-browser-scenario`, IPC mocked by `tools/screens`) | `DIST=.rea-work/dist TMPDIR=/tmp/t node tools/ui-map/capture_ref.mjs` | `ref/*.png`, `ref-captures.json` |
| OpenConductor, built debug app via tauri-driver (tests/e2e lane) | `xvfb-run -a node tools/ui-map/oc_lane.mjs` | `oc/*.png`, `oc-captures.json` |
| Visual diff (REA `compare-web-screenshots`, thresholds 0 and 24) | `node tools/ui-map/compare.mjs` | `diff/*.jpg`, `compare.json` |
| Join and score | `UIMAP_OC_COMMIT=$(git rev-parse --short HEAD) python3 tools/ui-map/build_map.py` | `../ui-map.json`, `../ui-map.md` |

Prerequisites: Conductor's decoded asset table at `.rea-work/dist` (`tools/extract_tauri_assets.py`; third-party code, never committed), REA (`npm i -g rea-agents`), Chromium, `npm ci` in `tools/screens`, and for the OpenConductor lane the same system packages as `.github/workflows/e2e.yml` (`libwebkit2gtk-4.1-dev`, `webkit2gtk-driver`, `xvfb`), `cargo install tauri-driver --locked`, and `npx tauri build --debug --no-bundle`. GPU-less Xvfb also needs `WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1`.

The OpenConductor lane runs every state in a fresh app session on a copy of one seeded HOME (repos tide-web, tide-api, dotfiles; one workspace in tide-web with two uncommitted files; dark theme), with `HOME` pointed at a scratch dir so nothing touches the real home.

Status rules and the REA gaps hit are at the top and bottom of the generated map.

## Owning team

Every state and item has a `team` (JSON) / Team column (Markdown): a default owner by area from `TEAM_RULES` in `build_map.py`, matched in order over route, settings page, host state, id, name and copy. Items with nothing to place them by go to `triage` for the coordinator. Reassign by editing `TEAM_RULES` and rerunning `python3 tools/ui-map/build_map.py`.
