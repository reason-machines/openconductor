//! The app database: `conductor.db` in the app data folder, the same file
//! name the reference app uses, migrated to the recreated schema by
//! `openconductor-db` on startup. Tauri commands reach it as managed state.

use std::path::Path;

/// File name of the app database inside the app data folder.
pub const FILE_NAME: &str = "conductor.db";

/// Managed state: the app database's connection pool.
pub struct Db(pub openconductor_db::SqlitePool);

/// Open (creating and migrating) the app database in `data_dir`.
pub fn open(data_dir: &Path) -> Result<Db, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(data_dir)?;
    let pool = tauri::async_runtime::block_on(openconductor_db::open(data_dir.join(FILE_NAME)))?;
    Ok(Db(pool))
}
