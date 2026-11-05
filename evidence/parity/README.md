# Parity: settings, shortcuts, persistence, packaging

`tools/parity_check.py` scores a git ref of this repository against the Conductor 0.87.6 evidence for four areas and writes [`PARITY.md`](PARITY.md) and [`parity-report.json`](parity-report.json). The report in this directory is for `origin/main` at the commit named in its first line.

```bash
# Full run: REA inspects the rebuild's SQLite schema too (needs Node.js 24.15+ for REA's SQLite reader).
REA_NODE_BIN=/path/to/node-v24/bin python3 tools/parity_check.py check --ref origin/main --rea
# Rebuild the settings and packaging reference files.
python3 tools/parity_check.py reference --schema-user settings.schema.json --schema-repo settings.repo.schema.json
```

CI runs the checker without REA on every PR so it keeps working as the tree changes.

## Scoring

Each item is `matched` (1), `partial` or `declared` (0.5) or `missing` (0). Items have equal weight within an area.

| Area | Items | Conductor reference | How the rebuild is probed |
|---|---|---|---|
| Settings | 43 user and 32 repo `settings.toml` keys, 29 `settings` table keys, 5 settings files, 16 settings routes | Published JSON schemas named by the `$schema` stamp in Conductor's `settings.toml` (all 44 leaf names also occur in the 0.87.6 frontend bundle); key names of the live `settings` table; `evidence/frontend/routes.json` | A `settings.toml` key is `matched` when a file that handles `settings.toml` names it, `declared` when only other code names it (a DB column or struct field). |
| Shortcuts | 165 bindings plus 7 features (registry, override storage `keybinding_overrides_v1`, legacy aliases, conflict scopes, shortcuts dialog, `/key-bindings` route, send-key presets) | `evidence/keybindings/keybindings.json` (PR #23). An independent extractor run over the full `index-BGEQ8YjU.js` chunk agreed on all 165 ids, primary keys, `configurable` flags, categories and additional-key counts. | `matched`: registered with Conductor's default key and named by code outside the registry and tests. `declared`: registered with the right key, no handler names it. `partial`: registered with a different key. |
| Persistence | 18 `conductor.db` and 7 `cache.db` tables, 19 app-data stores (checkpoint refs, window state, local-storage subsystems, outboxes) | REA `inspect-sqlite-database` Evidence in `evidence/sqlite/` | Applies the rebuild's `migrations/*.sql` to an empty DB (directories with `cache` in the path build `cache.db`), then compares REA's schema record of that DB column by column: name, declared type, not-null, primary key. |
| Packaging | 20 Info.plist keys, URL scheme, 3 entitlements, hardened runtime, Developer ID signing, 22 linked system libraries, Tauri major version, 13 Tauri plugins, 15 bundled resources, embedded frontend | `evidence/packaging/conductor-reference.json` (REA inspect-plist and inspect-signature, strings reduced to type and length) and `conductor-dylibs.json` (REA trace-dylib-resolution) | REA inspect-plist, inspect-signature and trace-dylib-resolution on the CI-built `OpenConductor.app` (`rea/`, build named in `rea/openconductor-app-build.json`); plugins, resources and frontend from the tree. Without a built-app record it falls back to the bundle config. |

## Limits

- Everything is static. A `matched` shortcut has a handler that names its id; that does not prove the key press runs the command. A `matched` table has the right columns; that does not prove the app reads and writes it.
- The built-app REA records come from one CI run. When the target commit is newer, the report says so; rerun the REA step on a newer artifact to refresh them.
- The published settings schemas were fetched from the public site, so they could be newer than 0.87.6. Their 44 leaf names were checked against the 0.87.6 bundle and all occur there; types and enums were not cross-checked.
- The settings-table key list comes from one user's database (key names only, no values). Keys that are written only on some paths may be missing from it.
- Value differences that are design choices (bundle id, executable name, URL scheme name, minimum macOS 12.0 vs 10.13) are shown in the item detail and do not lower the score.

## REA gaps found in this pass

1. `inspect-sqlite-database` exits `capability_unavailable` on Node.js 22.23.4 ("requires the native DatabaseSync.limits API ... Node.js 24.15 or newer"). REA's setup docs list Node.js 22.23.4+ as supported, so the stated minimum is wrong for this tool. Worked on Node.js 24.22.2.
2. `inspect-plist` on Linux exits `capability_unavailable` ("Native macOS utilities require macOS") even for a plain XML plist file that needs no native tool. Run on the Mac instead.
3. `analyze-javascript-application` Evidence on the decoded frontend (`evidence/frontend/rea-analyze-javascript-application.json.gz`) does not contain the keybinding registry: none of the 165 registry ids occurs in it (only `workspace.contextMenu`, twice). The registry module hits REA's result budget, so a direct extractor was needed (PR #23, and the cross-check above).
4. `trace-dylib-resolution`, `inspect-plist`, `inspect-signature` and `inspect-artifact` chained in one 60 s remote command did not finish; `trace-dylib-resolution` alone took 16 s on OpenConductor.app and 9 s on Conductor.app. Not a REA bug; noted because REA has no batch mode for several static inspections of one bundle.
