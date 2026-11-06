use super::*;
use crate::agent::{AgentKind, ProviderConfig};
use std::sync::atomic::{AtomicU32, Ordering};

fn temp_dir() -> PathBuf {
    static N: AtomicU32 = AtomicU32::new(0);
    let d = std::env::temp_dir().join(format!(
        "oc-settings-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn missing_file_yields_defaults() {
    let s = load(&temp_dir().join(FILE_NAME)).unwrap();
    assert_eq!(s, Settings::default());
    assert_eq!(s.models.default, DEFAULT_MODEL);
    assert_eq!(s.git.branch_prefix_type, BranchPrefixType::GithubUsername);
}

#[test]
fn round_trip_keeps_values_and_unknown_keys() {
    let path = temp_dir().join("nested").join(FILE_NAME);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(
        &path,
        r#"
"$schema" = "x"
future_top = 1
[git]
branch_prefix_type = "custom"
branch_prefix = "sven"
future_git = "kept"
[models]
default = "sonnet"
review = "opus"
[models.codex]
default_thinking_level = "high"
review_thinking_level = "xhigh"
[providers.claude]
kind = "bedrock"
region = "eu-west-1"
"#,
    )
    .unwrap();
    let mut s = load(&path).unwrap();
    assert_eq!(s.git.branch_prefix.as_deref(), Some("sven"));
    assert_eq!(s.models.codex.default_thinking_level, ThinkingLevel::High);
    assert_eq!(
        s.providers.effective(AgentKind::Claude).provider().kind(),
        "bedrock"
    );
    assert_eq!(
        s.providers.effective(AgentKind::Codex),
        ProviderConfig::default_for(AgentKind::Codex)
    );
    assert_eq!(
        s.providers.effective(AgentKind::Reason).provider().kind(),
        "reason_login"
    );
    s.general.theme = Theme::Dark;
    save(&path, &s).unwrap();

    let text = fs::read_to_string(&path).unwrap();
    assert!(text.contains("future_top = 1"), "{text}");
    assert!(text.contains("future_git = \"kept\""), "{text}");
    assert!(text.contains("theme = \"dark\""), "{text}");
    assert_eq!(load(&path).unwrap(), s);
    let leftovers: Vec<_> = fs::read_dir(path.parent().unwrap())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .filter(|n| n != FILE_NAME)
        .collect();
    assert!(leftovers.is_empty(), "temp files left: {leftovers:?}");
}

#[test]
fn first_save_writes_schema_and_sections() {
    let path = temp_dir().join(FILE_NAME);
    save(&path, &Settings::default()).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(
        text.starts_with(&format!("\"$schema\" = \"{SCHEMA_URL}\"")),
        "{text}"
    );
    for section in [
        "[general]",
        "[appearance]",
        "[git]",
        "[models]",
        "[models.codex]",
        "[providers]",
    ] {
        assert!(text.contains(section), "missing {section}: {text}");
    }
}

#[test]
fn bad_values_are_rejected_on_load() {
    let dir = temp_dir();
    for (body, needle) in [
        ("[general]\ntheme = \"purple\"", "unknown variant"),
        (
            "[git]\nbranch_prefix_type = \"custom\"",
            "branch_prefix is required",
        ),
        ("[models]\ndefault = \"  \"", "models.default"),
        (
            "[appearance]\nzoom_level_v2 = 0.4",
            "appearance.zoom_level_v2",
        ),
        (
            "[appearance]\nzoom_level_v2 = 1.25",
            "appearance.zoom_level_v2",
        ),
        (
            "[appearance]\nmono_font = \"Fira\\\"; color: red\"",
            "appearance.mono_font",
        ),
        (
            "[appearance]\nterminal_font_family = \"Fira}\"",
            "appearance.terminal_font_family",
        ),
        (
            "[appearance]\nterminal_font_size = 9",
            "appearance.terminal_font_size",
        ),
        (
            "[appearance]\nterminal_font_size = 21",
            "appearance.terminal_font_size",
        ),
        (
            "[providers.claude]\nkind = \"codex_login\"",
            "providers.claude: codex_login is a codex provider",
        ),
        (
            "[providers.claude]\nkind = \"bedrock\"\nregion = \" \"",
            "providers.claude:",
        ),
        ("[providers.codex]\nkind = \"nope\"", "unknown variant"),
        (
            "[providers.reason]\nkind = \"claude_login\"",
            "providers.reason: claude_login is a claude provider",
        ),
        ("not toml [", "failed to parse"),
    ] {
        let path = dir.join(FILE_NAME);
        fs::write(&path, body).unwrap();
        let err = load(&path).unwrap_err().to_string();
        assert!(err.contains(needle), "{body:?}: {err}");
    }
}

#[test]
fn appearance_round_trips_and_defaults_when_missing() {
    let path = temp_dir().join(FILE_NAME);
    fs::write(&path, "[general]\ntheme = \"dark\"").unwrap();
    assert_eq!(load(&path).unwrap().appearance, Appearance::default());
    let mut s = Settings::default();
    s.appearance.zoom_level_v2 = 1.1;
    s.appearance.low_contrast_dark_mode = true;
    s.appearance.mono_font = Some("iA Writer Mono".into());
    s.appearance.terminal_font_family = Some("FiraCode Nerd Font".into());
    s.appearance.terminal_font_size = 15;
    save(&path, &s).unwrap();
    assert_eq!(load(&path).unwrap().appearance, s.appearance);
    for zoom in [0.5, 0.7, 3.0] {
        s.appearance.zoom_level_v2 = zoom;
        save(&path, &s).unwrap();
    }
}

#[test]
fn invalid_settings_are_not_written() {
    let path = temp_dir().join(FILE_NAME);
    save(&path, &Settings::default()).unwrap();
    let before = fs::read_to_string(&path).unwrap();
    let mut s = Settings::default();
    s.git.branch_prefix_type = BranchPrefixType::Custom;
    for bad in ["", "a..b", "-x", "a b", "x.lock", "a//", "/"] {
        s.git.branch_prefix = Some(bad.into());
        assert!(save(&path, &s).is_err(), "{bad:?} accepted");
    }
    assert_eq!(fs::read_to_string(&path).unwrap(), before);
    s.git.branch_prefix = Some("team/sven".into());
    save(&path, &s).unwrap();
}

#[test]
fn provider_configs_round_trip_per_agent() {
    let path = temp_dir().join(FILE_NAME);
    let mut s = Settings::default();
    let foundry: ProviderConfig =
        serde_json::from_str(r#"{"kind":"foundry","endpoint":{"resource":"r"}}"#).unwrap();
    let gateway: ProviderConfig =
        serde_json::from_str(r#"{"kind":"codex_gateway","gateway":"open_router"}"#).unwrap();
    s.providers.set(AgentKind::Claude, Some(foundry.clone()));
    s.providers.set(AgentKind::Codex, Some(gateway.clone()));
    save(&path, &s).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(text.contains("[providers.claude]"), "{text}");
    assert!(text.contains("kind = \"codex_gateway\""), "{text}");
    let back = load(&path).unwrap();
    assert_eq!(back.providers.get(AgentKind::Claude), Some(&foundry));
    assert_eq!(back.providers.get(AgentKind::Codex), Some(&gateway));
    assert_eq!(back.providers.get(AgentKind::Cursor), None);
    s.providers.set(AgentKind::Claude, None);
    save(&path, &s).unwrap();
    assert!(!fs::read_to_string(&path)
        .unwrap()
        .contains("[providers.claude]"));
}

#[test]
fn git_flags_use_conductor_defaults_and_round_trip() {
    let path = temp_dir().join(FILE_NAME);
    fs::write(&path, "[git]\nbranch_prefix_type = \"none\"").unwrap();
    let git = load(&path).unwrap().git;
    assert!(
        !git.delete_branch_on_archive
            && !git.archive_on_merge
            && git.worktree_push_auto_setup_remote
    );
    let mut s = Settings::default();
    s.git.delete_branch_on_archive = true;
    s.git.archive_on_merge = true;
    s.git.worktree_push_auto_setup_remote = false;
    save(&path, &s).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(
        text.contains("worktree_push_auto_setup_remote = false"),
        "{text}"
    );
    assert_eq!(load(&path).unwrap().git, s.git);
}

#[test]
fn scrollback_limit_is_optional_and_round_trips_in_advanced() {
    let path = temp_dir().join(FILE_NAME);
    fs::write(&path, "[general]\ntheme = \"dark\"").unwrap();
    assert_eq!(load(&path).unwrap().advanced, Advanced::default());
    let mut s = Settings::default();
    save(&path, &s).unwrap();
    assert!(!fs::read_to_string(&path)
        .unwrap()
        .contains("terminal_scrollback_limit_bytes"));
    s.advanced.terminal_scrollback_limit_bytes = Some(25_000_000);
    save(&path, &s).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(
        text.contains("[advanced]\nterminal_scrollback_limit_bytes = 25000000"),
        "{text}"
    );
    assert_eq!(load(&path).unwrap().advanced, s.advanced);
}

#[test]
fn big_terminal_settings_are_optional_and_round_trip() {
    let path = temp_dir().join(FILE_NAME);
    fs::write(&path, "[general]\ntheme = \"dark\"").unwrap();
    let loaded = load(&path).unwrap();
    assert_eq!(loaded.experimental, Experimental::default());
    assert_eq!(loaded.terminal, Terminal::default());
    let mut s = Settings::default();
    save(&path, &s).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(!text.contains("big_terminal_preset"), "{text}");
    assert!(!text.contains("big_terminal_custom_commands"), "{text}");
    s.experimental.experimental_big_terminal_mode = true;
    s.terminal.big_terminal_preset = Some("custom:a1".into());
    s.terminal.big_terminal_custom_commands = vec![
        BigTerminalCustomCommand {
            id: "a1".into(),
            command: "my-agent --flag".into(),
        },
        BigTerminalCustomCommand {
            id: "b2".into(),
            command: String::new(),
        },
    ];
    save(&path, &s).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(
        text.contains("[experimental]\nexperimental_big_terminal_mode = true"),
        "{text}"
    );
    assert!(
        text.contains("big_terminal_preset = \"custom:a1\""),
        "{text}"
    );
    let back = load(&path).unwrap();
    assert_eq!(back.experimental, s.experimental);
    assert_eq!(back.terminal, s.terminal);
}

#[test]
fn branch_prefix_reads_the_old_name_and_saves_conductors() {
    let path = temp_dir().join(FILE_NAME);
    fs::write(
        &path,
        "[git]\nbranch_prefix_type = \"custom\"\nbranch_prefix_custom = \"old-\"\n",
    )
    .unwrap();
    let s = load(&path).unwrap();
    assert_eq!(s.git.branch_prefix.as_deref(), Some("old-"));
    assert!(!s.git.extra.contains_key("branch_prefix_custom"));
    save(&path, &s).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(text.contains("branch_prefix = \"old-\""), "{text}");
    assert!(!text.contains("branch_prefix_custom"), "{text}");

    fs::write(
        &path,
        "[git]\nbranch_prefix_type = \"custom\"\nbranch_prefix = \"new/\"\nbranch_prefix_custom = \"old-\"\n",
    )
    .unwrap();
    assert_eq!(
        load(&path).unwrap().git.branch_prefix.as_deref(),
        Some("new/")
    );
}

#[test]
fn prompts_preview_urls_and_env_files_round_trip() {
    let path = temp_dir().join(FILE_NAME);
    let mut s = Settings::default();
    s.prompts.general = Some("Use pnpm.".into());
    s.prompts.resolve_merge_conflicts = Some("Prefer rebase.".into());
    s.preview_urls = vec![
        PreviewUrl {
            name: Some("App".into()),
            url: "http://localhost:$CONDUCTOR_PORT".into(),
        },
        PreviewUrl {
            name: None,
            url: "http://localhost:$((CONDUCTOR_PORT + 1))".into(),
        },
    ];
    s.environment_variable_files = vec!["~/.env".into(), ".env.local".into()];
    save(&path, &s).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(
        text.contains("[prompts]") && text.contains("general = \"Use pnpm.\""),
        "{text}"
    );
    assert!(text.contains("environment_variable_files = ["), "{text}");
    let back = load(&path).unwrap();
    assert_eq!(back, s);
    let defaults = toml::to_string_pretty(&Settings::default()).unwrap();
    assert!(!defaults.contains("preview_urls") && !defaults.contains("environment_variable_files"));
}

#[test]
fn bad_preview_urls_are_rejected() {
    let path = temp_dir().join(FILE_NAME);
    fs::write(&path, "preview_urls = [{ name = 3, url = \"x\" }]\n").unwrap();
    assert!(load(&path).is_err());
    let mut s = Settings {
        preview_urls: vec![PreviewUrl {
            name: None,
            url: "  ".into(),
        }],
        ..Settings::default()
    };
    assert!(matches!(save(&path, &s), Err(SettingsError::Invalid(_))));
    s.preview_urls.clear();
    s.environment_variable_files = vec![" ".into()];
    assert!(matches!(save(&path, &s), Err(SettingsError::Invalid(_))));
}

#[test]
fn diff_appearance_settings_default_and_round_trip() {
    let path = temp_dir().join(FILE_NAME);
    fs::write(&path, "[appearance]\nzoom_level_v2 = 1.0").unwrap();
    let loaded = load(&path).unwrap();
    assert!(loaded.appearance.file_ligatures_enabled);
    assert_eq!(loaded.appearance.color_vision, ColorVision::Default);
    assert_eq!(loaded.appearance.code_theme, CodeTheme::Default);

    let mut s = Settings::default();
    s.appearance.file_ligatures_enabled = false;
    s.appearance.color_vision = ColorVision::ProtanopiaDeuteranopia;
    s.appearance.code_theme = CodeTheme::TokyoNight;
    save(&path, &s).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(text.contains("file_ligatures_enabled = false"), "{text}");
    assert!(
        text.contains("color_vision = \"protanopia-deuteranopia\""),
        "{text}"
    );
    assert!(text.contains("code_theme = \"tokyo-night\""), "{text}");
    assert_eq!(load(&path).unwrap().appearance, s.appearance);

    fs::write(&path, "[appearance]\ncode_theme = \"neon\"").unwrap();
    let err = load(&path).unwrap_err().to_string();
    assert!(err.contains("unknown variant"), "{err}");
}

#[test]
fn reason_settings_round_trip_and_reject_flag_like_values() {
    let s: Settings = toml::from_str(
        "reason_executable_path = \"/opt/reason\"\n[reason]\nworkspace = \"reason-tests\"\nmodel = \"byok:anthropic:claude-opus-5-5\"\nreasoning_effort = \"high\"\n",
    )
    .unwrap();
    assert_eq!(s.reason.workspace.as_deref(), Some("reason-tests"));
    assert_eq!(
        s.executable(AgentKind::Reason),
        std::path::PathBuf::from("/opt/reason")
    );
    assert!(validate(&s).is_ok());
    let back: Settings = toml::from_str(&toml::to_string(&s).unwrap()).unwrap();
    assert_eq!(back, s);
    let mut bad = s.clone();
    bad.reason.workspace = Some("--evil".into());
    assert!(validate(&bad).is_err());
}
