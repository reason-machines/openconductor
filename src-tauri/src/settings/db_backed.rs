//! Appearance preferences Conductor keeps in `conductor.db`'s `settings`
//! table, not in `settings.toml`. Its settings registry (`index-*.js`)
//! declares `zoom_level_v2`, `mono_font`, `code_theme` (`Me()`/`_l(_N)`)
//! and `low_contrast_dark_mode`, `colored_sidebar_diffs`,
//! `file_ligatures_enabled` (`xe()`) without a `fileKey`, and their setters
//! (`m6t`, `Xzt`, `F6t`, `L6t`, `D6t`, `Jzt`) call `updateSetting`, which
//! runs `INSERT OR REPLACE INTO settings (key, value)` for non-file-backed
//! keys (evidence/settings/NOTES.md "Appearance keys in the settings table").
//!
//! The UI keeps reading and writing them as `Settings.appearance.*`; the
//! settings service overlays the table's values on read, writes them to the
//! table on save, and leaves them out of `settings.toml`.

use std::collections::HashMap;

use toml::{Table, Value};

use super::{Appearance, CodeTheme, ZOOM_MAX, ZOOM_MIN};

pub const ZOOM_LEVEL_V2: &str = "zoom_level_v2";
pub const MONO_FONT: &str = "mono_font";
pub const LOW_CONTRAST_DARK_MODE: &str = "low_contrast_dark_mode";
pub const CODE_THEME: &str = "code_theme";
pub const COLORED_SIDEBAR_DIFFS: &str = "colored_sidebar_diffs";
pub const FILE_LIGATURES_ENABLED: &str = "file_ligatures_enabled";

/// `[appearance]` keys stored in the table instead of the file.
pub const KEYS: [&str; 6] = [
    ZOOM_LEVEL_V2,
    MONO_FONT,
    LOW_CONTRAST_DARK_MODE,
    CODE_THEME,
    COLORED_SIDEBAR_DIFFS,
    FILE_LIGATURES_ENABLED,
];

fn flag(v: Option<&String>) -> Option<bool> {
    match v.map(String::as_str) {
        Some("true") => Some(true),
        Some("false") => Some(false),
        _ => None,
    }
}

/// JavaScript's `Number.prototype.toString` for the zoom steps: `1`, `1.1`.
fn number_text(n: f64) -> String {
    format!("{n}")
}

fn code_theme_text(t: CodeTheme) -> String {
    match serde_json::to_value(t) {
        Ok(serde_json::Value::String(s)) => s,
        _ => "default".to_string(),
    }
}

/// Apply the table's rows to `a`, decoded as Conductor's hooks do (`C5t`
/// `parseFloat(...) ?? 1`, `m5t`, `v5t` unset ligatures = on, ...). A value
/// that is missing or unusable leaves the field as loaded.
pub fn overlay(a: &mut Appearance, rows: &HashMap<String, String>) {
    if let Some(z) = rows
        .get(ZOOM_LEVEL_V2)
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|z| z.is_finite() && (ZOOM_MIN..=ZOOM_MAX).contains(z))
    {
        a.zoom_level_v2 = z;
    }
    if let Some(font) = rows.get(MONO_FONT) {
        let font = font.trim();
        a.mono_font = (!font.is_empty()).then(|| font.to_string());
    }
    if let Some(b) = flag(rows.get(LOW_CONTRAST_DARK_MODE)) {
        a.low_contrast_dark_mode = b;
    }
    if let Some(t) = rows.get(CODE_THEME) {
        a.code_theme =
            serde_json::from_value(serde_json::Value::String(t.clone())).unwrap_or_default();
    }
    if let Some(b) = flag(rows.get(COLORED_SIDEBAR_DIFFS)) {
        a.extra
            .insert(COLORED_SIDEBAR_DIFFS.to_string(), Value::Boolean(b));
    }
    if let Some(b) = flag(rows.get(FILE_LIGATURES_ENABLED)) {
        a.file_ligatures_enabled = b;
    }
}

/// The rows `a` stores: `Some(text)` to write, `None` to delete (no font,
/// no sidebar-diff choice).
pub fn rows(a: &Appearance) -> Vec<(&'static str, Option<String>)> {
    vec![
        (ZOOM_LEVEL_V2, Some(number_text(a.zoom_level_v2))),
        (MONO_FONT, a.mono_font.clone()),
        (
            LOW_CONTRAST_DARK_MODE,
            Some(a.low_contrast_dark_mode.to_string()),
        ),
        (CODE_THEME, Some(code_theme_text(a.code_theme))),
        (
            COLORED_SIDEBAR_DIFFS,
            a.extra
                .get(COLORED_SIDEBAR_DIFFS)
                .and_then(Value::as_bool)
                .map(|b| b.to_string()),
        ),
        (
            FILE_LIGATURES_ENABLED,
            Some(a.file_ligatures_enabled.to_string()),
        ),
    ]
}

/// The writes that bring the table from `current` to `a`; unchanged rows
/// are left alone.
pub fn changes(
    a: &Appearance,
    current: &HashMap<String, String>,
) -> Vec<(&'static str, Option<String>)> {
    rows(a)
        .into_iter()
        .filter(|(k, v)| current.get(*k) != v.as_ref())
        .collect()
}

/// Drop the table-backed keys from a serialized settings file's
/// `[appearance]` (and the section when it ends up empty).
pub fn strip(table: &mut Table) {
    let Some(Value::Table(appearance)) = table.get_mut("appearance") else {
        return;
    };
    for key in KEYS {
        appearance.remove(key);
    }
    if appearance.is_empty() {
        table.remove("appearance");
    }
}

/// Table-backed keys a settings file still sets (written by an older build).
pub fn in_file(table: &Table) -> Vec<&'static str> {
    match table.get("appearance") {
        Some(Value::Table(a)) => KEYS.into_iter().filter(|k| a.contains_key(*k)).collect(),
        _ => Vec::new(),
    }
}
