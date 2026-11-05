//! OpenConductor persistence: the SQLite schema (as sqlx migrations) and
//! typed data access over it.
//!
//! The schema is recreated from the reference app's `conductor.db`
//! (`evidence/sqlite/conductor.schema.sql`); `tests/schema_parity.rs` fails
//! when a migrated database differs from it. Migrations are embedded at
//! compile time from `migrations/` and recorded in `_sqlx_migrations`, the
//! same bookkeeping table the reference uses (it links sqlx-sqlite 0.8.6).
//!
//! The reference keeps a second database, `cache.db`, with its own six sqlx
//! migrations (`evidence/sqlite/cache.schema.sql`): a client-side mirror of
//! `session_messages`, the pending-message queue, and cached navigation
//! sections and favorite models. [`CACHE_MIGRATOR`], [`open_cache`] and
//! [`open_cache_in_memory`] recreate it from `migrations-cache/`.

use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};

/// Connection pool returned by [`open`]; re-exported so callers need no `sqlx` dependency.
pub use sqlx::sqlite::SqlitePool;

pub mod diff_comments;
pub mod repos;
pub mod terminal_sessions;
pub mod workspaces;

/// Every schema migration, embedded from `migrations/`.
pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

/// Every `cache.db` migration, embedded from `migrations-cache/`. Versions
/// and descriptions match the reference `cache.db` `_sqlx_migrations` rows.
pub static CACHE_MIGRATOR: Migrator = sqlx::migrate!("./migrations-cache");

/// Errors from opening, migrating or querying a database.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error("no such row")]
    NotFound,
    #[error(transparent)]
    Migrate(#[from] sqlx::migrate::MigrateError),
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

/// Open (creating if missing) the `conductor.db` file at `path` in WAL mode
/// and bring it up to the latest schema.
pub async fn open(path: impl AsRef<Path>) -> Result<SqlitePool> {
    open_file(path, &MIGRATOR).await
}

/// A migrated, private in-memory `conductor.db` on a single connection (each
/// connection to `:memory:` is its own database). For tests and tools.
pub async fn open_in_memory() -> Result<SqlitePool> {
    open_memory(&MIGRATOR).await
}

/// Open (creating if missing) the `cache.db` file at `path` in WAL mode and
/// bring it up to the latest cache schema.
pub async fn open_cache(path: impl AsRef<Path>) -> Result<SqlitePool> {
    open_file(path, &CACHE_MIGRATOR).await
}

/// A migrated, private in-memory `cache.db` on a single connection.
pub async fn open_cache_in_memory() -> Result<SqlitePool> {
    open_memory(&CACHE_MIGRATOR).await
}

async fn open_file(path: impl AsRef<Path>, migrator: &Migrator) -> Result<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new().connect_with(options).await?;
    migrator.run(&pool).await?;
    Ok(pool)
}

async fn open_memory(migrator: &Migrator) -> Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str("sqlite::memory:")?;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    migrator.run(&pool).await?;
    Ok(pool)
}

type Query<'a> = sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>>;

/// Run a write and return how many rows it changed.
async fn exec<'a>(query: Query<'a>, pool: &SqlitePool) -> Result<u64> {
    Ok(query.execute(pool).await?.rows_affected())
}

/// Run a write that must hit a row; no row is [`Error::NotFound`].
async fn exec_one<'a>(query: Query<'a>, pool: &SqlitePool) -> Result<()> {
    match exec(query, pool).await? {
        0 => Err(Error::NotFound),
        _ => Ok(()),
    }
}
