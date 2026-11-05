//! The one-time move of `repos.spotlight_testing` into the local settings file.

use super::migrate::*;
use super::setting::{KEY, LOCAL_FILE};
use oc_scripts::config::SETTINGS_DIR;
use openconductor_db::repos::{self, NewRepo};
use openconductor_db::{app_settings, open_in_memory, SqlitePool};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

struct Base(PathBuf);

impl Drop for Base {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn base() -> Base {
    static N: AtomicU64 = AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "oc-spotlight-migrate-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&dir).unwrap();
    Base(dir)
}

fn local_file(root: &Path) -> PathBuf {
    root.join(SETTINGS_DIR).join(LOCAL_FILE)
}

/// A repository at `root` whose legacy column is `legacy`.
async fn repo(pool: &SqlitePool, id: &str, root: &Path, legacy: Option<bool>) {
    repos::insert(
        pool,
        &NewRepo {
            id: id.into(),
            name: id.into(),
            root_path: root.to_string_lossy().into_owned(),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let mut s = repos::settings(pool, id).await.unwrap();
    s.spotlight_testing = legacy;
    s.file_include_globs = Some("[\".env\"]".into());
    repos::update_settings(pool, id, &s).await.unwrap();
}

async fn column(pool: &SqlitePool, id: &str) -> Option<bool> {
    repos::settings(pool, id).await.unwrap().spotlight_testing
}

fn file_value(root: &Path) -> Option<toml::Value> {
    let text = fs::read_to_string(local_file(root)).ok()?;
    text.parse::<toml::Table>().unwrap().get(KEY).cloned()
}

#[tokio::test]
async fn on_moves_to_the_local_file_and_clears_the_column_once() {
    let b = base();
    let root = b.0.join("on");
    fs::create_dir_all(root.join(SETTINGS_DIR)).unwrap();
    fs::write(local_file(&root), "other = \"kept\"\n").unwrap();
    let pool = open_in_memory().await.unwrap();
    repo(&pool, "on", &root, Some(true)).await;

    let report = run(&pool).await.unwrap();
    assert_eq!(report.written, vec!["on".to_string()]);
    assert!(report.failed.is_empty());
    assert_eq!(file_value(&root), Some(toml::Value::Boolean(true)));
    let text = fs::read_to_string(local_file(&root)).unwrap();
    assert!(text.contains("other = \"kept\""), "{text}");
    assert_eq!(column(&pool, "on").await, None);
    // file_include_globs moves in the reference's pass; ours keeps it.
    assert_eq!(
        repos::settings(&pool, "on")
            .await
            .unwrap()
            .file_include_globs
            .as_deref(),
        Some("[\".env\"]")
    );
    assert_eq!(
        app_settings::get(&pool, DONE_KEY).await.unwrap().as_deref(),
        Some("true")
    );

    // A second launch looks at nothing, even if the column comes back.
    let mut s = repos::settings(&pool, "on").await.unwrap();
    s.spotlight_testing = Some(true);
    repos::update_settings(&pool, "on", &s).await.unwrap();
    fs::remove_file(local_file(&root)).unwrap();
    let again = run(&pool).await.unwrap();
    assert!(again.already_done);
    assert_eq!(file_value(&root), None);
}

#[tokio::test]
async fn off_and_null_are_left_alone() {
    let b = base();
    let pool = open_in_memory().await.unwrap();
    for (id, legacy) in [("off", Some(false)), ("null", None)] {
        let root = b.0.join(id);
        fs::create_dir_all(&root).unwrap();
        repo(&pool, id, &root, legacy).await;
    }
    let report = run(&pool).await.unwrap();
    assert!(report.written.is_empty() && report.kept_file.is_empty());
    assert_eq!(column(&pool, "off").await, Some(false));
    assert_eq!(column(&pool, "null").await, None);
    assert!(!local_file(&b.0.join("off")).exists());
    assert!(app_settings::get(&pool, DONE_KEY).await.unwrap().is_some());
}

#[tokio::test]
async fn a_local_file_that_sets_the_key_wins() {
    let b = base();
    let root = b.0.join("set");
    fs::create_dir_all(root.join(SETTINGS_DIR)).unwrap();
    fs::write(local_file(&root), "spotlight_testing = false\n").unwrap();
    let pool = open_in_memory().await.unwrap();
    repo(&pool, "set", &root, Some(true)).await;

    let report = run(&pool).await.unwrap();
    assert_eq!(report.kept_file, vec!["set".to_string()]);
    assert_eq!(file_value(&root), Some(toml::Value::Boolean(false)));
    assert_eq!(column(&pool, "set").await, None);
}

#[tokio::test]
async fn a_failed_repository_keeps_its_column_and_is_retried() {
    let b = base();
    let gone = b.0.join("gone");
    let ok = b.0.join("ok");
    fs::create_dir_all(&ok).unwrap();
    let pool = open_in_memory().await.unwrap();
    repo(&pool, "gone", &gone, Some(true)).await;
    repo(&pool, "ok", &ok, Some(true)).await;

    let report = run(&pool).await.unwrap();
    assert_eq!(report.written, vec!["ok".to_string()]);
    assert_eq!(report.failed.len(), 1);
    assert_eq!(report.failed[0].0, "gone");
    assert!(
        !gone.exists(),
        "no settings dir is created at a missing root"
    );
    assert_eq!(column(&pool, "gone").await, Some(true));
    assert_eq!(app_settings::get(&pool, DONE_KEY).await.unwrap(), None);

    fs::create_dir_all(&gone).unwrap();
    let retry = run(&pool).await.unwrap();
    assert_eq!(retry.written, vec!["gone".to_string()]);
    assert_eq!(file_value(&gone), Some(toml::Value::Boolean(true)));
    assert_eq!(
        app_settings::get(&pool, DONE_KEY).await.unwrap().as_deref(),
        Some("true")
    );
}

#[tokio::test]
async fn an_unparsable_local_file_is_left_alone_and_retried() {
    let b = base();
    let root = b.0.join("bad");
    fs::create_dir_all(root.join(SETTINGS_DIR)).unwrap();
    fs::write(local_file(&root), "not = [toml\n").unwrap();
    let pool = open_in_memory().await.unwrap();
    repo(&pool, "bad", &root, Some(true)).await;

    let report = run(&pool).await.unwrap();
    assert_eq!(report.failed.len(), 1);
    assert_eq!(
        fs::read_to_string(local_file(&root)).unwrap(),
        "not = [toml\n"
    );
    assert_eq!(column(&pool, "bad").await, Some(true));
}
