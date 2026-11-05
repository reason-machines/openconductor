# openconductor-db

SQLite persistence for OpenConductor: the `conductor.db` schema as sqlx
migrations, plus typed data access for every table (`repos`, `workspaces`,
`diff_comments`, `terminal_sessions`, `app_settings` for `settings`,
`env_vars`, `port_forwards`, `navigation` for sections and memberships,
`favorite_models`, `outbox` for the message and asset outboxes and their pause
state, `maintenance` for `symlinks_pending_deletion` and
`migration_rollbacks`), and the `cache.db` schema as its own sqlx migrations
(`migrations-cache/`, opened with `open_cache`).

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

| Query shapes for `env_vars`, `port_forwards`, `navigation_*`, `favorite_models`, `session_*_outbox*`, `symlinks_pending_deletion`, `settings.deprecated_at` | `evidence/persistence/sql-literals-remaining-tables.txt`: every SQL literal over those tables in the decoded bundle (`index-BGEQ8YjU.js`, `renderApp-D_fmY7hW.js`, sha256 recorded), with byte offsets; each module's doc comment cites its offsets |
| Outbox states, retry rule (20 attempts, 2 s doubling to 60 s), unreadable-row and unknown-value handling | Same bundle, around offsets 2309300 and 2369156 (constants `Qle = 20`, `{initialDelayMs: 2e3, maxDelayMs: 6e4}`) |
| `migration_rollbacks` writes | Migration text in `MacOS/conductor` (`strings`): `INSERT OR REPLACE INTO migration_rollbacks (version, down_sql)`, each `down_sql` deleting its own row; no reader in the binary or bundle |

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
- Times the reference computes in JavaScript (`toISOString()`) are taken as
  milliseconds and formatted by `iso_time`; membership ids are random v4
  UUIDs from SQLite `randomblob` (the reference uses `crypto.randomUUID()`).
- `navigation::write_layout` and `favorite_models::replace` run one statement
  per row inside `BEGIN IMMEDIATE` … `COMMIT`; the reference sends one
  multi-row `VALUES` statement per table in that transaction.
  `navigation::delete_layout` wraps its two deletes in a transaction; the
  reference runs them back to back.
- Outbox: the readable check covers JSON validity and object/array types;
  the reference also rejects `asset_ids` entries that are not strings and a
  `delivery_payload` without a usable `message`. There is no "claim due
  messages" query: the reference picks due messages in memory, so
  `idx_session_messages_outbox_due` has no caller here either.
- `port_forwards::ssh_forwards` returns the union of the two reference
  selects of SSH forwards (one selects `pf.*` and the workspace columns,
  the other only workspace columns), with the forward id kept as
  `forward_id` (the reference's `w.local_id AS id` shadows it).
- `migration_rollbacks` has a writer only; our consolidated migrations record
  no rollbacks.

## REA gaps

- `rea search` / `inspect` on `MacOS/conductor` fail with
  `provider_unavailable` (no Ghidra or Java configured on the Mac), so the
  migration text was read from a `strings` dump instead.
- REA `analyze-javascript-application` Evidence has no string literals, and
  `trace-javascript-semantics` literal seeds miss budget-truncated files, so
  the frontend SQL was found by grepping the decoded bundle.
- `inspect-sqlite-database` refuses databases over 256 MiB (see
  `rea-test-report.md`).
- `rea search <bundle>.js 'FROM port_forwards'` fails with
  `capability_unavailable` / `target_unsupported` (string search only runs
  through Ghidra, Hopper, IDA or Kuna; none supports a JavaScript file and
  Ghidra has no Java on the Mac), and `rea search MacOS/conductor
  'migration_rollbacks'` with `provider_unavailable`. The remaining tables'
  SQL was found with a literal scanner over the decoded bundle and `strings`
  over the binary (`evidence/persistence/sql-literals-remaining-tables.txt`).
