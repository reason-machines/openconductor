//! Settings rows Conductor keeps in `conductor.db`'s `settings` table, not in
//! `settings.toml`, beyond the appearance keys in [`super::db_backed`].
//!
//! Conductor 0.87.6's settings registry (`index-BGEQ8YjU.js`) declares each
//! of these keys with `Te(key, default)` / `Pe(key)` / `yl(key, enum,
//! default)` and types them `xe()` / `Me()` / `_l(enum)` without a
//! `fileKey`, so its setters write them with `updateSetting`, which is
//! `INSERT OR REPLACE INTO settings (key, value)`; booleans as `"true"` /
//! `"false"` (evidence/settings/NOTES.md, "Settings pages, row for row").
//!
//! The UI reads and writes each one where the frontend expects it (a field
//! of a `Settings` section's `extra`, or a top-level key); the settings
//! service overlays the table's rows on read, writes changed values to the
//! table on save, and leaves the keys out of `settings.toml`. A key the UI
//! has never set has no row and no field, so the frontend applies
//! Conductor's default (`src/settings/prefs.ts`).

use std::collections::HashMap;

use toml::{Table, Value};

use super::Settings;

/// How a row's text decodes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// `"true"` / `"false"`; any other text is ignored.
    Bool,
    /// One of these strings; any other text is ignored.
    Enum(&'static [&'static str]),
}

/// Where a key lives in [`Settings`]: a section's `extra`, or the top level.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Section {
    Top,
    General,
    Git,
    Advanced,
    Experimental,
    Appearance,
}

impl Section {
    fn name(self) -> Option<&'static str> {
        match self {
            Section::Top => None,
            Section::General => Some("general"),
            Section::Git => Some("git"),
            Section::Advanced => Some("advanced"),
            Section::Experimental => Some("experimental"),
            Section::Appearance => Some("appearance"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pref {
    pub section: Section,
    pub key: &'static str,
    pub kind: Kind,
}

const fn b(section: Section, key: &'static str) -> Pref {
    Pref {
        section,
        key,
        kind: Kind::Bool,
    }
}

/// Conductor's `default_message_send_mode` values (`Iri`, default `steering`).
pub const FOLLOW_UP_MODES: &[&str] = &["queued", "steering"];
/// Conductor's `FE` (`pull_request_open_target`, default `github`).
pub const PR_OPEN_TARGETS: &[&str] = &["github", "linear", "graphite"];
/// Conductor's `gN` (`markdown_style`, default `default`).
pub const MARKDOWN_STYLES: &[&str] = &["default", "tufte"];

/// Every table-backed key, in Conductor's tab order.
pub const PREFS: &[Pref] = &[
    // General
    Pref {
        section: Section::General,
        key: "default_message_send_mode",
        kind: Kind::Enum(FOLLOW_UP_MODES),
    },
    b(Section::General, "mention_notifications_enabled"),
    b(Section::General, "auto_convert_long_text"),
    b(Section::General, "not_absolutely_right"),
    b(Section::General, "always_show_context_wheel"),
    b(Section::General, "caffeinate_while_agents_running"),
    b(Section::General, "auto_restart_on_update_when_idle"),
    b(Section::General, "mcp_status_indicator_enabled"),
    // Appearance
    Pref {
        section: Section::Appearance,
        key: "markdown_style",
        kind: Kind::Enum(MARKDOWN_STYLES),
    },
    // Git
    Pref {
        section: Section::Git,
        key: "pull_request_open_target",
        kind: Kind::Enum(PR_OPEN_TARGETS),
    },
    b(Section::Git, "auto_rename_workspace_on_branch_name_set"),
    b(Section::Git, "github_stacked_prs_enabled"),
    // Read by the PR panel as top-level settings keys (src/features/pr/prSettings.ts).
    b(Section::Top, "automerge_enabled"),
    b(Section::Top, "treat_optional_checks_as_blocking"),
    // Advanced
    b(Section::Advanced, "internal_remote_local_execution_mcp"),
    b(Section::Advanced, "always_allow_local_execution"),
    b(Section::Advanced, "auto_sync_files_in_new_cloud_workspaces"),
    // Experimental
    b(Section::Experimental, "experimental_auto_permission_mode"),
    b(
        Section::Experimental,
        "experimental_configurable_center_panel",
    ),
    b(Section::Experimental, "experimental_fork_to_new_tab"),
    b(Section::Experimental, "experimental_in_app_browser_preview"),
    b(
        Section::Experimental,
        "experimental_legacy_file_preview_and_editing",
    ),
    b(Section::Experimental, "experimental_show_workspace_numbers"),
    b(Section::Experimental, "internal_workspace_status_matrix"),
    b(Section::Experimental, "experimental_cloud_ui"),
    b(Section::Experimental, "experimental_cloud_desktop"),
    b(Section::Experimental, "local_git_forge_enabled"),
    b(Section::Experimental, "voice_mode"),
    b(Section::Experimental, "experimental_sidebar_transparency"),
];

fn extra(s: &Settings, section: Section) -> &Table {
    match section {
        Section::Top => &s.extra,
        Section::General => &s.general.extra,
        Section::Git => &s.git.extra,
        Section::Advanced => &s.advanced.extra,
        Section::Experimental => &s.experimental.extra,
        Section::Appearance => &s.appearance.extra,
    }
}

fn extra_mut(s: &mut Settings, section: Section) -> &mut Table {
    match section {
        Section::Top => &mut s.extra,
        Section::General => &mut s.general.extra,
        Section::Git => &mut s.git.extra,
        Section::Advanced => &mut s.advanced.extra,
        Section::Experimental => &mut s.experimental.extra,
        Section::Appearance => &mut s.appearance.extra,
    }
}

/// The value a row's text stands for, or `None` when Conductor's hooks would
/// not read it as a value of this kind.
fn decode(kind: Kind, text: &str) -> Option<Value> {
    match kind {
        Kind::Bool => match text {
            "true" => Some(Value::Boolean(true)),
            "false" => Some(Value::Boolean(false)),
            _ => None,
        },
        Kind::Enum(values) => values
            .contains(&text)
            .then(|| Value::String(text.to_string())),
    }
}

/// The row text for a value from the UI or a file, or an error naming the
/// key for a value of the wrong type.
fn encode(pref: &Pref, v: &Value) -> Result<String, String> {
    match (pref.kind, v) {
        (Kind::Bool, Value::Boolean(b)) => Ok(b.to_string()),
        (Kind::Enum(values), Value::String(s)) if values.contains(&s.as_str()) => Ok(s.clone()),
        (Kind::Bool, _) => Err(format!("{} must be true or false", pref.key)),
        (Kind::Enum(values), _) => {
            Err(format!("{} must be one of {}", pref.key, values.join(", ")))
        }
    }
}

/// Put the table's values into `s`; rows that do not decode are skipped.
pub fn overlay(s: &mut Settings, rows: &HashMap<String, String>) {
    for pref in PREFS {
        if let Some(v) = rows.get(pref.key).and_then(|t| decode(pref.kind, t)) {
            extra_mut(s, pref.section).insert(pref.key.to_string(), v);
        }
    }
}

/// Every table-backed value `s` carries, encoded. A key `s` does not carry
/// is left out: its row, if any, stays as it is.
pub fn values(s: &Settings) -> Result<Vec<(&'static str, String)>, String> {
    PREFS
        .iter()
        .filter_map(|p| {
            extra(s, p.section)
                .get(p.key)
                .map(|v| encode(p, v).map(|t| (p.key, t)))
        })
        .collect()
}

/// The writes that bring the table to `s`; unchanged rows are left alone.
pub fn changes(
    s: &Settings,
    current: &HashMap<String, String>,
) -> Result<Vec<(&'static str, String)>, String> {
    Ok(values(s)?
        .into_iter()
        .filter(|(k, v)| current.get(*k) != Some(v))
        .collect())
}

fn file_section(table: &Table, section: Section) -> Option<&Table> {
    match section.name() {
        None => Some(table),
        Some(name) => table.get(name).and_then(Value::as_table),
    }
}

/// Drop the table-backed keys from a serialized settings file (and a section
/// left empty by that).
pub fn strip(table: &mut Table) {
    for pref in PREFS {
        match pref.section.name() {
            None => {
                table.remove(pref.key);
            }
            Some(name) => {
                if let Some(Value::Table(t)) = table.get_mut(name) {
                    t.remove(pref.key);
                    if t.is_empty() {
                        table.remove(name);
                    }
                }
            }
        }
    }
}

/// Table-backed values a settings file still holds (written by an older
/// build, or by hand), encoded; values of the wrong type are left out.
pub fn in_file(table: &Table) -> Vec<(&'static str, String)> {
    PREFS
        .iter()
        .filter_map(|p| {
            let v = file_section(table, p.section)?.get(p.key)?;
            encode(p, v).ok().map(|t| (p.key, t))
        })
        .collect()
}

/// Whether the file mentions any table-backed key at all.
pub fn file_has_any(table: &Table) -> bool {
    PREFS
        .iter()
        .any(|p| file_section(table, p.section).is_some_and(|t| t.contains_key(p.key)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rows(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    mod big_terminal_mode {
        use super::*;
        use std::fs;
        use std::path::PathBuf;
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        use openconductor_db::{app_settings, SqlitePool};

        use crate::agent::MemorySecretStore;
        use crate::settings::service::SettingsService;

        const KEY: &str = "experimental_big_terminal_mode";

        struct Fixture {
            dir: PathBuf,
            pool: SqlitePool,
            service: SettingsService,
        }

        impl Fixture {
            fn new() -> Self {
                static NEXT: AtomicU32 = AtomicU32::new(0);
                let dir = std::env::temp_dir().join(format!(
                    "oc-big-terminal-mode-{}-{}",
                    std::process::id(),
                    NEXT.fetch_add(1, Ordering::Relaxed)
                ));
                fs::create_dir(&dir).unwrap();
                let pool =
                    tauri::async_runtime::block_on(openconductor_db::open_in_memory()).unwrap();
                let service = SettingsService::new(
                    dir.join("settings.toml"),
                    Arc::new(MemorySecretStore::new()),
                )
                .with_db(pool.clone());
                Self { dir, pool, service }
            }

            fn table(&self) -> HashMap<String, String> {
                tauri::async_runtime::block_on(app_settings::active(&self.pool))
                    .unwrap()
                    .into_iter()
                    .collect()
            }

            fn legacy(&self, value: bool) {
                fs::write(
                    self.service.path(),
                    format!("[experimental]\n{KEY} = {value}\n[git]\narchive_on_merge = true\n"),
                )
                .unwrap();
            }
        }

        impl Drop for Fixture {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.dir);
            }
        }

        #[test]
        fn true_rows_overlay_the_typed_field() {
            let mut settings = Settings::default();
            overlay(&mut settings, &rows(&[(KEY, "true")]));
            assert!(settings.experimental.experimental_big_terminal_mode);
            assert!(!settings.experimental.extra.contains_key(KEY));
        }

        #[test]
        fn false_rows_overlay_the_typed_field() {
            let mut settings = Settings::default();
            settings.experimental.experimental_big_terminal_mode = true;
            overlay(&mut settings, &rows(&[(KEY, "false")]));
            assert!(!settings.experimental.experimental_big_terminal_mode);
            assert!(!settings.experimental.extra.contains_key(KEY));
        }

        #[test]
        fn changes_encode_typed_values_without_rewriting_equal_rows() {
            let mut settings = Settings::default();
            settings.experimental.experimental_big_terminal_mode = true;
            assert_eq!(
                changes(&settings, &rows(&[])).unwrap(),
                vec![(KEY, "true".into())]
            );
            assert!(changes(&settings, &rows(&[(KEY, "true")]))
                .unwrap()
                .is_empty());
            settings.experimental.experimental_big_terminal_mode = false;
            assert_eq!(
                changes(&settings, &rows(&[(KEY, "true")])).unwrap(),
                vec![(KEY, "false".into())]
            );
            assert!(changes(&settings, &rows(&[(KEY, "false")]))
                .unwrap()
                .is_empty());
        }

        #[test]
        fn file_routes_both_boolean_values_and_preserves_unrelated_keys() {
            for value in [true, false] {
                let mut file: Table = toml::from_str(&format!(
                    "[experimental]\n{KEY} = {value}\nkeep = 7\n[git]\narchive_on_merge = true\n"
                ))
                .unwrap();
                assert!(file_has_any(&file));
                assert_eq!(in_file(&file), vec![(KEY, value.to_string())]);
                strip(&mut file);
                assert!(!file_has_any(&file));
                assert!(!file["experimental"].as_table().unwrap().contains_key(KEY));
                assert_eq!(file["experimental"]["keep"], Value::Integer(7));
                assert_eq!(file["git"]["archive_on_merge"], Value::Boolean(true));
            }
        }

        #[test]
        fn service_round_trips_true_and_false_through_the_table() {
            let fixture = Fixture::new();
            for value in [true, false] {
                let mut settings = fixture.service.get().unwrap();
                settings.experimental.experimental_big_terminal_mode = value;
                settings.git.archive_on_merge = true;
                fixture.service.update(settings).unwrap();
                assert_eq!(fixture.table().get(KEY), Some(&value.to_string()));
                let file = fs::read_to_string(fixture.service.path()).unwrap();
                assert!(!file.contains(KEY), "{file}");
                assert!(file.contains("archive_on_merge = true"), "{file}");
                let fresh = SettingsService::new(
                    fixture.service.path().to_path_buf(),
                    Arc::new(MemorySecretStore::new()),
                )
                .with_db(fixture.pool.clone());
                let reloaded = fresh.get().unwrap();
                assert_eq!(reloaded.experimental.experimental_big_terminal_mode, value);
                assert!(reloaded.git.archive_on_merge);
            }
        }

        #[test]
        fn legacy_true_and_false_migrate_once_and_leave_unrelated_values() {
            for value in [true, false] {
                let fixture = Fixture::new();
                fixture.legacy(value);
                assert_eq!(fixture.service.move_appearance_to_db().unwrap(), vec![KEY]);
                assert_eq!(fixture.table().get(KEY), Some(&value.to_string()));
                let file = fs::read_to_string(fixture.service.path()).unwrap();
                assert!(!file.contains(KEY), "{file}");
                assert!(file.contains("archive_on_merge = true"), "{file}");
                assert_eq!(
                    fixture.service.get().unwrap().experimental.experimental_big_terminal_mode,
                    value
                );
                assert!(fixture.service.move_appearance_to_db().unwrap().is_empty());
            }
        }

        #[test]
        fn active_rows_override_opposite_legacy_values() {
            for active in [true, false] {
                let fixture = Fixture::new();
                fixture.legacy(!active);
                tauri::async_runtime::block_on(app_settings::set(
                    &fixture.pool,
                    KEY,
                    &active.to_string(),
                ))
                .unwrap();
                assert_eq!(
                    fixture.service.get().unwrap().experimental.experimental_big_terminal_mode,
                    active
                );
                assert!(fixture.service.move_appearance_to_db().unwrap().is_empty());
                assert_eq!(fixture.table().get(KEY), Some(&active.to_string()));
                let file = fs::read_to_string(fixture.service.path()).unwrap();
                assert!(!file.contains(KEY), "{file}");
                assert!(file.contains("archive_on_merge = true"), "{file}");
            }
        }

        #[test]
        fn unset_default_is_not_materialized_by_an_unrelated_save() {
            let fixture = Fixture::new();
            let mut settings = fixture.service.get().unwrap();
            assert!(!settings.experimental.experimental_big_terminal_mode);
            assert!(!fixture.table().contains_key(KEY));
            settings.git.archive_on_merge = true;
            fixture.service.update(settings).unwrap();
            assert!(!fixture.table().contains_key(KEY));
            let file = fs::read_to_string(fixture.service.path()).unwrap();
            assert!(!file.contains(KEY), "{file}");
            assert!(file.contains("archive_on_merge = true"), "{file}");
        }

        #[test]
        fn invalid_rows_do_not_change_the_typed_value() {
            for initial in [true, false] {
                for invalid in ["TRUE", "1", "yes", ""] {
                    let mut settings = Settings::default();
                    settings.experimental.experimental_big_terminal_mode = initial;
                    overlay(&mut settings, &rows(&[(KEY, invalid)]));
                    assert_eq!(settings.experimental.experimental_big_terminal_mode, initial);
                    assert!(!settings.experimental.extra.contains_key(KEY));
                }
            }
        }

        #[test]
        fn service_without_a_database_keeps_the_file_fallback() {
            let fixture = Fixture::new();
            let service = SettingsService::new(
                fixture.service.path().to_path_buf(),
                Arc::new(MemorySecretStore::new()),
            );
            for value in [true, false] {
                let mut settings = service.get().unwrap();
                settings.experimental.experimental_big_terminal_mode = value;
                service.update(settings).unwrap();
                let file = fs::read_to_string(service.path()).unwrap();
                assert!(file.contains(&format!("{KEY} = {value}")), "{file}");
                assert_eq!(
                    service.get().unwrap().experimental.experimental_big_terminal_mode,
                    value
                );
            }
        }
    }

    #[test]
    fn keys_are_unique() {
        let mut keys: Vec<_> = PREFS.iter().map(|p| p.key).collect();
        keys.sort();
        keys.dedup();
        assert_eq!(keys.len(), PREFS.len());
    }

    #[test]
    fn cloud_ui_opt_in_round_trips_and_is_absent_for_existing_users() {
        let mut settings = Settings::default();
        overlay(&mut settings, &rows(&[("voice_mode", "true")]));
        assert_eq!(
            settings.experimental.extra.get("experimental_cloud_ui"),
            None
        );
        settings
            .experimental
            .extra
            .insert("experimental_cloud_ui".into(), Value::Boolean(true));
        let saved = changes(&settings, &rows(&[("voice_mode", "true")])).unwrap();
        assert_eq!(saved, vec![("experimental_cloud_ui", "true".to_string())]);
        let mut reloaded = Settings::default();
        overlay(&mut reloaded, &rows(&[("experimental_cloud_ui", "true")]));
        assert_eq!(
            reloaded.experimental.extra.get("experimental_cloud_ui"),
            Some(&Value::Boolean(true))
        );
        overlay(&mut reloaded, &rows(&[("experimental_cloud_ui", "false")]));
        assert_eq!(
            reloaded.experimental.extra.get("experimental_cloud_ui"),
            Some(&Value::Boolean(false))
        );
    }

    #[test]
    fn overlay_decodes_like_conductors_hooks() {
        let mut s = Settings::default();
        overlay(
            &mut s,
            &rows(&[
                ("not_absolutely_right", "true"),
                ("auto_convert_long_text", "false"),
                ("voice_mode", "yes"),
                ("pull_request_open_target", "linear"),
                ("markdown_style", "fancy"),
                ("automerge_enabled", "true"),
            ]),
        );
        assert_eq!(
            s.general.extra.get("not_absolutely_right"),
            Some(&Value::Boolean(true))
        );
        assert_eq!(
            s.general.extra.get("auto_convert_long_text"),
            Some(&Value::Boolean(false))
        );
        assert_eq!(
            s.experimental.extra.get("voice_mode"),
            None,
            "not a boolean"
        );
        assert_eq!(
            s.git.extra.get("pull_request_open_target"),
            Some(&Value::String("linear".into()))
        );
        assert_eq!(
            s.appearance.extra.get("markdown_style"),
            None,
            "not a markdown style"
        );
        assert_eq!(
            s.extra.get("automerge_enabled"),
            Some(&Value::Boolean(true))
        );
    }

    #[test]
    fn changes_write_only_what_differs_and_refuse_wrong_types() {
        let mut s = Settings::default();
        s.general
            .extra
            .insert("not_absolutely_right".into(), Value::Boolean(true));
        s.experimental
            .extra
            .insert("voice_mode".into(), Value::Boolean(false));
        let current = rows(&[("voice_mode", "false")]);
        assert_eq!(
            changes(&s, &current).unwrap(),
            vec![("not_absolutely_right", "true".to_string())]
        );

        s.git.extra.insert(
            "pull_request_open_target".into(),
            Value::String("gitlab".into()),
        );
        assert!(changes(&s, &current)
            .unwrap_err()
            .contains("pull_request_open_target"));
    }

    #[test]
    fn strip_and_in_file_cover_sections_and_the_top_level() {
        let mut file: Table = toml::from_str(
            "automerge_enabled = true\nkeep = 1\n[general]\nnot_absolutely_right = \"maybe\"\n[experimental]\nvoice_mode = true\n",
        )
        .unwrap();
        assert!(file_has_any(&file));
        assert_eq!(
            in_file(&file),
            vec![
                ("automerge_enabled", "true".to_string()),
                ("voice_mode", "true".to_string())
            ]
        );
        strip(&mut file);
        assert!(!file_has_any(&file));
        assert_eq!(file.get("keep"), Some(&Value::Integer(1)));
        assert!(file.get("general").is_none() && file.get("experimental").is_none());
    }
}
