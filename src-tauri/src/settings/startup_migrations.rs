//! One-time startup migrations for settings-table keys that Conductor carried
//! through its own upgrade path.
//!
//! **Migration-complete flags** (`file_backed_settings_migration_complete`,
//! `repo_conductor_config_file_migration_v2_complete`,
//! `repo_custom_prompt_file_migration_complete`): Conductor sets each once
//! after the corresponding data-format migration runs. OpenConductor never had
//! the legacy formats, so each migration is a no-op body; the flag is still
//! written so the settings table is in Conductor's post-migration state.
//!
//! **Deprecated model keys** (`default_model`, `default_codex_thinking_level`,
//! `review_codex_thinking_level`): Conductor once stored these in the
//! `settings` table; they moved to `settings.toml [models]`. Any row that
//! survived (e.g. from a future import path) is deprecated here so the
//! settings loader skips it and `settings.toml` wins.

use openconductor_db::{app_settings, app_settings::keys, SqlitePool};

/// String keys for the deprecated model-preference rows. These keys moved to
/// `settings.toml [models]` and are no longer written as settings-table rows;
/// any surviving row is deprecated on startup.
const DEPRECATED_MODEL_KEYS: &[&str] = &[
    "default_model",
    "default_codex_thinking_level",
    "review_codex_thinking_level",
];

/// Run all one-time startup migrations. Safe to call every launch; each is
/// guarded by its completion flag and exits immediately once set.
pub async fn run(pool: &SqlitePool) {
    // Mark file-format migration flags complete. OpenConductor starts with
    // settings already in the right format, so each body is a no-op; writing
    // the flag puts the table in Conductor's post-migration state.
    for key in [
        keys::FILE_BACKED_SETTINGS_MIGRATION_COMPLETE,
        keys::REPO_CONDUCTOR_CONFIG_FILE_MIGRATION_V2_COMPLETE,
        keys::REPO_CUSTOM_PROMPT_FILE_MIGRATION_COMPLETE,
    ] {
        match app_settings::get(pool, key).await {
            Ok(None) => {
                if let Err(e) = app_settings::set(pool, key, "true").await {
                    eprintln!("startup_migrations: could not set {key}: {e}");
                }
            }
            Ok(Some(_)) => {} // already set; nothing to do
            Err(e) => eprintln!("startup_migrations: could not read {key}: {e}"),
        }
    }

    // Deprecate model-preference keys that moved to settings.toml. Any row
    // that still exists is marked deprecated so the settings loader ignores it.
    for key in DEPRECATED_MODEL_KEYS {
        match app_settings::get(pool, key).await {
            Ok(Some(_)) => {
                if let Err(e) = app_settings::deprecate(pool, key).await {
                    eprintln!("startup_migrations: could not deprecate {key}: {e}");
                }
            }
            Ok(None) => {} // no row; nothing to do
            Err(e) => eprintln!("startup_migrations: could not read {key}: {e}"),
        }
    }
}
