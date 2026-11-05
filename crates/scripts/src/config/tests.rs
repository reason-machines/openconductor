use std::fs;
use std::path::Path;
use std::process::Command;

use super::*;

fn toml(layer: Layer, text: &str) -> LayerSource {
    LayerSource::from_toml(layer, format!("{layer:?}.toml"), text).unwrap()
}

#[test]
fn higher_layers_win_and_tables_merge() {
    let r = resolve(&[
        toml(Layer::Managed, "[scripts]\narchive = \"managed\"\n"),
        toml(
            Layer::User,
            "[scripts]\nsetup = \"user\"\nrun_mode = \"nonconcurrent\"\n",
        ),
        toml(Layer::RepoShared, "[scripts]\nsetup = \"shared\"\n"),
        toml(
            Layer::RepoLocal,
            "[scripts]\nsetup = \"local\"\nauto_run_after_setup = true\n",
        ),
    ]);
    assert_eq!(
        r.setup,
        Some(Sourced {
            value: "local".into(),
            layer: Layer::RepoLocal
        })
    );
    assert_eq!(r.archive.as_ref().map(|s| s.layer), Some(Layer::Managed));
    assert_eq!(r.run_mode, RunMode::Nonconcurrent);
    assert!(r.auto_run_after_setup);
    assert!(
        r.is_managed("scripts.archive")
            && r.is_managed("scripts")
            && !r.is_managed("scripts.setup")
    );
}

#[test]
fn any_toml_outranks_any_json() {
    let json = LayerSource::from_json(Layer::Managed, "m.json", r#"{"scripts":{"setup":"json"}}"#)
        .unwrap();
    let r = resolve(&[json, toml(Layer::User, "[scripts]\nsetup = \"toml\"\n")]);
    assert_eq!(r.setup.unwrap().value, "toml");
}

#[test]
fn conductor_json_maps_legacy_keys() {
    let l = LayerSource::from_conductor_json(
        Layer::RepoShared,
        "conductor.json",
        r#"{"scripts":{"setup":"npm i","run":"npm run dev","archive":"rm -rf tmp"},
            "runScriptMode":"nonconcurrent","enterpriseDataPrivacy":"true"}"#,
    )
    .unwrap();
    assert_eq!(l.format, Format::Json);
    assert_eq!(l.table["enterprise_data_privacy"], Value::Boolean(true));
    let r = resolve(&[l]);
    assert_eq!(r.setup.unwrap().value, "npm i");
    assert_eq!(r.archive.unwrap().value, "rm -rf tmp");
    assert_eq!(r.run, Some(Value::String("npm run dev".into())));
    assert_eq!(r.run_mode, RunMode::Nonconcurrent);
}

#[test]
fn bad_values_are_dropped_with_a_warning() {
    let r = resolve(&[toml(
        Layer::User,
        "[scripts]\nsetup = 3\narchive = \"  \"\nrun_mode = \"sometimes\"\nauto_run_after_setup = \"yes\"\n",
    )]);
    assert_eq!(
        (r.setup, r.archive, r.run_mode),
        (None, None, RunMode::Concurrent)
    );
    assert_eq!(r.warnings.len(), 3, "{:?}", r.warnings);
}

#[test]
fn parse_errors_name_the_file() {
    let err = LayerSource::from_toml(Layer::User, "u.toml", "[scripts").unwrap_err();
    assert!(err.to_string().contains("u.toml"), "{err}");
}

fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn git(dir: &Path, args: &[&str]) {
    let ok = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args([
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .status()
        .unwrap()
        .success();
    assert!(ok, "git {args:?}");
}

#[test]
fn loads_files_and_reads_legacy_json_only_without_settings_toml() {
    let tmp = tempfile::tempdir().unwrap();
    let (home, root, ws) = (
        tmp.path().join("home"),
        tmp.path().join("root"),
        tmp.path().join("ws"),
    );
    write(
        &ws.join("conductor.json"),
        r#"{"scripts":{"setup":"legacy","archive":"legacy-archive"}}"#,
    );
    write(
        &home.join("conductor.json"),
        r#"{"scripts":{"archive":"home"}}"#,
    );
    write(
        &root.join(".conductor/settings.local.toml"),
        "[scripts]\nrun_mode = \"nonconcurrent\"\n",
    );
    let paths = SettingsPaths {
        user_dir: home.clone(),
        repo_root: root.clone(),
        workspace: Some(ws),
        shared_from: SharedSource::WorkingTree,
    };
    let r = load(&paths).unwrap();
    assert_eq!(r.setup.unwrap().value, "legacy");
    assert_eq!(
        r.archive.unwrap().value,
        "legacy-archive",
        "workspace conductor.json beats home"
    );
    assert_eq!(r.run_mode, RunMode::Nonconcurrent);

    write(
        &root.join(".conductor/settings.toml"),
        "[scripts]\nsetup = \"shared\"\n",
    );
    let r = load(&paths).unwrap();
    assert_eq!(r.setup.unwrap().value, "shared");
    assert_eq!(r.archive, None);
}

#[test]
fn shared_settings_come_from_the_git_ref() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("root");
    fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "-q", "-b", "main"]);
    write(
        &root.join(".conductor/settings.toml"),
        "[scripts]\nsetup = \"committed\"\n",
    );
    git(&root, &["add", "."]);
    git(&root, &["commit", "-q", "-m", "settings"]);
    write(
        &root.join(".conductor/settings.toml"),
        "[scripts]\nsetup = \"uncommitted\"\n",
    );
    let mut paths = SettingsPaths {
        user_dir: tmp.path().join("home"),
        repo_root: root,
        workspace: None,
        shared_from: SharedSource::GitRef("main".into()),
    };
    assert_eq!(load(&paths).unwrap().setup.unwrap().value, "committed");

    paths.shared_from = SharedSource::GitRef("origin/main".into());
    let r = load(&paths).unwrap();
    assert_eq!(r.setup.unwrap().value, "uncommitted");
    assert_eq!(r.warnings.len(), 1, "{:?}", r.warnings);
}
