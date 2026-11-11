//! Big Terminal's non-file-backed settings, encoded as the reference's string rows.

use std::collections::HashMap;

use super::Terminal;

const PRESET: &str = "big_terminal_preset";
const COMMANDS: &str = "big_terminal_custom_commands";
const KEYS: [&str; 2] = [PRESET, COMMANDS];

type Row = (&'static str, Option<String>);

pub(super) fn overlay(terminal: &mut Terminal, current: &HashMap<String, String>) {
    if let Some(preset) = current.get(PRESET) {
        terminal.big_terminal_preset = Some(preset.clone());
    }
    if let Some(text) = current.get(COMMANDS) {
        terminal.big_terminal_custom_commands =
            serde_json::from_str::<Vec<serde_json::Value>>(text)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|value| serde_json::from_value(value).ok())
                .collect();
    }
}

pub(super) fn rows(terminal: &Terminal) -> Result<Vec<Row>, serde_json::Error> {
    Ok(vec![
        (
            PRESET,
            terminal
                .big_terminal_preset
                .clone()
                .filter(|value| {
                    !value
                        .trim_matches(|c: char| {
                            c == '\u{feff}' || (c.is_whitespace() && c != '\u{85}')
                        })
                        .is_empty()
                }),
        ),
        (
            COMMANDS,
            Some(serde_json::to_string(&terminal.big_terminal_custom_commands)?),
        ),
    ])
}

pub(super) fn changes(
    terminal: &Terminal,
    current: &HashMap<String, String>,
) -> Result<Vec<Row>, serde_json::Error> {
    Ok(rows(terminal)?
        .into_iter()
        .filter(|(key, value)| {
            (*key != COMMANDS
                || !terminal.big_terminal_custom_commands.is_empty()
                || current.contains_key(*key))
                && current.get(*key) != value.as_ref()
        })
        .collect())
}

pub(super) fn file_keys(table: &toml::Table) -> Vec<&'static str> {
    match table.get("terminal").and_then(toml::Value::as_table) {
        Some(terminal) => KEYS
            .into_iter()
            .filter(|key| terminal.contains_key(*key))
            .collect(),
        None => Vec::new(),
    }
}

pub(super) fn strip(table: &mut toml::Table) {
    if let Some(toml::Value::Table(terminal)) = table.get_mut("terminal") {
        for key in KEYS {
            terminal.remove(key);
        }
        if terminal.is_empty() {
            table.remove("terminal");
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    use openconductor_db::{app_settings, SqlitePool};

    use crate::agent::MemorySecretStore;
    use crate::settings::service::SettingsService;
    use crate::settings::{BigTerminalCustomCommand, FILE_NAME};

    use super::{COMMANDS, PRESET};

    struct Fixture {
        service: SettingsService,
        pool: SqlitePool,
        dir: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU32 = AtomicU32::new(0);
            let dir = std::env::temp_dir().join(format!(
                "oc-big-terminal-prefs-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&dir).unwrap();
            let pool = tauri::async_runtime::block_on(openconductor_db::open_in_memory()).unwrap();
            let service =
                SettingsService::new(dir.join(FILE_NAME), Arc::new(MemorySecretStore::new()))
                    .with_db(pool.clone());
            Self { service, pool, dir }
        }

        fn set(&self, key: &str, value: &str) {
            tauri::async_runtime::block_on(app_settings::set(&self.pool, key, value)).unwrap();
        }

        fn row(&self, key: &str) -> Option<String> {
            tauri::async_runtime::block_on(app_settings::get(&self.pool, key)).unwrap()
        }

        fn file(&self, text: &str) {
            fs::write(self.service.path(), text).unwrap();
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            tauri::async_runtime::block_on(self.pool.close());
            fs::remove_dir_all(&self.dir).unwrap();
        }
    }

    fn command(id: &str, text: &str) -> BigTerminalCustomCommand {
        BigTerminalCustomCommand {
            id: id.into(),
            command: text.into(),
        }
    }

    #[test]
    fn save_uses_settings_rows_and_recreated_service_reads_them() {
        let f = Fixture::new();
        let mut settings = f.service.get().unwrap();
        settings.terminal.big_terminal_preset = Some("custom:a".into());
        settings.terminal.big_terminal_custom_commands = vec![command("a", "echo \"hello\"\nnext")];
        settings
            .terminal
            .extra
            .insert("unrelated".into(), "kept".into());
        f.service.update(settings).unwrap();
        assert_eq!(f.row(PRESET).as_deref(), Some("custom:a"));
        assert_eq!(
            f.row(COMMANDS).as_deref(),
            Some("[{\"id\":\"a\",\"command\":\"echo \\\"hello\\\"\\nnext\"}]")
        );
        let text = fs::read_to_string(f.service.path()).unwrap();
        assert!(!text.contains(PRESET), "{text}");
        assert!(!text.contains(COMMANDS), "{text}");
        assert!(text.contains("unrelated = \"kept\""), "{text}");
        let recreated = SettingsService::new(
            f.service.path().to_path_buf(),
            Arc::new(MemorySecretStore::new()),
        )
        .with_db(f.pool.clone());
        let back = recreated.get().unwrap();
        assert_eq!(back.terminal.big_terminal_preset.as_deref(), Some("custom:a"));
        assert_eq!(
            back.terminal.big_terminal_custom_commands,
            vec![command("a", "echo \"hello\"\nnext")]
        );
    }

    #[test]
    fn active_rows_override_legacy_file_and_decode_each_command_independently() {
        let f = Fixture::new();
        f.file("[terminal]\nbig_terminal_preset = \"codex\"\nbig_terminal_custom_commands = [{id=\"old\",command=\"old\"}]\n");
        f.set(PRESET, "custom:new");
        f.set(COMMANDS, r#"[{"id":"new","command":" raw "},{"id":3,"command":"bad"},null,{"id":"empty","command":"","extra":true}]"#);
        let got = f.service.get().unwrap().terminal;
        assert_eq!(got.big_terminal_preset.as_deref(), Some("custom:new"));
        assert_eq!(
            got.big_terminal_custom_commands,
            vec![command("new", " raw "), command("empty", "")]
        );
        for malformed in ["not json", "null", "{}", "[false,2]"] {
            f.set(COMMANDS, malformed);
            assert!(f
                .service
                .get()
                .unwrap()
                .terminal
                .big_terminal_custom_commands
                .is_empty());
        }
    }

    #[test]
    fn clearing_preset_deletes_its_row_and_empty_commands_store_json_array() {
        let f = Fixture::new();
        f.set(PRESET, "codex");
        f.set(COMMANDS, r#"[{"id":"a","command":"old"}]"#);
        let mut settings = f.service.get().unwrap();
        settings.terminal.big_terminal_preset = None;
        settings.terminal.big_terminal_custom_commands.clear();
        f.service.update(settings).unwrap();
        assert_eq!(f.row(PRESET), None);
        assert_eq!(f.row(COMMANDS).as_deref(), Some("[]"));
        assert!(f
            .service
            .get()
            .unwrap()
            .terminal
            .big_terminal_custom_commands
            .is_empty());
        for blank in [" \t\n", "\u{feff}"] {
            let mut settings = f.service.get().unwrap();
            settings.terminal.big_terminal_preset = Some(blank.into());
            f.service.update(settings).unwrap();
            assert_eq!(f.row(PRESET), None);
        }
        let mut settings = f.service.get().unwrap();
        settings.terminal.big_terminal_preset = Some(" \u{85} ".into());
        f.service.update(settings).unwrap();
        assert_eq!(f.row(PRESET).as_deref(), Some(" \u{85} "));
    }

    #[test]
    fn legacy_migration_preserves_existing_rows_and_unrelated_file_keys() {
        let f = Fixture::new();
        f.file("[git]\narchive_on_merge = true\n[terminal]\nbig_terminal_preset = \"codex\"\nbig_terminal_custom_commands = [{id=\"a\",command=\"file command\"}]\nunrelated = \"kept\"\n");
        f.set(PRESET, "claude");
        assert_eq!(f.service.move_appearance_to_db().unwrap(), vec![COMMANDS]);
        assert_eq!(f.row(PRESET).as_deref(), Some("claude"));
        assert_eq!(
            f.row(COMMANDS).as_deref(),
            Some(r#"[{"id":"a","command":"file command"}]"#)
        );
        let text = fs::read_to_string(f.service.path()).unwrap();
        assert!(!text.contains(PRESET) && !text.contains(COMMANDS), "{text}");
        assert!(text.contains("archive_on_merge = true"), "{text}");
        assert!(text.contains("unrelated = \"kept\""), "{text}");
        assert!(f.service.move_appearance_to_db().unwrap().is_empty());
        assert_eq!(
            f.service.get().unwrap().terminal.big_terminal_preset.as_deref(),
            Some("claude")
        );
    }

    #[test]
    fn migration_copies_only_explicit_keys_including_an_empty_command_list() {
        let f = Fixture::new();
        f.file("[terminal]\nbig_terminal_custom_commands = []\n");
        assert_eq!(f.service.move_appearance_to_db().unwrap(), vec![COMMANDS]);
        assert_eq!(f.row(COMMANDS).as_deref(), Some("[]"));
        assert_eq!(f.row(PRESET), None);
        assert!(f.service.move_appearance_to_db().unwrap().is_empty());
        let empty = Fixture::new();
        empty.file("[terminal]\nunrelated = \"kept\"\n");
        assert!(empty.service.move_appearance_to_db().unwrap().is_empty());
        assert_eq!(empty.row(PRESET), None);
        assert_eq!(empty.row(COMMANDS), None);
    }

    #[test]
    fn deprecated_rows_do_not_override_legacy_file_or_block_migration() {
        let f = Fixture::new();
        f.file("[terminal]\nbig_terminal_preset = \"codex\"\n");
        f.set(PRESET, "claude");
        tauri::async_runtime::block_on(app_settings::deprecate(&f.pool, PRESET)).unwrap();
        assert_eq!(
            f.service.get().unwrap().terminal.big_terminal_preset.as_deref(),
            Some("codex")
        );
        assert_eq!(f.service.move_appearance_to_db().unwrap(), vec![PRESET]);
        assert_eq!(f.row(PRESET).as_deref(), Some("codex"));
    }

    #[test]
    fn unrelated_save_does_not_seed_unset_terminal_rows() {
        let f = Fixture::new();
        let mut settings = f.service.get().unwrap();
        settings.appearance.terminal_font_size = 15;
        f.service.update(settings).unwrap();
        assert_eq!(f.row(PRESET), None);
        assert_eq!(f.row(COMMANDS), None);
        assert_eq!(f.service.get().unwrap().appearance.terminal_font_size, 15);
    }

    #[test]
    fn migration_failure_leaves_the_legacy_file_unchanged() {
        let f = Fixture::new();
        let text = "[terminal]\nbig_terminal_preset = \"codex\"\n";
        f.file(text);
        tauri::async_runtime::block_on(f.pool.close());
        assert!(f.service.move_appearance_to_db().is_err());
        assert_eq!(fs::read_to_string(f.service.path()).unwrap(), text);
    }

    #[test]
    fn no_database_keeps_the_file_fallback() {
        let f = Fixture::new();
        let service = SettingsService::new(
            f.service.path().to_path_buf(),
            Arc::new(MemorySecretStore::new()),
        );
        let mut settings = service.get().unwrap();
        settings.terminal.big_terminal_preset = Some("codex".into());
        settings.terminal.big_terminal_custom_commands = vec![command("a", "raw")];
        service.update(settings).unwrap();
        assert!(service.move_appearance_to_db().unwrap().is_empty());
        let text = fs::read_to_string(service.path()).unwrap();
        assert!(text.contains(PRESET) && text.contains(COMMANDS), "{text}");
        assert_eq!(
            service.get().unwrap().terminal.big_terminal_preset.as_deref(),
            Some("codex")
        );
        assert_eq!(f.row(PRESET), None);
        assert_eq!(f.row(COMMANDS), None);
    }
}
