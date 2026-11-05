//! One-time move of the legacy `repos.spotlight_testing` column into the
//! repository's `<root>/.conductor/settings.local.toml`.
//!
//! Recreated from the reference's repo-local settings file migration
//! (`evidence/spotlight/NOTES.md`): once per install, every repository whose
//! column is `1` gets `spotlight_testing = true` written to its local
//! settings file, unless that file already sets the key (the file wins), and
//! the column is then set to NULL. A repository whose column is `0` or NULL
//! is left untouched. A settings flag records that the migration ran.
//!
//! Differences from the reference, on purpose:
//!
//! * The reference moves `file_include_globs` in the same pass under
//!   `repo_local_settings_file_migration_complete`. Ours still reads that
//!   column when creating workspaces, so only `spotlight_testing` moves, and
//!   the flag has its own name so a later `file_include_globs` move is not
//!   skipped.
//! * A repository that fails (no root path, root missing, unreadable local
//!   file) keeps its column and the flag stays unset, so the next launch
//!   retries it. The reference stops at the first failure.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use oc_scripts::config::SETTINGS_DIR;
use openconductor_db::{app_settings, repos, SqlitePool};
use toml::Table;

use super::setting::{self, KEY, LOCAL_FILE};

/// Settings flag set once every repository has been migrated.
pub const DONE_KEY: &str = "repo_local_settings_spotlight_testing_migration_complete";

/// What one run did.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    /// The flag was already set; nothing was looked at.
    pub already_done: bool,
    /// Repositories whose value was written to their local settings file.
    pub written: Vec<String>,
    /// Repositories whose local settings file already set the key, so only
    /// the column was cleared.
    pub kept_file: Vec<String>,
    /// Repositories left for the next launch, with the reason.
    pub failed: Vec<(String, String)>,
}

/// Whether `<root>/.conductor/settings.local.toml` sets the key.
fn local_file_sets_key(root: &Path) -> Result<bool, String> {
    let path = root.join(SETTINGS_DIR).join(LOCAL_FILE);
    match fs::read_to_string(&path) {
        Ok(text) => text
            .parse::<Table>()
            .map(|t| t.contains_key(KEY))
            .map_err(|e| format!("could not parse {}: {e}", path.display())),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("could not read {}: {e}", path.display())),
    }
}

/// Move one repository's value. `Ok(true)` when the file was written,
/// `Ok(false)` when the file already set the key.
async fn migrate_repo(
    pool: &SqlitePool,
    id: &str,
    root_path: Option<&str>,
) -> Result<bool, String> {
    let root = root_path
        .filter(|p| !p.is_empty())
        .map(Path::new)
        .ok_or("no root path")?;
    if !root.is_dir() {
        return Err(format!("root {} does not exist", root.display()));
    }
    let wrote = if local_file_sets_key(root)? {
        false
    } else {
        setting::write_local(root, true)?;
        true
    };
    repos::clear_spotlight_testing(pool, id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(wrote)
}

/// Run the migration unless it already ran.
pub async fn run(pool: &SqlitePool) -> Result<Report, String> {
    let done = app_settings::get(pool, DONE_KEY)
        .await
        .map_err(|e| e.to_string())?;
    if done.as_deref() == Some("true") {
        return Ok(Report {
            already_done: true,
            ..Report::default()
        });
    }
    let mut report = Report::default();
    for repo in repos::list(pool).await.map_err(|e| e.to_string())? {
        let legacy = repos::settings(pool, &repo.id)
            .await
            .map_err(|e| e.to_string())?
            .spotlight_testing;
        if legacy != Some(true) {
            continue;
        }
        match migrate_repo(pool, &repo.id, repo.root_path.as_deref()).await {
            Ok(true) => report.written.push(repo.id),
            Ok(false) => report.kept_file.push(repo.id),
            Err(e) => report.failed.push((repo.id, e)),
        }
    }
    if report.failed.is_empty() {
        app_settings::set(pool, DONE_KEY, "true")
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(report)
}
