//! The `spotlight_testing` setting: layers, the local file, and the toggle.

use super::setting::*;
use oc_scripts::config::{Layer, LayerSource, SettingsPaths, SharedSource, SETTINGS_DIR};
use openconductor_db::{open_in_memory, repos, workspaces, SqlitePool};
use std::cell::RefCell;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

struct Dirs {
    base: PathBuf,
    user: PathBuf,
    root: PathBuf,
}

impl Drop for Dirs {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

fn dirs() -> Dirs {
    static N: AtomicU64 = AtomicU64::new(0);
    let base = std::env::temp_dir().join(format!(
        "oc-spotlight-setting-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    let user = base.join("home").join(SETTINGS_DIR);
    let root = base.join("root");
    fs::create_dir_all(&user).unwrap();
    fs::create_dir_all(&root).unwrap();
    Dirs { base, user, root }
}

fn paths(d: &Dirs) -> SettingsPaths {
    SettingsPaths {
        user_dir: d.user.clone(),
        repo_root: d.root.clone(),
        workspace: None,
        shared_from: SharedSource::WorkingTree,
    }
}

fn layer(layer: Layer, toml: &str) -> LayerSource {
    LayerSource::from_toml(layer, "test", toml).unwrap()
}

fn local_file(root: &Path) -> PathBuf {
    root.join(SETTINGS_DIR).join(LOCAL_FILE)
}

#[test]
fn unset_means_off() {
    let s = effective(&[layer(Layer::User, "other = 1")]);
    assert_eq!(
        s,
        SpotlightTesting {
            enabled: false,
            layer: None,
            managed: false
        }
    );
}

#[test]
fn repo_local_outranks_user_and_shared() {
    let s = effective(&[
        layer(Layer::RepoLocal, "spotlight_testing = true"),
        layer(Layer::User, "spotlight_testing = false"),
        layer(Layer::RepoShared, "spotlight_testing = false"),
    ]);
    assert_eq!((s.enabled, s.layer), (true, Some(Layer::RepoLocal)));
    assert!(!s.managed);
}

#[test]
fn managed_wins_and_is_reported() {
    let s = effective(&[
        layer(Layer::RepoLocal, "spotlight_testing = true"),
        layer(Layer::Managed, "spotlight_testing = false"),
    ]);
    assert_eq!(
        (s.enabled, s.layer, s.managed),
        (false, Some(Layer::Managed), true)
    );
}

#[test]
fn string_values_are_read_and_others_ignored() {
    let s = effective(&[layer(Layer::User, "spotlight_testing = \"true\"")]);
    assert_eq!((s.enabled, s.layer), (true, Some(Layer::User)));
    let s = effective(&[layer(Layer::User, "spotlight_testing = 1")]);
    assert_eq!(s.layer, None);
}

#[test]
fn write_local_creates_the_file_and_keeps_other_keys() {
    let d = dirs();
    write_local(&d.root, true).unwrap();
    assert_eq!(read(&paths(&d)).unwrap().layer, Some(Layer::RepoLocal));
    fs::write(
        local_file(&d.root),
        "spotlight_testing = true\n\n[scripts]\nrun = \"npm start\"\n",
    )
    .unwrap();
    write_local(&d.root, false).unwrap();
    let table: toml::Table = fs::read_to_string(local_file(&d.root))
        .unwrap()
        .parse()
        .unwrap();
    assert_eq!(table["spotlight_testing"].as_bool(), Some(false));
    assert_eq!(table["scripts"]["run"].as_str(), Some("npm start"));
    let leftovers: Vec<_> = fs::read_dir(d.root.join(SETTINGS_DIR))
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(leftovers, vec![std::ffi::OsString::from(LOCAL_FILE)]);
}

#[test]
fn write_local_leaves_a_broken_file_alone() {
    let d = dirs();
    fs::create_dir_all(d.root.join(SETTINGS_DIR)).unwrap();
    fs::write(local_file(&d.root), "not = [toml").unwrap();
    assert!(write_local(&d.root, true)
        .unwrap_err()
        .contains("could not parse"));
    assert_eq!(
        fs::read_to_string(local_file(&d.root)).unwrap(),
        "not = [toml"
    );
}

async fn add_repo(pool: &SqlitePool, id: &str, root: &Path) {
    repos::insert(
        pool,
        &repos::NewRepo {
            id: id.into(),
            name: id.into(),
            root_path: root.display().to_string(),
            ..Default::default()
        },
    )
    .await
    .unwrap();
}

async fn add_workspace(pool: &SqlitePool, local_id: &str, repo_id: &str) {
    workspaces::insert(
        pool,
        &workspaces::NewWorkspace {
            local_id: local_id.into(),
            repository_id: repo_id.into(),
            directory_name: local_id.into(),
            workspace_name: None,
            branch: format!("b-{local_id}"),
            placeholder_branch_name: None,
            state: workspaces::WorkspaceState::Ready,
            initialization_parent_branch: None,
            intended_target_branch: None,
            workspace_path: None,
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn toggle_writes_then_stops_the_repository_runs_and_spotlight() {
    let d = dirs();
    let pool = open_in_memory().await.unwrap();
    add_repo(&pool, "r1", &d.root).await;
    add_repo(&pool, "r2", &d.base.join("other")).await;
    add_workspace(&pool, "w1", "r1").await;
    add_workspace(&pool, "w2", "r1").await;
    add_workspace(&pool, "w3", "r2").await;

    let t = target(&pool, "r1", d.user.clone()).await.unwrap();
    assert_eq!(t.root, d.root);
    let mut ids = t.workspace_ids.clone();
    ids.sort();
    assert_eq!(ids, ["w1", "w2"]);

    let asked = RefCell::new(Vec::new());
    let change = apply(
        &t,
        true,
        |id| {
            // The file is already written when runs are stopped.
            assert!(local_file(&d.root).exists());
            asked.borrow_mut().push(id.to_string());
            id == "w2"
        },
        |root| {
            assert_eq!(root, d.root);
            true
        },
    )
    .unwrap();
    let mut asked = asked.into_inner();
    asked.sort();
    assert_eq!(asked, ["w1", "w2"]);
    assert_eq!(change.stopped_workspaces, ["w2"]);
    assert!(change.spotlight_stopped);
    assert_eq!(
        change.setting,
        SpotlightTesting {
            enabled: true,
            layer: Some(Layer::RepoLocal),
            managed: false
        }
    );

    let off = apply(&t, false, |_| false, |_| false).unwrap();
    assert!(!off.setting.enabled);
    assert!(off.stopped_workspaces.is_empty());
}

#[tokio::test]
async fn toggle_is_refused_when_managed_settings_set_it() {
    let d = dirs();
    fs::write(
        d.user.join("settings.managed.toml"),
        "spotlight_testing = false\n",
    )
    .unwrap();
    let pool = open_in_memory().await.unwrap();
    add_repo(&pool, "r1", &d.root).await;
    add_workspace(&pool, "w1", "r1").await;
    let t = target(&pool, "r1", d.user.clone()).await.unwrap();
    let err = apply(
        &t,
        true,
        |_| panic!("no runs stopped"),
        |_| panic!("no stop"),
    )
    .unwrap_err();
    assert!(err.contains("managed"));
    assert!(!local_file(&d.root).exists());
}

#[tokio::test]
async fn unknown_repository_is_an_error() {
    let pool = open_in_memory().await.unwrap();
    let err = target(&pool, "nope", PathBuf::from("/x"))
        .await
        .unwrap_err();
    assert!(err.contains("not found"));
}
