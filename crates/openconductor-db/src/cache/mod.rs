//! Typed data access for `cache.db`, the reference app's disposable client
//! cache (open it with [`crate::open_cache`]).
//!
//! The reference opens it from the webview as `sqlite:cache.db` beside
//! `sqlite:conductor.db` and starts without it when that fails ("Starting
//! desktop without the disposable cache"). Every statement here is one of
//! the SQL string literals its frontend runs against that connection
//! (`cacheDb` / `cacheDatabase`), read from the decoded bundle chunks
//! `index-BGEQ8YjU.js` and `renderApp-D_fmY7hW.js` of Conductor 0.87.6. Each
//! function's doc names the statement it reproduces.
//!
//! - [`session_messages`]: the mirror of `conductor.db` `session_messages`
//!   rows, keyed by the primary row's `rowid` in `source_rowid`.
//! - [`session_state`]: `client_cache_session_state`, how far the mirror has
//!   read the primary database, plus feed offset and read bookkeeping.
//! - [`pending_messages`]: a snapshot of each session's pending-message queue.
//! - [`navigation`] and [`favorite_models`]: cloud-hosted sidebar sections and
//!   favorite models, scoped by [`Scope`].
//!
//! The reference serializes cache writes per session in memory (a promise
//! chain keyed by session id); callers here are expected to do the same.

pub mod favorite_models;
pub mod navigation;
pub mod pending_messages;
pub mod session_messages;
pub mod session_state;

/// Whose cloud-hosted data a cached row belongs to. The reference keeps local
/// (non-hosted) sections and favorites in `conductor.db` scoped by
/// `organization_id, user_id`, and cloud ones in `cache.db` scoped by
/// `hosting_server_url, organization_id, user_id` (the hosting server is its
/// `roundhouseBaseUrl`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Scope {
    pub hosting_server_url: String,
    pub organization_id: String,
    pub user_id: String,
}

impl Scope {
    /// The `WHERE` guard the reference builds from the scope columns.
    const WHERE: &'static str = "hosting_server_url = ? AND organization_id = ? AND user_id = ?";
}

/// Now as `new Date().toISOString()` writes it (`2026-11-05T15:00:36.859Z`),
/// the format of every time the reference stores in `cache.db`.
pub fn now_iso() -> String {
    iso_from_millis(chrono::Utc::now().timestamp_millis())
}

/// Milliseconds since the epoch as `new Date(ms).toISOString()`.
pub fn iso_from_millis(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms)
        .unwrap_or_default()
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// `Date.parse(text)` for the ISO times stored here; `None` where it is NaN.
pub fn parse_millis(text: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|t| t.timestamp_millis())
}
