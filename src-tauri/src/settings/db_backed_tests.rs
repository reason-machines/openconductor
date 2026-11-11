use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use openconductor_db::{app_settings, SqlitePool};

use super::db_backed::{self, KEYS};
use super::service::SettingsService;
use super::{Appearance, CodeTheme, ColorVision, FILE_NAME};
use crate::agent::MemorySecretStore;

fn rows(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

fn temp_file() -> PathBuf {
    static N: AtomicU32 = AtomicU32::new(0);
    let dir = std::env::temp_dir().join(format!(
        "oc-settings-db-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir.join(FILE_NAME)
}

fn with_db(path: PathBuf) -> (SettingsService, SqlitePool) {
    let pool = tauri::async_runtime::block_on(openconductor_db::open_in_memory()).unwrap();
    let svc = SettingsService::new(path, Arc::new(MemorySecretStore::new())).with_db(pool.clone());
    (svc, pool)
}

fn table(pool: &SqlitePool) -> HashMap<String, String> {
    tauri::async_runtime::block_on(app_settings::active(pool))
        .unwrap()
        .into_iter()
        .collect()
}

#[test]
fn rows_decode_like_the_reference_hooks() {
    let mut a = Appearance::default();
    db_backed::overlay(
        &mut a,
        &rows(&[
            ("zoom_level_v2", "1.1"),
            ("mono_font", "Menlo"),
            ("low_contrast_dark_mode", "true"),
            ("code_theme", "tokyo-night"),
            ("colored_sidebar_diffs", "true"),
            ("file_ligatures_enabled", "false"),
        ]),
    );
    assert_eq!(a.zoom_level_v2, 1.1);
    assert_eq!(a.mono_font.as_deref(), Some("Menlo"));
    assert!(a.low_contrast_dark_mode);
    assert_eq!(a.code_theme, CodeTheme::TokyoNight);
    assert_eq!(
        a.extra
            .get("colored_sidebar_diffs")
            .and_then(|v| v.as_bool()),
        Some(true)
    );
    assert!(!a.file_ligatures_enabled);

    // Unusable values keep what was loaded; an unknown theme is the default.
    let mut a = Appearance::default();
    db_backed::overlay(
        &mut a,
        &rows(&[
            ("zoom_level_v2", "9"),
            ("code_theme", "neon"),
            ("file_ligatures_enabled", "maybe"),
        ]),
    );
    assert_eq!(a.zoom_level_v2, 1.0);
    assert_eq!(a.code_theme, CodeTheme::Default);
    assert!(a.file_ligatures_enabled);
}

#[test]
fn values_encode_as_the_reference_writes_them() {
    let mut a = Appearance {
        zoom_level_v2: 1.0,
        code_theme: CodeTheme::GruvboxDark,
        ..Appearance::default()
    };
    let r: HashMap<_, _> = db_backed::rows(&a).into_iter().collect();
    assert_eq!(r["zoom_level_v2"].as_deref(), Some("1"));
    assert_eq!(r["code_theme"].as_deref(), Some("gruvbox-dark"));
    assert_eq!(r["low_contrast_dark_mode"].as_deref(), Some("false"));
    assert_eq!(r["file_ligatures_enabled"].as_deref(), Some("true"));
    assert_eq!(r["mono_font"], None, "no font deletes the row");
    assert_eq!(r["colored_sidebar_diffs"], None);
    a.zoom_level_v2 = 1.2;
    let r: HashMap<_, _> = db_backed::rows(&a).into_iter().collect();
    assert_eq!(r["zoom_level_v2"].as_deref(), Some("1.2"));
    // Only changed rows are written.
    let current: HashMap<String, String> = db_backed::rows(&a)
        .into_iter()
        .filter_map(|(k, v)| v.map(|v| (k.to_string(), v)))
        .collect();
    assert!(db_backed::changes(&a, &current).is_empty());
}

#[test]
fn update_writes_the_table_and_keeps_the_keys_out_of_the_file() {
    let path = temp_file();
    let (svc, pool) = with_db(path.clone());
    let mut s = svc.get().unwrap();
    s.appearance.zoom_level_v2 = 1.3;
    s.appearance.mono_font = Some("Menlo".into());
    s.appearance.code_theme = CodeTheme::Dracula;
    s.appearance.terminal_font_size = 14;
    s.appearance
        .extra
        .insert("colored_sidebar_diffs".into(), toml::Value::Boolean(true));
    svc.update(s).unwrap();

    let t = table(&pool);
    assert_eq!(t["zoom_level_v2"], "1.3");
    assert_eq!(t["mono_font"], "Menlo");
    assert_eq!(t["code_theme"], "dracula");
    assert_eq!(t["colored_sidebar_diffs"], "true");
    assert_eq!(t["terminal_font_size"], "14");
    let text = fs::read_to_string(&path).unwrap();
    for key in KEYS {
        assert!(
            !text.contains(key),
            "{key} must not be in the file:\n{text}"
        );
    }
    assert!(!text.contains("terminal_font_size"), "{text}");

    let back = svc.get().unwrap();
    assert_eq!(back.appearance.zoom_level_v2, 1.3);
    assert_eq!(back.appearance.mono_font.as_deref(), Some("Menlo"));
    assert_eq!(back.appearance.code_theme, CodeTheme::Dracula);
    assert_eq!(back.appearance.terminal_font_size, 14);

    // Clearing the font deletes its row.
    let mut s = back;
    s.appearance.mono_font = None;
    svc.update(s).unwrap();
    assert!(!table(&pool).contains_key("mono_font"));
}

#[test]
fn values_an_older_build_wrote_to_the_file_move_to_the_table_once() {
    let path = temp_file();
    fs::write(
        &path,
        "[appearance]\nzoom_level_v2 = 1.2\nmono_font = \"Menlo\"\ncode_theme = \"nord\"\nlow_contrast_dark_mode = true\nterminal_font_size = 15\n\n[git]\narchive_on_merge = true\n",
    )
    .unwrap();
    let (svc, pool) = with_db(path.clone());
    // A row the table already has wins over the file.
    tauri::async_runtime::block_on(app_settings::set(&pool, "code_theme", "dracula")).unwrap();

    let mut moved = svc.move_appearance_to_db().unwrap();
    moved.sort();
    assert_eq!(
        moved,
        vec![
            "low_contrast_dark_mode",
            "mono_font",
            "terminal_font_size",
            "zoom_level_v2",
        ]
    );
    let t = table(&pool);
    assert_eq!(t["zoom_level_v2"], "1.2");
    assert_eq!(t["code_theme"], "dracula");
    let text = fs::read_to_string(&path).unwrap();
    assert!(
        !text.contains("zoom_level_v2") && !text.contains("code_theme"),
        "{text}"
    );
    assert!(!text.contains("terminal_font_size"), "{text}");
    assert_eq!(t["terminal_font_size"], "15");
    assert!(text.contains("archive_on_merge = true"), "{text}");

    let s = svc.get().unwrap();
    assert_eq!(s.appearance.zoom_level_v2, 1.2);
    assert_eq!(s.appearance.code_theme, CodeTheme::Dracula);
    assert!(s.appearance.low_contrast_dark_mode);
    assert!(s.git.archive_on_merge);
    assert!(svc.move_appearance_to_db().unwrap().is_empty());
}

#[test]
fn the_service_works_from_inside_the_async_runtime() {
    let (svc, _pool) = with_db(temp_file());
    let got = tauri::async_runtime::block_on(async { svc.get().map(|s| s.appearance) });
    assert_eq!(got.unwrap().zoom_level_v2, 1.0);
}

#[test]
fn table_prefs_round_trip_through_the_table_not_the_file() {
    let path = temp_file();
    let (svc, pool) = with_db(path.clone());
    let mut s = svc.get().unwrap();
    assert!(
        s.general.extra.get("not_absolutely_right").is_none(),
        "unset keys stay absent"
    );
    s.general
        .extra
        .insert("not_absolutely_right".into(), toml::Value::Boolean(true));
    s.git.extra.insert(
        "pull_request_open_target".into(),
        toml::Value::String("graphite".into()),
    );
    s.extra
        .insert("automerge_enabled".into(), toml::Value::Boolean(true));
    svc.update(s).unwrap();

    let t = table(&pool);
    assert_eq!(t["not_absolutely_right"], "true");
    assert_eq!(t["pull_request_open_target"], "graphite");
    assert_eq!(t["automerge_enabled"], "true");
    let text = fs::read_to_string(&path).unwrap();
    assert!(
        !text.contains("not_absolutely_right")
            && !text.contains("pull_request_open_target")
            && !text.contains("automerge_enabled"),
        "{text}"
    );
    let back = svc.get().unwrap();
    assert_eq!(
        back.general.extra.get("not_absolutely_right"),
        Some(&toml::Value::Boolean(true))
    );
    assert_eq!(
        back.extra.get("automerge_enabled"),
        Some(&toml::Value::Boolean(true))
    );

    let mut bad = back.clone();
    bad.experimental
        .extra
        .insert("voice_mode".into(), toml::Value::String("on".into()));
    assert!(svc.update(bad).is_err(), "a wrong type is refused");
    assert!(!table(&pool).contains_key("voice_mode"));
}

#[test]
fn table_prefs_in_an_older_file_move_to_the_table() {
    let path = temp_file();
    fs::write(
        &path,
        "automerge_enabled = true\ntreat_optional_checks_as_blocking = true\n\n[experimental]\nvoice_mode = true\n[git]\narchive_on_merge = true\n",
    )
    .unwrap();
    let (svc, pool) = with_db(path.clone());
    tauri::async_runtime::block_on(app_settings::set(
        &pool,
        "treat_optional_checks_as_blocking",
        "false",
    ))
    .unwrap();
    let mut moved = svc.move_appearance_to_db().unwrap();
    moved.sort();
    assert_eq!(moved, vec!["automerge_enabled", "voice_mode"]);
    let t = table(&pool);
    assert_eq!(
        t["treat_optional_checks_as_blocking"], "false",
        "the table wins"
    );
    let text = fs::read_to_string(&path).unwrap();
    assert!(
        text.contains("archive_on_merge = true"),
        "{text}"
    );
    assert!(
        !text.contains("voice_mode") && !text.contains("automerge"),
        "{text}"
    );
}

#[test]
fn terminal_appearance_rows_overlay_the_active_table_values() {
    let mut appearance = Appearance::default();
    db_backed::overlay(
        &mut appearance,
        &rows(&[
            ("terminal_font_family", "JetBrains Mono"),
            ("terminal_font_size", "16"),
            ("color_vision", "tritanopia"),
        ]),
    );
    assert_eq!(appearance.terminal_font_family.as_deref(), Some("JetBrains Mono"));
    assert_eq!(appearance.terminal_font_size, 16);
    assert_eq!(appearance.color_vision, ColorVision::Tritanopia);
}

#[test]
fn terminal_appearance_rows_encode_the_reference_strings() {
    let appearance = Appearance {
        terminal_font_family: Some("Menlo".into()),
        terminal_font_size: 15,
        color_vision: ColorVision::ProtanopiaDeuteranopia,
        ..Appearance::default()
    };
    let encoded: HashMap<_, _> = db_backed::rows(&appearance).into_iter().collect();
    assert_eq!(encoded.get("terminal_font_family"), Some(&Some("Menlo".into())));
    assert_eq!(encoded.get("terminal_font_size"), Some(&Some("15".into())));
    assert_eq!(
        encoded.get("color_vision"),
        Some(&Some("protanopia-deuteranopia".into()))
    );
}

#[test]
fn terminal_appearance_saves_and_restores_through_the_table() {
    let path = temp_file();
    let (svc, pool) = with_db(path.clone());
    let mut settings = svc.get().unwrap();
    settings.appearance.terminal_font_family = Some("Menlo".into());
    settings.appearance.terminal_font_size = 18;
    settings.appearance.color_vision = ColorVision::Tritanopia;
    settings.git.archive_on_merge = true;
    svc.update(settings).unwrap();

    let active = table(&pool);
    assert_eq!(active.get("terminal_font_family").map(String::as_str), Some("Menlo"));
    assert_eq!(active.get("terminal_font_size").map(String::as_str), Some("18"));
    assert_eq!(active.get("color_vision").map(String::as_str), Some("tritanopia"));
    let text = fs::read_to_string(&path).unwrap();
    for key in ["terminal_font_family", "terminal_font_size", "color_vision"] {
        assert!(!text.contains(key), "{key} must not remain in TOML: {text}");
    }
    assert!(text.contains("archive_on_merge = true"));

    let reopened = SettingsService::new(path, Arc::new(MemorySecretStore::new())).with_db(pool);
    let restored = reopened.get().unwrap();
    assert_eq!(restored.appearance.terminal_font_family.as_deref(), Some("Menlo"));
    assert_eq!(restored.appearance.terminal_font_size, 18);
    assert_eq!(restored.appearance.color_vision, ColorVision::Tritanopia);
    assert!(restored.git.archive_on_merge);
}

#[test]
fn terminal_appearance_active_rows_override_legacy_file_values() {
    let path = temp_file();
    fs::write(
        &path,
        "[appearance]\nterminal_font_family = \"Legacy\"\nterminal_font_size = 11\ncolor_vision = \"default\"\n",
    )
    .unwrap();
    let (svc, pool) = with_db(path);
    for (key, value) in [
        ("terminal_font_family", "Menlo"),
        ("terminal_font_size", "19"),
        ("color_vision", "tritanopia"),
    ] {
        tauri::async_runtime::block_on(app_settings::set(&pool, key, value)).unwrap();
    }
    let loaded = svc.get().unwrap();
    assert_eq!(loaded.appearance.terminal_font_family.as_deref(), Some("Menlo"));
    assert_eq!(loaded.appearance.terminal_font_size, 19);
    assert_eq!(loaded.appearance.color_vision, ColorVision::Tritanopia);
}

#[test]
fn terminal_appearance_legacy_migration_preserves_active_rows_and_unrelated_values() {
    let path = temp_file();
    fs::write(
        &path,
        "[appearance]\nterminal_font_family = \"Legacy\"\nterminal_font_size = 15\ncolor_vision = \"protanopia-deuteranopia\"\nfuture_appearance_key = \"keep\"\n\n[git]\narchive_on_merge = true\n",
    )
    .unwrap();
    let (svc, pool) = with_db(path.clone());
    tauri::async_runtime::block_on(app_settings::set(&pool, "terminal_font_family", "Menlo"))
        .unwrap();
    let mut copied = svc.move_appearance_to_db().unwrap();
    copied.sort();
    assert_eq!(copied, vec!["color_vision", "terminal_font_size"]);
    let active = table(&pool);
    assert_eq!(active["terminal_font_family"], "Menlo");
    assert_eq!(active["terminal_font_size"], "15");
    assert_eq!(active["color_vision"], "protanopia-deuteranopia");
    let text = fs::read_to_string(&path).unwrap();
    for key in ["terminal_font_family", "terminal_font_size", "color_vision"] {
        assert!(!text.contains(key), "{key} must not remain in TOML: {text}");
    }
    assert!(text.contains("future_appearance_key = \"keep\""));
    assert!(text.contains("archive_on_merge = true"));
    assert!(svc.move_appearance_to_db().unwrap().is_empty());
    let restored = svc.get().unwrap();
    assert_eq!(restored.appearance.terminal_font_family.as_deref(), Some("Menlo"));
    assert_eq!(restored.appearance.terminal_font_size, 15);
    assert_eq!(restored.appearance.color_vision, ColorVision::ProtanopiaDeuteranopia);
}

#[test]
fn terminal_appearance_migration_does_not_materialize_unset_defaults() {
    let path = temp_file();
    fs::write(&path, "[appearance]\nterminal_font_size = 14\n").unwrap();
    let (svc, pool) = with_db(path);
    assert_eq!(svc.move_appearance_to_db().unwrap(), vec!["terminal_font_size"]);
    let active = table(&pool);
    assert_eq!(active["terminal_font_size"], "14");
    assert!(!active.contains_key("terminal_font_family"));
    assert!(!active.contains_key("color_vision"));
}

#[test]
fn terminal_appearance_font_reset_deletes_the_row() {
    let (svc, pool) = with_db(temp_file());
    tauri::async_runtime::block_on(app_settings::set(&pool, "terminal_font_family", "Menlo"))
        .unwrap();
    let mut settings = svc.get().unwrap();
    settings.appearance.terminal_font_family = None;
    svc.update(settings).unwrap();
    assert!(!table(&pool).contains_key("terminal_font_family"));
    assert_eq!(svc.get().unwrap().appearance.terminal_font_family, None);
}

#[test]
fn terminal_appearance_without_database_keeps_the_file_fallback() {
    let path = temp_file();
    let svc = SettingsService::new(path.clone(), Arc::new(MemorySecretStore::new()));
    let mut settings = svc.get().unwrap();
    settings.appearance.terminal_font_family = Some("Menlo".into());
    settings.appearance.terminal_font_size = 20;
    settings.appearance.color_vision = ColorVision::ProtanopiaDeuteranopia;
    svc.update(settings.clone()).unwrap();
    let text = fs::read_to_string(path).unwrap();
    assert!(text.contains("terminal_font_family = \"Menlo\""));
    assert!(text.contains("terminal_font_size = 20"));
    assert!(text.contains("color_vision = \"protanopia-deuteranopia\""));
    assert_eq!(svc.get().unwrap().appearance, settings.appearance);
    assert!(svc.move_appearance_to_db().unwrap().is_empty());
}
