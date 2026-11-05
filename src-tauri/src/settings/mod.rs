//! User settings (`settings.toml`) and provider secrets (keychain).
//!
//! The settings file lives at `$OPENCONDUCTOR_HOME/settings.toml`, default
//! `~/.openconductor/settings.toml`. A missing file means defaults; it is
//! written on the first save. Saves are atomic (temp file + rename) and
//! validated, so a bad value from the UI never reaches disk.

pub mod commands;
pub mod db_backed;
pub mod effective;
pub mod launch;
pub mod layers;
mod model;
pub mod service;
mod validate;

#[cfg(test)]
mod db_backed_tests;
#[cfg(test)]
mod launch_tests;
#[cfg(test)]
mod tests;

use std::fmt;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub use model::*;
pub use validate::validate;

pub const FILE_NAME: &str = "settings.toml";

#[derive(Debug)]
pub enum SettingsError {
    Io(PathBuf, std::io::Error),
    Parse(PathBuf, String),
    Invalid(String),
    NoHome,
}

impl fmt::Display for SettingsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SettingsError::Io(p, e) => write!(f, "{}: {e}", p.display()),
            SettingsError::Parse(p, e) => write!(f, "failed to parse {}: {e}", p.display()),
            SettingsError::Invalid(m) => write!(f, "invalid setting: {m}"),
            SettingsError::NoHome => write!(f, "cannot locate the home directory"),
        }
    }
}

impl std::error::Error for SettingsError {}

/// Directory holding `settings.toml`.
pub fn config_dir() -> Result<PathBuf, SettingsError> {
    if let Some(dir) = std::env::var_os("OPENCONDUCTOR_HOME").filter(|v| !v.is_empty()) {
        return Ok(PathBuf::from(dir));
    }
    std::env::var_os("HOME")
        .filter(|v| !v.is_empty())
        .map(|h| PathBuf::from(h).join(".openconductor"))
        .ok_or(SettingsError::NoHome)
}

/// Reads and validates settings at `path`; a missing file yields defaults.
pub fn load(path: &Path) -> Result<Settings, SettingsError> {
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Settings::default()),
        Err(e) => return Err(SettingsError::Io(path.to_path_buf(), e)),
    };
    let settings: Settings = toml::from_str(&text)
        .map_err(|e| SettingsError::Parse(path.to_path_buf(), e.to_string()))?;
    validate(&settings)?;
    Ok(settings)
}

/// Validates and atomically writes `settings` to `path`.
pub fn save(path: &Path, settings: &Settings) -> Result<(), SettingsError> {
    validate(settings)?;
    let text =
        toml::to_string_pretty(settings).map_err(|e| SettingsError::Invalid(e.to_string()))?;
    write_text(path, &text)
}

/// Atomically writes an already validated settings `table` to `path`.
pub fn save_table(path: &Path, table: &toml::Table) -> Result<(), SettingsError> {
    let text = toml::to_string_pretty(table).map_err(|e| SettingsError::Invalid(e.to_string()))?;
    write_text(path, &text)
}

fn write_text(path: &Path, text: &str) -> Result<(), SettingsError> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir).map_err(|e| SettingsError::Io(dir.to_path_buf(), e))?;
    let tmp = dir.join(format!(".{FILE_NAME}.{}.tmp", std::process::id()));
    let write = || -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
        fs::rename(&tmp, path)
    };
    write().map_err(|e| {
        let _ = fs::remove_file(&tmp);
        SettingsError::Io(path.to_path_buf(), e)
    })
}
