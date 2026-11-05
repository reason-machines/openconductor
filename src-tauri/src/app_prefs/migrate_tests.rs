use std::fs;
use std::path::{Path, PathBuf};

use openconductor_db::{app_settings, repos, SqlitePool};
use toml::Table;

use super::migrate::*;

struct TempDir(PathBuf);
impl TempDir {
    fn new(name: &str) -> TempDir {
        let p = std::env::temp_dir().join(format!(
            "oc-migrate-{name}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        TempDir(p)
    }
}
impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn block<T>(f: impl std::future::Future<Output = T>) -> T {
    tauri::async_runtime::block_on(f)
}

fn read(path: &Path) -> Table {
    fs::read_to_string(path).unwrap().parse().unwrap()
}

fn local_file(root: &Path) -> PathBuf {
    root.join(".conductor").join("settings.local.toml")
}

async fn active(pool: &SqlitePool) -> Vec<String> {
    let mut keys: Vec<String> = app_settings::active(pool)
        .await
        .unwrap()
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    keys.sort();
    keys
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

#[test]
fn file_backed_rows_move_to_the_user_file_once() {
    block(async {
        let dir = TempDir::new("user");
        let file = dir.0.join("settings.toml");
        fs::write(&file, "[models]\ndefault = \"from-file\"\n").unwrap();
        let pool = openconductor_db::open_in_memory().await.unwrap();
        for (k, v) in [
            ("default_model", "from-db"),
            ("default_codex_thinking_level", "high"),
            ("review_codex_thinking_level", "ultra"),
            ("garry_mode", "true"),
        ] {
            app_settings::set(&pool, k, v).await.unwrap();
        }

        let report = file_backed_settings(&pool, &file).await.unwrap();
        assert_eq!(report.written, vec!["default_codex_thinking_level"]);
        let mut kept = report.kept_file.clone();
        kept.sort();
        // The file already sets models.default; "ultra" is not a thinking level.
        assert_eq!(kept, vec!["default_model", "review_codex_thinking_level"]);

        let t = read(&file);
        assert_eq!(
            get_dotted(&t, "models.default").and_then(|v| v.as_str()),
            Some("from-file")
        );
        assert_eq!(
            get_dotted(&t, "models.codex.default_thinking_level").and_then(|v| v.as_str()),
            Some("high")
        );
        assert!(get_dotted(&t, "models.codex.review_thinking_level").is_none());
        // File-backed rows are deprecated; app preferences stay.
        assert_eq!(
            active(&pool).await,
            vec!["file_backed_settings_migration_complete", "garry_mode"]
        );
        let loaded = crate::settings::load(&file).unwrap();
        assert_eq!(loaded.models.default, "from-file");

        app_settings::set(&pool, "default_model", "again")
            .await
            .unwrap();
        assert!(
            file_backed_settings(&pool, &file)
                .await
                .unwrap()
                .already_done
        );
    });
}

#[test]
fn file_backed_flags_are_booleans_and_missing_file_is_created() {
    block(async {
        let dir = TempDir::new("flags");
        let file = dir.0.join("settings.toml");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        app_settings::set(&pool, "delete_branch_on_archive", "true")
            .await
            .unwrap();
        app_settings::set(&pool, "archive_on_merge", "maybe")
            .await
            .unwrap();
        let report = file_backed_settings(&pool, &file).await.unwrap();
        assert_eq!(report.written, vec!["delete_branch_on_archive"]);
        let t = read(&file);
        assert_eq!(
            get_dotted(&t, "git.delete_branch_on_archive").and_then(|v| v.as_bool()),
            Some(true)
        );
        assert!(get_dotted(&t, "git.archive_on_merge").is_none());
    });
}

#[test]
fn an_unreadable_user_file_leaves_the_rows_for_next_launch() {
    block(async {
        let dir = TempDir::new("broken");
        let file = dir.0.join("settings.toml");
        fs::write(&file, "not = [toml").unwrap();
        let pool = openconductor_db::open_in_memory().await.unwrap();
        app_settings::set(&pool, "default_model", "x")
            .await
            .unwrap();
        assert!(file_backed_settings(&pool, &file).await.is_err());
        assert_eq!(active(&pool).await, vec!["default_model"]);
    });
}

#[test]
fn legacy_conductor_json_is_read_like_the_reference() {
    let c = legacy_config(Some(
        r#"{"scripts":{"setup":"make","run":"npm start"},"runScriptMode":"nonconcurrent","enterpriseDataPrivacy":"true"}"#,
    ))
    .unwrap();
    assert_eq!(c.setup.as_deref(), Some("make"));
    assert_eq!(c.run.as_deref(), Some("npm start"));
    assert_eq!(c.archive, None);
    assert_eq!(c.run_mode.as_deref(), Some("nonconcurrent"));
    assert_eq!(c.enterprise_data_privacy, Some(true));
    assert_eq!(
        legacy_config(Some(r#"{"runScriptMode":"sometimes"}"#))
            .unwrap()
            .run_mode,
        None
    );
    assert_eq!(legacy_config(Some("  ")), None);
    assert_eq!(legacy_config(Some("{nope")), None);
}

#[test]
fn repo_config_goes_to_the_local_file_without_overwriting() {
    block(async {
        let root = TempDir::new("repo-config");
        fs::create_dir_all(root.0.join(".conductor")).unwrap();
        fs::write(local_file(&root.0), "[scripts]\nsetup = \"kept\"\n").unwrap();
        let pool = openconductor_db::open_in_memory().await.unwrap();
        add_repo(&pool, "r1", &root.0).await;
        repos::update_settings(
            &pool,
            "r1",
            &repos::RepoSettings {
                setup_script: Some("column-setup".into()),
                run_script: Some("column-run".into()),
                archive_script: Some("column-archive".into()),
                run_script_mode: Some("nonconcurrent".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        repos::set_conductor_config(
            &pool,
            "r1",
            Some(r#"{"scripts":{"run":"json-run"},"enterpriseDataPrivacy":true}"#),
        )
        .await
        .unwrap();

        let report = repo_config_files(&pool).await.unwrap();
        assert_eq!(report.migrated, vec!["r1"]);
        let t = read(&local_file(&root.0));
        let s = |p: &str| {
            get_dotted(&t, p)
                .and_then(|v| v.as_str())
                .map(str::to_string)
        };
        assert_eq!(s("scripts.setup").as_deref(), Some("kept"));
        assert_eq!(s("scripts.run").as_deref(), Some("json-run"));
        assert_eq!(s("scripts.archive").as_deref(), Some("column-archive"));
        assert_eq!(s("scripts.run_mode").as_deref(), Some("nonconcurrent"));
        assert_eq!(
            get_dotted(&t, "enterprise_data_privacy").and_then(|v| v.as_bool()),
            Some(true)
        );
        // The v2 migration leaves the columns alone.
        let cols = repos::settings(&pool, "r1").await.unwrap();
        assert_eq!(cols.setup_script.as_deref(), Some("column-setup"));
        assert_eq!(
            app_settings::get(&pool, REPO_CONFIG_FLAG)
                .await
                .unwrap()
                .as_deref(),
            Some("true")
        );
        assert!(repo_config_files(&pool).await.unwrap().already_done);
    });
}

#[test]
fn repo_prompts_move_and_their_columns_are_cleared() {
    block(async {
        let root = TempDir::new("repo-prompts");
        let pool = openconductor_db::open_in_memory().await.unwrap();
        add_repo(&pool, "r1", &root.0).await;
        repos::update_settings(
            &pool,
            "r1",
            &repos::RepoSettings {
                custom_prompt_general: Some("Be brief.".into()),
                custom_prompt_create_pr: Some("Use the template.".into()),
                setup_script: Some("make".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let report = repo_prompt_files(&pool).await.unwrap();
        assert_eq!(report.migrated, vec!["r1"]);
        let t = read(&local_file(&root.0));
        assert_eq!(
            get_dotted(&t, "prompts.general").and_then(|v| v.as_str()),
            Some("Be brief.")
        );
        assert_eq!(
            get_dotted(&t, "prompts.create_pr").and_then(|v| v.as_str()),
            Some("Use the template.")
        );
        assert!(get_dotted(&t, "prompts.fix_errors").is_none());
        let cols = repos::settings(&pool, "r1").await.unwrap();
        assert_eq!(cols.custom_prompt_general, None);
        assert_eq!(cols.custom_prompt_create_pr, None);
        assert_eq!(cols.setup_script.as_deref(), Some("make"));
    });
}

#[test]
fn a_repo_without_values_is_skipped_and_a_missing_root_is_retried() {
    block(async {
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let root = TempDir::new("empty");
        add_repo(&pool, "empty", &root.0).await;
        let report = repo_prompt_files(&pool).await.unwrap();
        assert!(report.migrated.is_empty() && report.failed.is_empty());
        assert!(!local_file(&root.0).exists());

        let pool = openconductor_db::open_in_memory().await.unwrap();
        let gone = std::env::temp_dir().join("oc-migrate-no-such-root");
        add_repo(&pool, "gone", &gone).await;
        repos::update_settings(
            &pool,
            "gone",
            &repos::RepoSettings {
                custom_prompt_general: Some("x".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let report = repo_prompt_files(&pool).await.unwrap();
        assert_eq!(report.failed.len(), 1);
        assert_eq!(
            app_settings::get(&pool, REPO_PROMPTS_FLAG).await.unwrap(),
            None
        );
        let cols = repos::settings(&pool, "gone").await.unwrap();
        assert_eq!(cols.custom_prompt_general.as_deref(), Some("x"));
    });
}

#[test]
fn dotted_paths() {
    let mut t = Table::new();
    assert!(insert_dotted(&mut t, "a.b.c", toml::Value::Integer(1)));
    assert_eq!(get_dotted(&t, "a.b.c"), Some(&toml::Value::Integer(1)));
    assert!(!insert_dotted(&mut t, "a.b.c.d", toml::Value::Integer(2)));
    assert!(insert_dotted(&mut t, "top", toml::Value::Boolean(true)));
    assert_eq!(get_dotted(&t, "top"), Some(&toml::Value::Boolean(true)));
    assert_eq!(get_dotted(&t, "a.x"), None);
}
