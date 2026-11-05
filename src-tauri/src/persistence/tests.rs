use super::*;

fn repo(id: &str) -> KnownRepo {
    KnownRepo {
        id: id.into(),
        name: id.into(),
        root: format!("/src/{id}"),
        default_branch: "main".into(),
    }
}

fn ws(repo: &str, dir: &str) -> KnownWorkspace {
    KnownWorkspace {
        id: format!("{repo}/{dir}"),
        repository_id: repo.into(),
        directory_name: dir.into(),
        branch: dir.into(),
        path: format!("/data/workspaces/{repo}/{dir}"),
        archived: false,
    }
}

async fn pool() -> SqlitePool {
    openconductor_db::open_in_memory().await.unwrap()
}

#[tokio::test]
async fn reopening_deletes_workspaces_left_initializing() {
    let dir = std::env::temp_dir().join(format!("oc-persistence-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("conductor.db");
    let _ = std::fs::remove_file(&file);
    {
        let pool = openconductor_db::open(&file).await.unwrap();
        record_repository(&pool, &repo("app")).await.unwrap();
        begin_workspace(&pool, &ws("app", "lisbon"), Some("main"))
            .await
            .unwrap();
        finish_workspace(&pool, &ws("app", "oslo"), Some("main"), None)
            .await
            .unwrap();
        begin_workspace(&pool, &ws("app", "lima"), None)
            .await
            .unwrap();
        pool.close().await;
    }
    let pool = openconductor_db::open(&file).await.unwrap();
    assert_eq!(delete_incomplete(&pool).await.unwrap(), 2);
    let ids: Vec<_> = list_workspaces(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|w| w.id)
        .collect();
    assert_eq!(ids, ["app/oslo"]);
    assert_eq!(list_repos(&pool).await.unwrap().len(), 1);
    pool.close().await;
    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn create_lifecycle_initializing_then_ready() {
    let pool = pool().await;
    record_repository(&pool, &repo("app")).await.unwrap();
    begin_workspace(&pool, &ws("app", "oslo"), Some("main"))
        .await
        .unwrap();
    assert_eq!(
        list_workspaces(&pool).await.unwrap()[0].state,
        "initializing"
    );
    finish_workspace(&pool, &ws("app", "oslo"), Some("main"), Some("oslo"))
        .await
        .unwrap();
    let rows = list_workspaces(&pool).await.unwrap();
    assert_eq!(rows.len(), 1);
    let w = &rows[0];
    assert_eq!(
        (
            w.state,
            w.branch.as_str(),
            w.placeholder_branch_name.as_deref()
        ),
        ("ready", "oslo", Some("oslo"))
    );
    assert_eq!(
        w.workspace_path.as_deref(),
        Some("/data/workspaces/app/oslo")
    );

    record_rename(&pool, "app/oslo", "sven/fix-login")
        .await
        .unwrap();
    let w = &list_workspaces(&pool).await.unwrap()[0];
    assert_eq!(
        (w.branch.as_str(), w.placeholder_branch_name.as_deref()),
        ("sven/fix-login", None)
    );

    archive(&pool, "app/oslo").await.unwrap();
    assert_eq!(list_workspaces(&pool).await.unwrap()[0].state, "archived");
}

#[tokio::test]
async fn failed_create_leaves_no_row() {
    let pool = pool().await;
    record_repository(&pool, &repo("app")).await.unwrap();
    begin_workspace(&pool, &ws("app", "oslo"), None)
        .await
        .unwrap();
    assert!(abandon_workspace(&pool, "app/oslo").await.unwrap());
    assert!(list_workspaces(&pool).await.unwrap().is_empty());
}

#[tokio::test]
async fn finish_replaces_a_stale_row_with_the_same_id() {
    let pool = pool().await;
    record_repository(&pool, &repo("app")).await.unwrap();
    finish_workspace(&pool, &ws("app", "oslo"), None, None)
        .await
        .unwrap();
    archive(&pool, "app/oslo").await.unwrap();
    finish_workspace(&pool, &ws("app", "oslo"), None, None)
        .await
        .unwrap();
    let rows = list_workspaces(&pool).await.unwrap();
    assert_eq!((rows.len(), rows[0].state), (1, "ready"));
}

#[tokio::test]
async fn record_repository_is_idempotent_and_unhides() {
    let pool = pool().await;
    record_repository(&pool, &repo("a")).await.unwrap();
    record_repository(&pool, &repo("b")).await.unwrap();
    record_repository(&pool, &repo("a")).await.unwrap();
    repos::set_hidden(&pool, "a", true).await.unwrap();
    record_repository(&pool, &repo("a")).await.unwrap();
    let rows = list_repos(&pool).await.unwrap();
    let got: Vec<_> = rows
        .iter()
        .map(|r| (r.id.as_str(), r.display_order, r.hidden))
        .collect();
    assert_eq!(got, [("a", 0, false), ("b", 1, false)]);
    assert_eq!(
        (rows[0].root_path.as_str(), rows[0].default_branch.as_str()),
        ("/src/a", "main")
    );
}

#[tokio::test]
async fn import_adds_unknown_repos_with_worktrees_once() {
    let pool = pool().await;
    let mut archived = ws("app", "lima");
    archived.archived = true;
    assert!(
        import_repository(&pool, &repo("app"), &[ws("app", "oslo"), archived.clone()])
            .await
            .unwrap()
    );
    let mut states: Vec<_> = list_workspaces(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|w| (w.id, w.state))
        .collect();
    states.sort();
    assert_eq!(
        states,
        [
            ("app/lima".to_string(), "archived"),
            ("app/oslo".to_string(), "ready")
        ]
    );

    // Known repo: nothing re-imported (a deleted workspace stays deleted).
    assert!(openconductor_db::workspaces::delete(&pool, "app/oslo")
        .await
        .unwrap());
    assert!(openconductor_db::workspaces::delete(&pool, "app/lima")
        .await
        .unwrap());
    assert!(
        !import_repository(&pool, &repo("app"), &[ws("app", "oslo")])
            .await
            .unwrap()
    );
    assert!(list_workspaces(&pool).await.unwrap().is_empty());
}
