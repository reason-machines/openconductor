//! The user-scope "Auto-run after setup" toggle (Settings › Experimental).
//!
//! The reference registers `auto_run_after_setup` as a user-scope setting
//! (default off) stored at file key `scripts.auto_run_after_setup`, so the
//! toggle writes the user `settings.toml` that [`super::load`] reads as the
//! [`Layer::User`] layer. A repository layer that sets the key still wins, as
//! for every other setting. Evidence: evidence/run-scripts/NOTES.md.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::Path;

use toml::{Table, Value};

use super::{resolve, Layer, LayerSource};

/// Key under `[scripts]`.
pub const AUTO_RUN_KEY: &str = "auto_run_after_setup";

/// The user settings file the toggle writes, under the user settings dir.
pub const USER_TOML: &str = "settings.toml";

/// The user layer's `auto_run_after_setup` (off when no user file sets it).
/// Reads `settings.json` and `settings.toml` like [`super::load_layers`].
pub fn user_auto_run_after_setup(user_dir: &Path) -> Result<bool, String> {
    let mut layers = Vec::new();
    for name in ["settings.json", USER_TOML] {
        let path = user_dir.join(name);
        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(e) if e.kind() == ErrorKind::NotFound => continue,
            Err(e) => return Err(format!("could not read {}: {e}", path.display())),
        };
        let origin = path.display().to_string();
        let layer = if name.ends_with(".json") {
            LayerSource::from_json(Layer::User, &origin, &text)
        } else {
            LayerSource::from_toml(Layer::User, &origin, &text)
        };
        layers.push(layer.map_err(|e| e.to_string())?);
    }
    Ok(resolve(&layers).auto_run_after_setup)
}

/// Set `[scripts] auto_run_after_setup` in the user `settings.toml`, keeping
/// every other key. A file that does not parse is left alone and reported.
/// Comments in the file are not kept.
pub fn set_user_auto_run_after_setup(user_dir: &Path, enabled: bool) -> Result<(), String> {
    let path = user_dir.join(USER_TOML);
    let mut table = match fs::read_to_string(&path) {
        Ok(text) => text
            .parse::<Table>()
            .map_err(|e| format!("could not parse {}: {e}", path.display()))?,
        Err(e) if e.kind() == ErrorKind::NotFound => Table::new(),
        Err(e) => return Err(format!("could not read {}: {e}", path.display())),
    };
    let section = table
        .entry("scripts")
        .or_insert_with(|| Value::Table(Table::new()));
    let Value::Table(section) = section else {
        return Err(format!("{}: `scripts` is not a table", path.display()));
    };
    section.insert(AUTO_RUN_KEY.into(), Value::Boolean(enabled));
    let text = toml::to_string(&table).map_err(|e| e.to_string())?;
    fs::create_dir_all(user_dir).map_err(|e| format!("{}: {e}", user_dir.display()))?;
    let tmp = user_dir.join(format!(".{USER_TOML}.{}.tmp", std::process::id()));
    let write = || -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
        fs::rename(&tmp, &path)
    };
    write().map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("{}: {e}", path.display())
    })
}
