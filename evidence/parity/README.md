# Parity: settings, shortcuts, persistence, packaging

`tools/parity_check.py` scores a git ref of this repository against the Conductor 0.87.6 evidence for four areas and writes [`PARITY.md`](PARITY.md) and [`parity-report.json`](parity-report.json), plus the ledger record [`evidence/ledger/verifier/settings-shortcuts-persistence-packaging.md`](../ledger/verifier/settings-shortcuts-persistence-packaging.md) (pass/fail per REA ledger obligation and the builder obligations every failing item is filed under). The report in this directory is for `origin/main` at the commit named in its first line. The checker exits non-zero when a failing item has no builder obligation in `BUILDER_OBLIGATIONS`.

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

## Changes since `8229113` (to `4b9dc87`, 2026-11-05)

Regenerated with `--rea` (REA 6.8.0, Node.js 24.22.2) on `4b9dc87`. Settings scores below are as generated; the six remaining settings items were read by hand, the newly matched ones were not re-read one by one in this pass.

- **Settings 47.6% to 96.4%** (48.4% on `7e75c2d` after #301, 84.4% on `1cedef0` after #285 and #295). #285 and #295 brought Conductor's `models.*`, provider keys, `prompts.*`, git flags, `preview_urls` and `environment_variables.*` into `settings.toml` with repo layers. #332 stores the app preferences in the `settings` table (panels, code theme, ligatures, Garry Mode, Tab Freak Mode, Graphite, open-in MRU, clone folder, client id), taking `settings.app-preferences` from 8 of 29 to 23 of 29. #376 makes `prompts.general`, the effective `prompts.code_review` and the settings environment real consumers, so the earlier `prompts.general` false match is now a real read. #372 mounts the Account tool-approval rows.
  - Still open in `settings.app-preferences`: `default_model`, `default_codex_thinking_level` and `review_codex_thinking_level` are only declared (no code reads the settings-table rows; the models now come from `settings.toml`), and the three one-time migration flags `file_backed_settings_migration_complete`, `repo_conductor_config_file_migration_v2_complete` and `repo_custom_prompt_file_migration_complete` are missing.
- **Shortcuts 66.6% to 68.9%, persistence 72.7% to 75.0% (#329), packaging 73.1% to 82.1%** (as generated; all four 80.2%).

## Changes since `c15cf35` (to `8229113`, 2026-11-05)

The report in this directory is now for `8229113`. A first pass on `0e2531b` gave settings 42.8%; main moved 25 commits before it shipped, so the report was regenerated on `8229113`. It was run with `--rea`, using REA 6.8.0 and Node.js 24.22.2 for `inspect-sqlite-database`. The settings rows below were re-read by hand. The other three areas are as generated.

- **Settings 23.6% to 47.6%** (42.8% on `0e2531b`).
  - Routes went from 1 of 16 to 16 of 16. `src/settings/routes.ts` (#286 and the settings route PRs) has Conductor's tree and redirects. `/settings`, `/settings/user`, `/settings/user/{general,git,models,providers,account}` and `/settings/repos` open real pages (`SettingsView.tsx`, `AccountPage.tsx`, `RepoSettingsPage.tsx`).
  - The 8 `/settings/cloud/*` and `/settings/organization/*` routes count as matched because they do what Conductor does for a local user: redirect to `/settings/user/general`. The source for that is `evidence/settings/NOTES.md` ("Settings routes", from the REA-extracted bundle). I did not re-run REA for it in this pass.
  - Settings-table keys `zoom_level_v2`, `low_contrast_dark_mode` and `mono_font` are read and written by Settings › Appearance (`AppearancePage.tsx`, `src-tauri/src/settings/model.rs`). `repo_local_settings_file_migration_complete` is read by the Spotlight migration. `branch_prefix_type` moved to matched.
  - `file_include_globs` and `spotlight_testing` are now read by the `settings.toml` loader.
  - New on `8229113`: `git.archive_on_merge`, `git.delete_branch_on_archive` and `git.worktree_push_auto_setup_remote` are fields of the git settings model (`src-tauri/src/settings/model.rs`), used by `archiveOnMerge.ts`, `GitPage.tsx` and `lib.rs`/`workspace/commands.rs`. Settings-table keys `code_theme`, `colored_sidebar_diffs` and `file_ligatures_enabled` are read and written by Appearance and the diff view (`AppearancePage.tsx`, `DiffAppearanceRows.tsx`, #292).
  - **False match:** `prompts.general` (user and repo) is `declared` only because `routes.ts` contains both tokens (`/settings/organization/prompts` and `general`). No code reads the key. Without it, settings is 47.2%.
  - Still missing: all 12 `prompts.*` keys, the 13 `models.*` keys, the provider and executable-path keys, `environment_variables.*`, `preview_urls`, `ssh_key_path` and `tool_approvals_enabled`, plus 18 settings-table keys, among them `left_panel_visible` and `left_panel_width` (see `sidebar.visibility-settings` in [sidebar-home-create](sidebar-home-create/README.md)). Each is filed under a builder obligation in [the verifier record](../ledger/verifier/settings-shortcuts-persistence-packaging.md).
- **Shortcuts 55.5% to 66.6%, persistence 43.2% to 72.7%, packaging 53.8% to 73.1%** (as generated; all four 62.8%). Persistence includes #260 and #281, which count `migrations-cache/` for cache.db.

## Changes since the first report (`d23b4e9` to `c15cf35`)

- Shortcuts 57.0% to 55.5%: #120 removed a second keybinding registry (`src/palette/keybindings/defaults.ts`). It was the only code outside `src/keybindings/` naming 10 bindings (`openSettings`, `nav.back`, `view.toggleZenMode`, ...), so the first report counted them as handled. No handler ever referenced them; those were false matches. Five other bindings gained real handlers (`chat.submitMessage`, `chat.newLine`, ...).
- Settings 21.6% to 23.6%: `/settings/user/providers` exists now, and #134 reads `git.branch_prefix_type` from user and repo `settings.toml`. #109 replaced the top-level provider keys (`bedrock_region`, `vertex_*`, `*_base_url`) with `[providers.<agent>]` tables, so the rebuild no longer reads Conductor's `bedrock_region`; filed under `settings.toml.providers`.
- Packaging 51.3% to 53.8%: REA records refreshed on the CI build of `884f1f7` (run 42021844898; no packaging file changed between it and `c15cf35`); it adds the one-time-code autofill Info.plist key and links `Security`.

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
5. (parity.sidebar.ws-unread, 2026-11-06) `rea trace` on Conductor's frontend bundle still fails `capability_unavailable` (no provider handles a JS file), and `rea search-bytes` with `--target-format raw-binary` fails `provider_unavailable` because it needs Ghidra and Java even for a literal byte search of a text file. There is no `search-strings` command (`COMMAND_NOT_FOUND`), although `trace`'s own error names `search_strings` as its operation. Reading Conductor's JS by byte offset was the only route (`acp_wait_*` rows in `evidence/rea/rea-invocations.tsv`).
