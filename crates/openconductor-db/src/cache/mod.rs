//! Typed data access for `cache.db`'s session tables, the reference app's
//! disposable client cache (open it with [`crate::open_cache`]).
//!
//! The reference opens it from the webview as `sqlite:cache.db` beside
//! `sqlite:conductor.db` and starts without it when that fails ("Starting
//! desktop without the disposable cache"). Every statement here is one of
//! the SQL string literals its frontend runs against that connection
//! (`cacheDb`), read from the decoded bundle chunk `index-BGEQ8YjU.js` of
//! Conductor 0.87.6. Each function's doc names the statement it reproduces.
//!
//! - [`session_messages`]: the mirror of `conductor.db` `session_messages`
//!   rows, keyed by the primary row's `rowid` in `source_rowid`.
//! - [`session_state`]: `client_cache_session_state`, how far the mirror has
//!   read the primary database, plus feed offset and read bookkeeping.
//! - [`pending_messages`]: a snapshot of each session's pending-message queue.
//!
//! `cache.db`'s cloud-hosted sidebar sections and favorite models use
//! [`crate::navigation`] and [`crate::favorite_models`] with a
//! [`crate::Scope`] that has a `hosting_server_url`, as the reference runs
//! the same statements on both databases.
//!
//! The reference serializes cache writes per session in memory (a promise
//! chain keyed by session id); callers here are expected to do the same.

pub mod pending_messages;
pub mod session_messages;
pub mod session_state;

/// Now as `new Date().toISOString()` writes it (`2026-11-05T15:00:36.859Z`),
/// the format of every time the reference stores in `cache.db`.
pub fn now_iso() -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64);
    crate::iso_time::from_millis(ms)
}
