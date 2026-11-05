//! The `settings` table: app-wide key/value pairs, such as the flags the
//! reference app sets once a one-time migration has run
//! (`repo_local_settings_file_migration_complete` and its siblings) and the
//! app preferences it keeps outside `settings.toml` ([`keys`]). Values
//! are text; the reference stores booleans as `"true"` / `"false"`.
//!
//! Statements are the reference's (frontend bundle `index-BGEQ8YjU.js`,
//! offsets 325871-333220 and 362579-365919;
//! `evidence/persistence/sql-literals-remaining-tables.txt`). Every write is
//! `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, so a write
//! resets `created_at`/`updated_at` and clears `deprecated_at`. A setting that
//! moved to the file-backed settings is marked with `deprecated_at` rather
//! than deleted, and the settings loader reads only
//! `WHERE deprecated_at IS NULL`. The reference deletes a key instead of
//! writing an empty or blank value; callers do that with [`delete`].

use sqlx::sqlite::SqlitePool;

use crate::Result;

/// The value stored under `key`, if any.
pub async fn get(pool: &SqlitePool, key: &str) -> Result<Option<String>> {
    Ok(
        sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
            .bind(key)
            .fetch_optional(pool)
            .await?,
    )
}

/// Store `value` under `key`, replacing the whole row (which un-deprecates
/// the key).
pub async fn set(pool: &SqlitePool, key: &str, value: &str) -> Result<()> {
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}

/// Every setting not marked deprecated, as `(key, value)`, in table order.
pub async fn active(pool: &SqlitePool) -> Result<Vec<(String, String)>> {
    Ok(
        sqlx::query_as("SELECT key, value FROM settings WHERE deprecated_at IS NULL")
            .fetch_all(pool)
            .await?,
    )
}

/// Mark `key` deprecated (now), keeping its row and value. A missing key is
/// not an error.
pub async fn deprecate(pool: &SqlitePool, key: &str) -> Result<()> {
    sqlx::query("UPDATE settings SET deprecated_at = datetime('now') WHERE key = ?")
        .bind(key)
        .execute(pool)
        .await?;
    Ok(())
}

/// Delete `key`; a missing key is fine.
pub async fn delete(pool: &SqlitePool, key: &str) -> Result<()> {
    sqlx::query("DELETE FROM settings WHERE key = ?")
        .bind(key)
        .execute(pool)
        .await?;
    Ok(())
}

/// Store `value` under `key` unless the key already has a row, and return
/// the stored value. Two concurrent callers get the same value.
pub async fn get_or_insert(pool: &SqlitePool, key: &str, value: &str) -> Result<String> {
    sqlx::query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(
        sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
            .bind(key)
            .fetch_one(pool)
            .await?,
    )
}

/// App preference keys the reference keeps in this table: its settings
/// registry declares them without a `fileKey` (frontend bundle
/// `index-BGEQ8YjU.js`; evidence/settings/NOTES.md "App preferences in the
/// settings table").
pub mod keys {
    /// Tool calls expanded by default.
    pub const GARRY_MODE: &str = "garry_mode";
    /// Estimated agent costs for cloud workspaces.
    pub const EXPERIMENTAL_SHOW_AGENT_COST: &str = "experimental_show_agent_cost";
    /// Up to 10 chat and terminal tabs per workspace instead of 5.
    pub const EXPERIMENTAL_TAB_FREAK_MODE: &str = "experimental_tab_freak_mode";
    /// Create workspaces on the full-screen `/create` page instead of the dialog.
    pub const EXPERIMENTAL_NEW_WORKSPACE_PAGE: &str = "experimental_new_workspace_page";
    /// `"true"` turns Graphite stack detection off.
    pub const GRAPHITE_DISABLED: &str = "graphite_disabled";
    /// Last "Open in" app id.
    pub const DEFAULT_OPEN_IN: &str = "default_open_in";
    /// JSON array of `app|local` / `app|remote`, most recent first.
    pub const OPEN_IN_MRU_ORDER: &str = "open_in_mru_order";
    /// Left sidebar shown; unset means shown.
    pub const LEFT_PANEL_VISIBLE: &str = "left_panel_visible";
    /// Right panel shown; unset means shown.
    pub const RIGHT_PANEL_VISIBLE: &str = "right_panel_visible";
    /// Left sidebar width in whole pixels; unset means 256.
    pub const LEFT_PANEL_WIDTH: &str = "left_panel_width";
    /// Onboarding progress; unset means 0.
    pub const ONBOARDING_STEP: &str = "onboarding_step";
    /// First-time onboarding progress; unset means 1.
    pub const FIRST_TIME_ONBOARDING_STEP: &str = "first_time_onboarding_step";
    /// Folder of the last clone.
    pub const LAST_CLONE_DIRECTORY: &str = "last_clone_directory";
    /// Id of the last announcement the user dismissed.
    pub const LAST_SEEN_ANNOUNCEMENT: &str = "last_seen_announcement";
    /// Random UUID generated once per install.
    pub const CLIENT_INSTANCE_ID: &str = "client_instance_id";
    /// User id of the cloud (Roundhouse) client sign-in.
    pub const ROUNDHOUSE_CLIENT_USER_ID: &str = "roundhouse_client_user_id";
    /// Repository id the sidebar is narrowed to ("Filter by project"); no
    /// row means all projects.
    pub const SIDEBAR_REPO_FILTER: &str = "sidebar_repo_filter";
    /// Experimental: CPU and memory readout in the sidebar; unset means off.
    pub const SIDEBAR_RESOURCE_USAGE: &str = "sidebar_resource_usage";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn get_or_insert_keeps_the_first_value() {
        let pool = crate::open_in_memory().await.unwrap();
        let first = get_or_insert(&pool, keys::CLIENT_INSTANCE_ID, "a")
            .await
            .unwrap();
        let second = get_or_insert(&pool, keys::CLIENT_INSTANCE_ID, "b")
            .await
            .unwrap();
        assert_eq!((first.as_str(), second.as_str()), ("a", "a"));
    }
}
