use super::*;
use std::process::Command;

fn toml(layer: Layer, text: &str) -> LayerSource {
    LayerSource::from_toml(layer, format!("{layer:?}.toml"), text).unwrap()
}

fn json(layer: Layer, text: &str) -> LayerSource {
    LayerSource::from_json(layer, format!("{layer:?}.json"), text).unwrap()
}

const SKILL_EXAMPLE: &str = r#"
"$schema" = "https://conductor.build/schemas/settings.repo.schema.json"

[scripts]
setup = "pnpm install"
run_mode = "concurrent"

[scripts.run.dev]
available_in = [ "local" ]
command = "pnpm dev --port $CONDUCTOR_PORT"
default = true
icon = "play"

[scripts.run.test]
command = "pnpm test:watch"
icon = "test-tube"
"#;

#[test]
fn parses_reference_example() {
    let r = resolve(&[toml(Layer::RepoShared, SKILL_EXAMPLE)]);
    assert_eq!(
        r.setup,
        Some(Sourced {
            value: "pnpm install".into(),
            layer: Layer::RepoShared
        })
    );
    assert_eq!(r.run_mode, RunMode::Concurrent);
    assert_eq!(
        r.run.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
        ["dev", "test"]
    );
    let dev = &r.run[0];
    assert_eq!(dev.command, "pnpm dev --port $CONDUCTOR_PORT");
    assert!(dev.default);
    assert!(dev.is_available_in(Location::Local));
    assert!(!dev.is_available_in(Location::Cloud));
    assert_eq!(r.run[1].icon, "test-tube");
    assert!(r.run[1].available_in.is_none());
    assert!(r.warnings.is_empty(), "{:?}", r.warnings);
}

#[test]
fn available_in_filters_and_default_selection() {
    let r = resolve(&[toml(Layer::RepoShared, SKILL_EXAMPLE)]);
    let cloud: Vec<_> = r
        .run_scripts_for(Location::Cloud)
        .iter()
        .map(|s| s.id.clone())
        .collect();
    assert_eq!(cloud, ["test"]);
    assert_eq!(r.default_run_script(Location::Local).unwrap().id, "dev");
    // Default script not available in cloud: fall back to the first available one.
    assert_eq!(r.default_run_script(Location::Cloud).unwrap().id, "test");
    assert!(resolve(&[]).default_run_script(Location::Local).is_none());
}

#[test]
fn precedence_managed_local_shared_user_defaults() {
    let user = toml(
        Layer::User,
        "[scripts]\nsetup = \"user\"\narchive = \"user-archive\"\nrun_mode = \"nonconcurrent\"",
    );
    let shared = toml(Layer::RepoShared, "[scripts]\nsetup = \"shared\"");
    let local = toml(Layer::RepoLocal, "[scripts]\nsetup = \"local\"");
    let managed = toml(Layer::Managed, "[scripts]\narchive = \"managed-archive\"");
    // Input order must not matter.
    let r = resolve(&[managed.clone(), local.clone(), user.clone(), shared.clone()]);
    assert_eq!(r.setup.as_ref().unwrap().value, "local");
    assert_eq!(r.setup.as_ref().unwrap().layer, Layer::RepoLocal);
    assert_eq!(r.archive.as_ref().unwrap().value, "managed-archive");
    assert_eq!(r.archive.as_ref().unwrap().layer, Layer::Managed);
    assert_eq!(r.run_mode, RunMode::Nonconcurrent);
    assert!(r.is_managed("scripts.archive"));
    assert!(r.is_managed("scripts"));
    assert!(!r.is_managed("scripts.setup"));
    assert!(!r.is_managed("scripts.arch"));

    let r = resolve(&[user, shared]);
    assert_eq!(r.setup.unwrap().value, "shared");
}

#[test]
fn any_toml_outranks_any_json() {
    let managed_json = json(Layer::Managed, r#"{"scripts":{"setup":"managed-json"}}"#);
    let user_toml = toml(Layer::User, "[scripts]\nsetup = \"user-toml\"");
    let r = resolve(&[managed_json, user_toml]);
    assert_eq!(
        r.setup.unwrap(),
        Sourced {
            value: "user-toml".into(),
            layer: Layer::User
        }
    );
}

#[test]
fn run_scripts_deep_merge_across_layers() {
    let shared = toml(Layer::RepoShared, SKILL_EXAMPLE);
    let local = toml(
        Layer::RepoLocal,
        "[scripts.run.dev]\ncommand = \"pnpm dev:local --port $CONDUCTOR_PORT\"\n[scripts.run.storybook]\ncommand = \"pnpm storybook\"",
    );
    let r = resolve(&[shared, local]);
    let ids: Vec<_> = r.run.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["dev", "test", "storybook"]);
    let dev = &r.run[0];
    assert_eq!(dev.command, "pnpm dev:local --port $CONDUCTOR_PORT");
    // Keys not overridden survive from the shared layer.
    assert!(dev.default);
    assert!(!dev.is_available_in(Location::Cloud));
    assert_eq!(dev.layer, Layer::RepoLocal);
    assert_eq!(r.run[1].layer, Layer::RepoShared);
}

#[test]
fn legacy_string_run_is_one_script() {
    let r = resolve(&[toml(Layer::RepoShared, "[scripts]\nrun = \"npm start\"")]);
    assert_eq!(r.run.len(), 1);
    assert_eq!(r.run[0].id, LEGACY_RUN_ID);
    assert_eq!(r.run[0].command, "npm start");
    assert_eq!(r.run[0].icon, DEFAULT_ICON);
    assert!(r.run[0].available_in.is_none());
}

#[test]
fn invalid_values_fall_back_or_warn() {
    let r = resolve(&[toml(
        Layer::RepoShared,
        r#"
[scripts]
setup = "   "
run_mode = "sometimes"
[scripts.run.a]
command = "a"
icon = "TestTube"
[scripts.run.b]
command = ""
[scripts.run.c]
command = "c"
available_in = ["mars"]
[scripts.run.d]
command = "d"
icon = "circle-dot-2"
"#,
    )]);
    assert!(r.setup.is_none());
    assert_eq!(r.run_mode, RunMode::Concurrent);
    assert_eq!(
        r.run.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
        ["a", "d"]
    );
    assert_eq!(r.run[0].icon, "play");
    assert_eq!(r.run[1].icon, "circle-dot-2");
    assert_eq!(r.warnings.len(), 3, "{:?}", r.warnings);
}

#[test]
fn icon_names() {
    for ok in ["play", "test-tube", "circle-dot-2", "x"] {
        assert!(is_kebab_icon_name(ok), "{ok}");
    }
    for bad in ["", "Play", "test_tube", "-play", "play-", "a--b", "test tube"] {
        assert!(!is_kebab_icon_name(bad), "{bad}");
    }
}

#[test]
fn conductor_json_mapping() {
    let l = LayerSource::from_conductor_json(
        "conductor.json",
        r#"{"scripts":{"setup":"npm ci","run":"npm run dev","archive":"rm -rf tmp"},"runScriptMode":"nonconcurrent","enterpriseDataPrivacy":true}"#,
    )
    .unwrap();
    assert_eq!(
        l.table.get("enterprise_data_privacy"),
        Some(&Value::Boolean(true))
    );
    let r = resolve(&[l]);
    assert_eq!(r.setup.unwrap().value, "npm ci");
    assert_eq!(r.archive.unwrap().value, "rm -rf tmp");
    assert_eq!(r.run_mode, RunMode::Nonconcurrent);
    assert_eq!(r.run[0].command, "npm run dev");
}

#[test]
fn parse_errors_name_the_file() {
    let e = LayerSource::from_toml(Layer::User, "/x/settings.toml", "[scripts\n").unwrap_err();
    assert!(e.to_string().contains("/x/settings.toml"), "{e}");
    let e = LayerSource::from_json(Layer::User, "/x/settings.json", "[1]").unwrap_err();
    assert!(e.to_string().contains("not an object"), "{e}");
}

// ---- file loading ----

fn sh(dir: &Path, args: &[&str]) {
    let st = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .status()
        .unwrap();
    assert!(st.success(), "git {args:?}");
}

fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

struct Fixture {
    _tmp: tempfile::TempDir,
    home: PathBuf,
    repo: PathBuf,
}

fn fixture() -> Fixture {
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path().join("home/.conductor");
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&home).unwrap();
    fs::create_dir_all(&repo).unwrap();
    sh(&repo, &["init", "-q", "-b", "main"]);
    sh(&repo, &["config", "user.email", "t@example.invalid"]);
    sh(&repo, &["config", "user.name", "t"]);
    Fixture {
        _tmp: tmp,
        home,
        repo,
    }
}

fn paths(f: &Fixture, shared: SharedSource) -> SettingsPaths {
    SettingsPaths {
        user_dir: f.home.clone(),
        repo_root: f.repo.clone(),
        shared_from: shared,
    }
}

#[test]
fn loads_all_layers_from_disk() {
    let f = fixture();
    write(
        &f.home.join("settings.toml"),
        "[scripts]\nsetup = \"user\"\narchive = \"user-archive\"",
    );
    write(
        &f.home.join("settings.managed.json"),
        r#"{"scripts":{"run_mode":"nonconcurrent"}}"#,
    );
    write(&f.repo.join(".conductor/settings.toml"), SKILL_EXAMPLE);
    write(
        &f.repo.join(".conductor/settings.local.toml"),
        "[scripts]\nsetup = \"local\"",
    );
    let r = load(&paths(&f, SharedSource::WorkingTree)).unwrap();
    assert_eq!(r.setup.as_ref().unwrap().value, "local");
    assert_eq!(r.archive.as_ref().unwrap().value, "user-archive");
    // Managed JSON is outranked by the shared TOML, which sets run_mode.
    assert_eq!(r.run_mode, RunMode::Concurrent);
    assert!(r.is_managed("scripts.run_mode"));
    assert_eq!(r.run.len(), 2);
}

#[test]
fn shared_settings_come_from_git_ref_not_working_tree() {
    let f = fixture();
    write(
        &f.repo.join(".conductor/settings.toml"),
        "[scripts]\nsetup = \"committed\"",
    );
    sh(&f.repo, &["add", "-A"]);
    sh(&f.repo, &["commit", "-qm", "settings"]);
    // Unmerged local edit: not in effect until it is on the default branch.
    write(
        &f.repo.join(".conductor/settings.toml"),
        "[scripts]\nsetup = \"edited\"",
    );
    let r = load(&paths(&f, SharedSource::GitRef("main".into()))).unwrap();
    assert_eq!(r.setup.unwrap().value, "committed");
    let r = load(&paths(&f, SharedSource::WorkingTree)).unwrap();
    assert_eq!(r.setup.unwrap().value, "edited");
}

#[test]
fn missing_ref_falls_back_with_warning() {
    let f = fixture();
    write(
        &f.repo.join(".conductor/settings.toml"),
        "[scripts]\nsetup = \"wt\"",
    );
    let r = load(&paths(&f, SharedSource::GitRef("origin/main".into()))).unwrap();
    assert_eq!(r.setup.unwrap().value, "wt");
    assert_eq!(r.warnings.len(), 1, "{:?}", r.warnings);
}

#[test]
fn conductor_json_only_without_settings_toml() {
    let f = fixture();
    write(
        &f.repo.join("conductor.json"),
        r#"{"scripts":{"setup":"from-json"}}"#,
    );
    let p = paths(&f, SharedSource::WorkingTree);
    assert_eq!(load(&p).unwrap().setup.unwrap().value, "from-json");
    write(
        &f.repo.join(".conductor/settings.toml"),
        "[scripts.run.dev]\ncommand = \"dev\"",
    );
    let r = load(&p).unwrap();
    assert!(
        r.setup.is_none(),
        "conductor.json must be ignored once settings.toml exists"
    );
    assert_eq!(r.run[0].id, "dev");
}

#[test]
fn broken_file_is_an_error() {
    let f = fixture();
    write(&f.repo.join(".conductor/settings.local.toml"), "scripts = [");
    let e = load(&paths(&f, SharedSource::WorkingTree)).unwrap_err();
    assert!(matches!(e, ConfigError::Parse { .. }), "{e}");
}
