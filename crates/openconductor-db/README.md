# openconductor-db

SQLite persistence for OpenConductor: the `conductor.db` schema as sqlx
migrations, plus typed data access for repositories (`repos`),
workspaces (`workspaces`), chat sessions (`sessions`), their messages
(`session_messages`) and attachments (`attachments`), and the `cache.db` schema as its own sqlx
migrations (`migrations-cache/`, opened with `open_cache`).

```bash
cd crates/openconductor-db
cargo test                                         # parity + data access tests
cargo run --example migrate -- /tmp/conductor.db   # write a migrated DB file
```

## Evidence

| What | Source |
| --- | --- |
| Tables, columns, defaults, indexes, triggers | `evidence/sqlite/conductor.schema.sql` (DDL from an APFS clone of the live DB); `tests/schema_parity.rs` compares a migrated DB to it |
| `cache.db` tables, columns, indexes and its 6 migrations (version, description) | `evidence/sqlite/cache.schema.sql` and `rea-inspect-sqlite-cache-migrations.json`; `tests/schema_parity.rs` checks both against `CACHE_MIGRATOR` |
| sqlx 0.8.6 and `_sqlx_migrations` | `evidence/sqlite/README.md` (`sqlx-sqlite-0.8.6` panic paths in the binary; REA `inspect-sqlite-database` of `_sqlx_migrations`) |
| Workspace states `initializing`, `setting_up`, `ready`, `archiving`, `archived`, plus `failed`, `unstarted`, `deleted` | Migration text embedded in `MacOS/conductor` (`strings`), and SQL in the decoded frontend bundle, both read on the reference Mac |
| Query shapes (repo list order, delete only when unused, reuse hidden repo by path, conditional state transitions, no workspaces `updated_at` trigger, monotonic `touch`) | SQL string literals in the decoded frontend bundle (the reference app runs its SQL from the webview through `tauri-plugin-sql`) |
| `sessions`, `session_messages`, `attachments` query shapes, value sets and JS-side ordering, one row per Rust function | `evidence/sqlite/sessions-messages-attachments-queries.md` (SQL literals from `assets/index-BGEQ8YjU.js` of Conductor 0.87.6) |

Strings from the reference app are treated as data. Statements here are
our own; only the schema is reproduced exactly.

## REA schema diff

REA 6.7.0 `inspect-sqlite-database --schema-scope database --format json` was
run on Sven's Mac against a database built from these migrations
(`evidence/sqlite/rea-inspect-sqlite-openconductor-schema.json`, DB sha256
`9a2f9850...0a55`) and compared with the Evidence for the reference DB:

```bash
python3 tools/sqlite_schema_diff.py \
  evidence/sqlite/rea-inspect-sqlite-conductor-schema.json \
  evidence/sqlite/rea-inspect-sqlite-openconductor-schema.json
# objects: reference 118, rebuild 118 / missing 0 / extra 0 / differ 0
```

That DB was made with `sqlite3` from the migration files (the migrator runs
the same SQL). The `cargo` parity test checks the real migrator on every CI run.

## Our choices (not verified against the reference)

- One migration per area instead of the reference's 142 incremental ones.
  Version numbers are ours, so this migrator cannot open a reference DB.
- `cache.db` keeps the reference's six migration versions and descriptions.
  Migration 2 ("drop obsolete session tool cache") is a no-op: the dropped
  table's name is not in the evidence and never existed here.
- `DEPRECATED_*` columns exist only for schema parity; nothing uses them.
- New repos get `display_order = max + 1`; the reference reads
  `MAX(display_order)` before inserting, but the increment is assumed.
- `fail` covers `initializing` and `setting_up` in one statement; the
  reference uses one statement per state.
- `unarchive` sets `setting_up` and bumps `updated_at` only from `archived`;
  the reference's matching statement has no state guard.
- Data access lives in Rust; the reference queries from the frontend.
- `sessions::list_for_workspace` sorts in SQL with `julianday()` what the
  reference sorts in JS on parsed dates; id ties use byte order where the
  reference uses `localeCompare`.
- `sessions::set_agent_and_model` takes the reference statement with its
  optional `${u}` suffix empty; what the suffix adds was not read.
- Session rows with an unknown or NULL `status` fail to decode, as the
  reference decoder throws; `agent_type` outside `claude/codex/cursor/acp`
  likewise.
- No `cancelled_at` writer: no 0.87.6 statement sets it (see the evidence
  file), so a cancel path is left to whoever finds one.
  `is_resumable_message` is stored (1 or NULL) and decoded, never filtered.
- The reference reads and writes `sessions.notes` (`UPDATE sessions SET
  notes = ? WHERE id = ?`), but the reference DB schema has no such column;
  not implemented.
- `session_messages` keyset paging (`(sent_at, rowid) > (?, ?) LIMIT ?`)
  runs only against the `cache.db` mirror in the reference; it is not here.
- Transcript search (`LOWER(content) LIKE`) and session title search are not
  covered yet.

## REA gaps

- `rea search` / `inspect` on `MacOS/conductor` fail with
  `provider_unavailable` (no Ghidra or Java configured on the Mac), so the
  migration text was read from a `strings` dump instead.
- REA `analyze-javascript-application` Evidence has no string literals, and
  `trace-javascript-semantics` literal seeds miss budget-truncated files, so
  the frontend SQL was found by grepping the decoded bundle.
- `rea search <bundle>.js session_messages` fails with
  `capability_unavailable` (`target_unsupported`: only the native providers
  ghidra, hopper, ida, kuna are candidates, none take a JS file), so the
  sessions, messages and attachments SQL was read with `perl` over the
  decoded bundle.
- `inspect-sqlite-database` refuses databases over 256 MiB (see
  `rea-test-report.md`).
