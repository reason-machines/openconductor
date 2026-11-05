//! The app databases in the app data folder, with the reference app's file
//! names: `conductor.db`, migrated to the recreated schema by
//! `openconductor-db` on startup, and the disposable client cache
//! `cache.db` beside it. Tauri commands reach them as managed state.

use std::path::Path;

/// File name of the app database inside the app data folder.
pub const FILE_NAME: &str = "conductor.db";

/// File name of the client cache database inside the app data folder (the
/// reference opens `sqlite:cache.db` beside `sqlite:conductor.db`).
pub const CACHE_FILE_NAME: &str = "cache.db";

/// Managed state: the app database's connection pool.
pub struct Db(pub openconductor_db::SqlitePool);

/// Managed state: the client cache's connection pool, `None` when it could
/// not be opened. The cache is disposable, so, like the reference ("Starting
/// desktop without the disposable cache"), the app starts without it rather
/// than failing.
pub struct CacheDb(pub Option<openconductor_db::SqlitePool>);

/// Open (creating and migrating) the app database in `data_dir`.
pub fn open(data_dir: &Path) -> Result<Db, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(data_dir)?;
    let pool = tauri::async_runtime::block_on(openconductor_db::open(data_dir.join(FILE_NAME)))?;
    Ok(Db(pool))
}

/// Open (creating and migrating) the client cache in `data_dir`; on failure
/// log it and carry on without the cache.
pub fn open_cache(data_dir: &Path) -> CacheDb {
    let path = data_dir.join(CACHE_FILE_NAME);
    match tauri::async_runtime::block_on(openconductor_db::open_cache(&path)) {
        Ok(pool) => CacheDb(Some(pool)),
        Err(e) => {
            eprintln!("cache.db: starting without the disposable cache: {e}");
            CacheDb(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_cache_creates_cache_db_beside_conductor_db() {
        let dir = std::env::temp_dir().join(format!("oc-db-cache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        open(&dir).unwrap();
        assert!(open_cache(&dir).0.is_some());
        assert!(dir.join(FILE_NAME).is_file());
        assert!(dir.join(CACHE_FILE_NAME).is_file());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn open_cache_failure_starts_without_cache() {
        let dir = std::env::temp_dir().join(format!("oc-db-nocache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        // A directory where the file should be: SQLite cannot open it.
        std::fs::create_dir_all(dir.join(CACHE_FILE_NAME)).unwrap();
        assert!(open_cache(&dir).0.is_none());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
