use openconductor_db::repos::{self, NewRepo};
use openconductor_db::workspace_rename as rename;
use openconductor_db::workspaces::{self, NewWorkspace, WorkspaceState};
use openconductor_db::{open_in_memory, Error};
use sqlx::{Row, SqlitePool};

async fn setup() -> SqlitePool {
    let pool = open_in_memory().await.unwrap();
    for id in ["r", "other"] {
        let repo = NewRepo {
            id: id.into(),
            name: id.into(),
            root_path: format!("/src/{id}"),
            ..Default::default()
        };
        repos::insert(&pool, &repo).await.unwrap();
    }
    pool
}

async fn add(pool: &SqlitePool, repo: &str, local_id: &str, dir: &str, state: WorkspaceState) {
    let w = NewWorkspace {
        local_id: local_id.into(),
        repository_id: repo.into(),
        directory_name: dir.into(),
        workspace_name: None,
        branch: format!("me/{dir}"),
        placeholder_branch_name: None,
        state,
        initialization_parent_branch: Some("main".into()),
        intended_target_branch: Some("main".into()),
        workspace_path: Some(format!("/data/{repo}/{dir}")),
    };
    workspaces::insert(pool, &w).await.unwrap();
}

async fn user_set(pool: &SqlitePool, local_id: &str) -> (i64, i64) {
    let r = sqlx::query(
        "SELECT user_set_workspace_name, user_set_branch_name FROM workspaces WHERE local_id = ?",
    )
    .bind(local_id)
    .fetch_one(pool)
    .await
    .unwrap();
    (r.get(0), r.get(1))
}

#[tokio::test]
async fn naming_reads_the_rename_columns() {
    let pool = setup().await;
    add(&pool, "r", "w1", "lisbon", WorkspaceState::Ready).await;
    let n = rename::naming(&pool, "w1").await.unwrap().unwrap();
    assert_eq!(n.repository_id, "r");
    assert_eq!(n.directory_name, "lisbon");
    assert_eq!(n.secondary_directory_name, None);
    assert_eq!(n.workspace_name, None);
    assert_eq!(n.state, "ready");
    assert_eq!(n.workspace_path.as_deref(), Some("/data/r/lisbon"));
    assert!(rename::naming(&pool, "nope").await.unwrap().is_none());
}

#[tokio::test]
async fn taken_names_cover_every_other_workspace_of_the_repo_archived_included() {
    let pool = setup().await;
    add(&pool, "r", "w1", "lisbon", WorkspaceState::Ready).await;
    add(&pool, "r", "w2", "osaka", WorkspaceState::Ready).await;
    add(&pool, "r", "w3", "quito", WorkspaceState::Archived).await;
    add(&pool, "other", "w4", "bergen", WorkspaceState::Ready).await;
    rename::record_secondary_name(&pool, "w2", Some("dark-mode"), Some("Dark mode"), true)
        .await
        .unwrap();

    let mut taken = rename::taken_directory_names(&pool, "r", "w1")
        .await
        .unwrap();
    taken.sort();
    assert_eq!(taken, ["dark-mode", "osaka", "quito"]);
}

#[tokio::test]
async fn secondary_name_rename_keeps_the_directory_and_only_turns_user_set_on() {
    let pool = setup().await;
    add(&pool, "r", "w1", "lisbon", WorkspaceState::Ready).await;

    rename::record_secondary_name(&pool, "w1", Some("login-fix"), Some("Login fix"), true)
        .await
        .unwrap();
    let n = rename::naming(&pool, "w1").await.unwrap().unwrap();
    assert_eq!(n.directory_name, "lisbon");
    assert_eq!(n.secondary_directory_name.as_deref(), Some("login-fix"));
    assert_eq!(n.workspace_name.as_deref(), Some("Login fix"));
    assert_eq!(user_set(&pool, "w1").await, (1, 0));

    // An automatic rename later never clears the user's flag.
    rename::record_secondary_name(&pool, "w1", None, None, false)
        .await
        .unwrap();
    let n = rename::naming(&pool, "w1").await.unwrap().unwrap();
    assert_eq!(n.secondary_directory_name, None);
    assert_eq!(n.workspace_name, None);
    assert_eq!(user_set(&pool, "w1").await, (1, 0));
}

#[tokio::test]
async fn directory_rename_moves_the_directory_name_and_path() {
    let pool = setup().await;
    add(&pool, "r", "w1", "lisbon", WorkspaceState::Failed).await;
    rename::record_secondary_name(&pool, "w1", Some("stale"), None, false)
        .await
        .unwrap();

    rename::record_directory_name(&pool, "w1", "porto", "/data/r/porto", None, true)
        .await
        .unwrap();
    let n = rename::naming(&pool, "w1").await.unwrap().unwrap();
    assert_eq!(n.directory_name, "porto");
    assert_eq!(n.secondary_directory_name, None);
    assert_eq!(n.workspace_path.as_deref(), Some("/data/r/porto"));
    assert_eq!(user_set(&pool, "w1").await, (1, 0));
}

#[tokio::test]
async fn writes_to_a_missing_workspace_are_not_found() {
    let pool = setup().await;
    assert!(matches!(
        rename::record_secondary_name(&pool, "nope", None, None, true).await,
        Err(Error::NotFound)
    ));
    assert!(matches!(
        rename::mark_user_set_branch_name(&pool, "nope").await,
        Err(Error::NotFound)
    ));
}

#[tokio::test]
async fn branch_flag_and_symlink_queue() {
    let pool = setup().await;
    add(&pool, "r", "w1", "lisbon", WorkspaceState::Ready).await;
    rename::mark_user_set_branch_name(&pool, "w1")
        .await
        .unwrap();
    assert_eq!(user_set(&pool, "w1").await, (0, 1));

    rename::queue_symlink_deletion(&pool, "/data/r/old")
        .await
        .unwrap();
    rename::queue_symlink_deletion(&pool, "/data/r/older")
        .await
        .unwrap();
    rename::unqueue_symlink_deletion(&pool, "/data/r/old")
        .await
        .unwrap();
    assert_eq!(
        rename::pending_symlink_deletions(&pool).await.unwrap(),
        ["/data/r/older"]
    );
}
