use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use oc_scripts::config::{load_effective, EffectivePaths, EnvContext};

fn write(path: &Path, body: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, body).unwrap();
}

fn fixture_paths(temp: &tempfile::TempDir) -> EffectivePaths {
    let home = temp.path().join("home");
    let root = temp.path().join("repo");
    let workspace = temp.path().join("workspace");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&workspace).unwrap();
    EffectivePaths {
        user_dir: home.join(".openconductor"),
        home,
        repo_root: root,
        workspace: Some(workspace),
    }
}

fn terminal_settings_map(paths: &EffectivePaths) -> BTreeMap<String, String> {
    load_effective(paths)
        .unwrap()
        .env
        .vars_with_stored(EnvContext::Local, std::iter::empty::<(&str, &str)>())
}

#[test]
fn json_only_managed_local_values_reach_terminal_settings_map() {
    let temp = tempfile::tempdir().unwrap();
    let paths = fixture_paths(&temp);
    write(
        &paths.user_dir.join("settings.managed.json"),
        r#"{"environment_variables":{"local":{"OC_MANAGED_64_ONLY":"json-local"},"cloud":{"OC_MANAGED_64_CLOUD":"json-cloud"}}}"#,
    );
    let vars = terminal_settings_map(&paths);
    assert_eq!(
        vars.get("OC_MANAGED_64_ONLY").map(String::as_str),
        Some("json-local"),
        "JSON-only managed local value at the terminal settings-map boundary"
    );
    assert!(!vars.contains_key("OC_MANAGED_64_CLOUD"));
}

#[test]
fn managed_toml_selects_one_file_without_json_only_key_leakage() {
    let temp = tempfile::tempdir().unwrap();
    let paths = fixture_paths(&temp);
    write(
        &paths.user_dir.join("settings.managed.json"),
        r#"{"environment_variables":{"local":{"OC_MANAGED_64_COMMON":"json","OC_MANAGED_64_JSON_ONLY":"ignore-json"}}}"#,
    );
    write(
        &paths.user_dir.join("settings.managed.toml"),
        "[environment_variables.local]\nOC_MANAGED_64_COMMON = \"toml\"\nOC_MANAGED_64_TOML_ONLY = \"toml-only\"\n",
    );
    let vars = terminal_settings_map(&paths);
    assert_eq!(vars.get("OC_MANAGED_64_COMMON").map(String::as_str), Some("toml"));
    assert_eq!(vars.get("OC_MANAGED_64_TOML_ONLY").map(String::as_str), Some("toml-only"));
    assert!(!vars.contains_key("OC_MANAGED_64_JSON_ONLY"));
}

#[test]
fn no_managed_file_adds_no_terminal_settings_variables() {
    let temp = tempfile::tempdir().unwrap();
    let paths = fixture_paths(&temp);
    assert!(terminal_settings_map(&paths).is_empty());
}
