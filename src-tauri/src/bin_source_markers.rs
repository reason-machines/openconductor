//! `.bin-source-markers.json`: what each bundled `bin/` file looked like in
//! the app bundle when it was last installed into `$APPDATA/bin`.
//!
//! Conductor 0.87.6 writes this file in its app data folder from
//! `src-tauri/src/binary_manager.rs` ("Failed to write bin source markers",
//! "Failed to serialize bin source markers"; strings in `MacOS/conductor`).
//! After a first run (`evidence/runtime/first-run-files.tsv`, REA
//! `capture-process`) it is one object keyed by the file's path under `bin/`
//! (`gh`, `.internal/logger`, ...) with the *source* file's
//! `{created_ms, modified_ms, size}`; one key per bundled file. See
//! `evidence/persistence/bin-source-markers/NOTES.md`.
//!
//! A bundled file is copied again when its source no longer matches its
//! marker or the installed copy is gone, so an update that keeps a file's
//! size is still installed.

use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// File name in the app data folder.
pub const FILE_NAME: &str = ".bin-source-markers.json";

/// A bundled source file's identity at install time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Marker {
    /// Creation time in ms; the modification time where the file system has none.
    pub created_ms: u64,
    pub modified_ms: u64,
    pub size: u64,
}

/// Markers by path under `bin/`, `/`-separated.
pub type Markers = BTreeMap<String, Marker>;

fn ms(t: io::Result<SystemTime>) -> Option<u64> {
    t.ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

/// The marker of a source file.
pub fn marker_of(path: &Path) -> io::Result<Marker> {
    let meta = fs::metadata(path)?;
    let modified_ms = ms(meta.modified()).unwrap_or(0);
    Ok(Marker {
        created_ms: ms(meta.created()).unwrap_or(modified_ms),
        modified_ms,
        size: meta.len(),
    })
}

/// The saved markers; a missing or unreadable file is empty (every file is
/// then installed again, which rewrites it).
pub fn load(app_data_dir: &Path) -> Markers {
    fs::read_to_string(app_data_dir.join(FILE_NAME))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Writes the markers atomically.
pub fn save(app_data_dir: &Path, markers: &Markers) -> io::Result<()> {
    let text = serde_json::to_string(markers)
        .map_err(|e| io::Error::other(format!("Failed to serialize bin source markers: {e}")))?;
    fs::create_dir_all(app_data_dir)?;
    let path = app_data_dir.join(FILE_NAME);
    let tmp = app_data_dir.join(format!("{FILE_NAME}.partial"));
    let mut f = fs::File::create(&tmp)?;
    f.write_all(text.as_bytes())?;
    f.sync_all()?;
    fs::rename(&tmp, &path)
}

/// Whether a bundled file must be (re)installed.
pub fn needs_install(saved: Option<&Marker>, source: &Marker, installed_exists: bool) -> bool {
    !installed_exists || saved != Some(source)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("oc-bin-markers-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn file_shape_matches_the_reference() {
        let dir = temp("shape");
        let mut m = Markers::new();
        m.insert(
            ".internal/logger".into(),
            Marker {
                created_ms: 1790625354000,
                modified_ms: 1790625354000,
                size: 102,
            },
        );
        save(&dir, &m).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(dir.join(FILE_NAME)).unwrap()).unwrap();
        assert_eq!(
            v,
            serde_json::json!({".internal/logger": {"created_ms": 1790625354000u64, "modified_ms": 1790625354000u64, "size": 102}})
        );
        assert_eq!(load(&dir), m);
        assert!(!dir.join(format!("{FILE_NAME}.partial")).exists());
    }

    #[test]
    fn missing_or_unreadable_file_is_empty() {
        let dir = temp("empty");
        assert!(load(&dir).is_empty());
        fs::write(dir.join(FILE_NAME), "{oops").unwrap();
        assert!(load(&dir).is_empty());
    }

    #[test]
    fn marker_reads_size_and_times() {
        let dir = temp("marker");
        fs::write(dir.join("f"), "12345").unwrap();
        let m = marker_of(&dir.join("f")).unwrap();
        assert_eq!(m.size, 5);
        assert!(m.modified_ms > 0 && m.created_ms > 0);
        assert!(marker_of(&dir.join("missing")).is_err());
    }

    #[test]
    fn install_decision() {
        let a = Marker {
            created_ms: 1,
            modified_ms: 2,
            size: 3,
        };
        let b = Marker {
            modified_ms: 9,
            ..a
        };
        assert!(!needs_install(Some(&a), &a, true));
        assert!(needs_install(Some(&a), &b, true), "same size, newer source");
        assert!(needs_install(Some(&a), &a, false), "installed copy deleted");
        assert!(needs_install(None, &a, true), "no marker yet");
    }
}
