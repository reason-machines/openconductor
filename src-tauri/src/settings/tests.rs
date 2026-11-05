use super::*;
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
branch_prefix_custom = "sven"
future_git = "kept"
[models]
default = "sonnet"
review = "opus"
[models.codex]
default_thinking_level = "high"
review_thinking_level = "xhigh"
[providers]
claude_provider = "bedrock"
bedrock_region = "eu-west-1"
"#,
    )
    .unwrap();
    let mut s = load(&path).unwrap();
    assert_eq!(s.git.branch_prefix_custom.as_deref(), Some("sven"));
    assert_eq!(s.models.codex.default_thinking_level, ThinkingLevel::High);
    assert_eq!(s.providers.claude_provider, ClaudeProvider::Bedrock);
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
        "[git]",
        "[models]",
        "[models.codex]",
        "[providers]",
    ] {
        assert!(text.contains(section), "missing {section}: {text}");
    }
}
