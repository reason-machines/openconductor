# openconductor-db

SQLite persistence for OpenConductor: the `conductor.db` schema as sqlx
migrations, plus typed data access for every table (`repos`, `workspaces`,
`diff_comments`, `terminal_sessions`, `app_settings` for `settings`,
`env_vars`, `port_forwards`, `navigation` for sections and memberships,
`favorite_models`, `outbox` for the message and asset outboxes and their pause
state, `maintenance` for `symlinks_pending_deletion` and
`migration_rollbacks`), and the `cache.db` schema as its own sqlx migrations
(`migrations-cache/`, opened with `open_cache`) with typed data access in
`src/cache/` (see [cache.db](#cachedb)). The app opens both at startup
(`src-tauri/src/db.rs`: `Db` and `CacheDb` managed state).

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

## cache.db

`cache.db` is the reference's disposable client cache. Its frontend opens it
as `sqlite:cache.db` beside `sqlite:conductor.db` (both in
`~/Library/Application Support/com.conductor.app`) and starts without it when
that fails. OpenConductor opens `cache.db` next to `conductor.db` in the app
data folder (`db::open_cache`); a failure logs and leaves `CacheDb(None)`.

Every statement in `src/cache/` is a SQL string literal the reference runs on
that connection. Cloud-hosted sidebar sections and favorite models in
`cache.db` use the same `navigation` and `favorite_models` modules as
`conductor.db`, with a `Scope` whose `hosting_server_url` is set: the
reference runs one set of statements on both databases and only the scope
columns differ. Offsets are character positions in the Conductor 0.87.6
bundle chunks `assets/index-BGEQ8YjU.js` (sha256 `b5b01f33...dbf3`) and
`assets/renderApp-D_fmY7hW.js` (sha256 `5199d392...5dde`), extracted to
`~/code/conductor-rea-work/frontend/dist` on the reference Mac. Minified
function names are given only to locate the code.

| Our function | Reference statement(s) | Evidence |
| --- | --- | --- |
| `crate::open_cache`, `db::open_cache` | `bf.load("sqlite:cache.db")` then `PRAGMA journal_mode = WAL`; startup catches a failure and logs "Starting desktop without the disposable cache" | index 817158 (`tKe`, `rKe`), 3473962 |
| `session_state::CACHE_VERSION` | `const E_=1` | index 1114099 |
| `session_state::invalidate_if_stale` | `SELECT cache_version FROM client_cache_session_state WHERE session_id = ?`; when not 1: `DELETE FROM session_messages WHERE session_id = ?`, `DELETE FROM client_cache_session_state WHERE session_id = ?` | index 1114396 (`fB`) |
| `session_state::touch` | `INSERT INTO client_cache_session_state (session_id, cache_version, cache_revision, first_written_at, last_modified_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(session_id) DO UPDATE SET ... cache_revision = COALESCE(client_cache_session_state.cache_revision, 0) + 1 ...` | index 1114912 (`A_`) |
| `session_state::record_read` | `UPDATE client_cache_session_state SET last_read_at = ? WHERE session_id = ?` | index 1115640 (`xb`) |
| `session_messages::delete_mirrored` | `DELETE FROM session_messages WHERE session_id = ? AND source_rowid IS NOT NULL` | index 1116194 (`eF`) |
| `session_messages::upsert` | `INSERT OR REPLACE INTO session_messages (id, ..., source_rowid) VALUES (18 ?)` then `touch` | index 1116343 (`Y0`); client-written assistant rows with `source_rowid: null` at ~1177961 |
| `session_state::primary_watermark`, `session_messages::count_mirrored`, `session_messages::catch_up`, `session_state::record_primary` | `SELECT primary_max_rowid, primary_message_count FROM client_cache_session_state WHERE session_id = ?`; reconcile against the primary's `COALESCE(MAX(rowid), 0)` / `COUNT(*)` of settled rows; `SELECT COUNT(*) AS cached_count ... source_rowid IS NOT NULL`; the `primary_max_rowid, primary_message_count` upsert | index 1117415 (`bet`) |
| `session_messages::rebuild` | delete state row, `eF`, mirror every settled primary row, upsert watermark from max `source_rowid` and row count | index 1121048 (`Eet`) |
| `session_state::feed_offset` | `SELECT feed_offset FROM client_cache_session_state WHERE session_id = ?` (`?? -1`) | index 1122588 (`Aet`) |
| `session_state::set_feed_offset` | `INSERT INTO client_cache_session_state (session_id, feed_offset, cache_version, first_written_at, last_modified_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT ...` (`s ?? -1`) | index 1123426 (`Iet`) |
| `session_state::transcript_revision` | `SELECT cache_revision AS transcript_revision FROM client_cache_session_state WHERE session_id = ?` | index 1261730 (`Ob`) |
| `session_messages::settled_page`, `settled`, `PAGE_SIZE` | `SELECT id, ..., 1 AS is_client_cache_projection, rowid AS cache_rowid FROM session_messages WHERE session_id = ? AND sent_at IS NOT NULL [AND (sent_at, rowid) > (?, ?)] ORDER BY sent_at, rowid LIMIT ?`, pages of `IP=500` | index 1261951 (`Tst`) |
| `session_state::snapshot` | `SELECT cache_revision, cache_version, first_written_at, last_modified_at, feed_offset FROM client_cache_session_state WHERE session_id = ?` | index 1339693 (`Wrt`) |
| `pending_messages::CACHE_VERSION` | `const xle=1` | index 2306951 |
| `pending_messages::load` | `SELECT * FROM session_pending_messages_state WHERE session_id = ?`; other version: clear; `SELECT * FROM session_pending_messages WHERE session_id = ? ORDER BY position ASC, message_id ASC` | index 2307763 (`$vt`) |
| `pending_messages::store` | `DELETE FROM session_pending_messages WHERE session_id = ?`; multi-row `INSERT OR REPLACE INTO session_pending_messages (session_id, message_id, delivery_payload, config, mode, position, revision, sender_id, received_at, generation)`; `INSERT OR REPLACE INTO session_pending_messages_state (session_id, generation, paused, snapshot_at, cache_version)` | index 2308251 (`Bvt`) |
| `pending_messages::clear` | the two `DELETE ... WHERE session_id = ?` | index 2309115 (`Wvt`) |
| `Scope` (`hosting_server_url: Option`), used by `favorite_models` | the scope is `{database: cacheDatabase, scopeColumns: ["hosting_server_url", "organization_id", "user_id"]}` for a hosted organization, `{database: main, scopeColumns: ["organization_id", "user_id"]}` otherwise; `WHERE` is the columns joined as `<col> = ?` with ` AND ` | index 3090064 (`Epe`, `Ape`); statements at 3090268 (`Ipe`), 3090760 (`P2`) |
| `Scope`, used by `navigation` | `hostingServerUrl === undefined ? ["organization_id", "user_id"] : ["hosting_server_url", "organization_id", "user_id"]`; the cloud sections store gets `cacheDatabase` and the hosting server's `roundhouseBaseUrl`, the local store the main database; inserts list `(id, ${columns.join(", ")}, name, emoji, ...)` | renderApp 176375 (`MIr`), 178408 (`$Ir`), 180619 (`zIr`), 185205 (`qIr`) |

Not ported here: the transcript compaction upsert (a `WITH ... INSERT INTO
session_messages ... ON CONFLICT(id)` that adds `source_rowid` on the cache;
index ~1445787) runs against whichever database holds the transcript, and
belongs with the sessions/session_messages module, as do the reads of
`conductor.db` that feed `catch_up` and `rebuild`.

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
- `cache.db`: the reference serializes cache work per session (and per
  database for navigation) with in-memory promise chains; this crate has no
  lock, so callers must serialize per session.
- `cache.db`: `pending_messages::store` runs in one transaction; the
  reference runs its three statements as separate executes. On `cache.db`
  the reference also runs the navigation statements one by one (its cache
  handle has no `executeTransaction`, so its `BEGIN IMMEDIATE` path is only
  taken on `conductor.db`); `navigation::write_layout` uses the transaction
  on both.
- Navigation members written in one call share `created_at`, so they read
  back in the order of their random membership ids (`ORDER BY created_at,
  id`), in the reference too; tests compare them as sets.
- `cache.db`: the pending-message insert is split into statements of at
  most 3000 rows (SQLite's bound-parameter limit); the reference uses one.
- `cache.db`: times are bound from Rust in `Date.toISOString()` format
  (`cache::now_iso`), and `catch_up` / `rebuild` take the primary's rows and
  watermark from the caller instead of querying `conductor.db` themselves.
- `cache.db`: no command reads the cache yet; `CacheDb` is managed state
  for the transcript and sidebar code that will.

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
- `cache.db` query shapes: `analyze-javascript-application` on the
  3.5 MB `index-BGEQ8YjU.js` chunk alone (`--source-path`, 8 GiB heap)
  failed with `provider_timeout` at its default 300 s budget (442 s wall)
  and again at `--analysis-timeout-ms 900000` (990 s wall), and the partial Evidence holds none of the SQL literals, so the statements
  were read by slicing the chunk text around the table names
  (`evidence/rea/rea-invocations.tsv`, `cache_db_*` rows). The navigation
  statements live in the 30 MB `renderApp` chunk, where the analyzer is
  already known to exhaust its heap (`analyze_js_app_renderApp_16g`).
