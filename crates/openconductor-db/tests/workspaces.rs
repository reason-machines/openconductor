use openconductor_db::open_in_memory;
use openconductor_db::repos::{self, NewRepo};
use openconductor_db::workspaces::{self, NewWorkspace, WorkspaceState};
use sqlx::SqlitePool;

async fn setup() -> SqlitePool {
    let pool = open_in_memory().await.unwrap();
    let repo = NewRepo {
        id: "r".into(),
        name: "repo".into(),
        root_path: "/src/repo".into(),
        ..Default::default()
    };
    repos::insert(&pool, &repo).await.unwrap();
    pool
}

fn new_ws(local_id: &str, state: WorkspaceState) -> NewWorkspace {
    NewWorkspace {
        local_id: local_id.into(),
        repository_id: "r".into(),
        directory_name: format!("{local_id}-dir"),
        workspace_name: None,
        branch: format!("me/{local_id}"),
        placeholder_branch_name: None,
        state,
        initialization_parent_branch: Some("main".into()),
        intended_target_branch: Some("main".into()),
        workspace_path: None,
    }
}

async fn state(pool: &SqlitePool, id: &str) -> WorkspaceState {
    workspaces::get(pool, id)
        .await
        .unwrap()
        .unwrap()
        .workspace
        .state
}

#[tokio::test]
async fn insert_joins_repo_and_applies_defaults() {
    let pool = setup().await;
    let w = workspaces::insert(&pool, &new_ws("a", WorkspaceState::Initializing))
        .await
        .unwrap();
    assert_eq!(w.workspace.state, WorkspaceState::Initializing);
    assert_eq!(w.workspace.derived_status.as_deref(), Some("in-progress"));
    assert!(!w.workspace.unread);
    assert_eq!(w.root_path.as_deref(), Some("/src/repo"));
    assert_eq!(w.repo_name.as_deref(), Some("repo"));
    assert_eq!(w.storage_version, 1);
    assert_eq!(workspaces::get(&pool, "nope").await.unwrap(), None);
}

#[tokio::test]
async fn lifecycle_initializing_to_ready() {
    let pool = setup().await;
    workspaces::insert(&pool, &new_ws("a", WorkspaceState::Initializing))
        .await
        .unwrap();
    // Setup cannot finish before it starts.
    assert!(!workspaces::finish_setup(&pool, "a").await.unwrap());
    workspaces::begin_setup(&pool, "a", Some("/logs/init.log"), 3)
        .await
        .unwrap();
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert_eq!(w.state, WorkspaceState::SettingUp);
    assert_eq!(w.initialization_log_path.as_deref(), Some("/logs/init.log"));
    assert_eq!(w.initialization_files_copied, Some(3));
    assert!(workspaces::finish_setup(&pool, "a").await.unwrap());
    assert_eq!(state(&pool, "a").await, WorkspaceState::Ready);
    // A ready workspace cannot fail its setup.
    assert!(!workspaces::fail(&pool, "a").await.unwrap());
    assert_eq!(state(&pool, "a").await, WorkspaceState::Ready);
}

#[tokio::test]
async fn failure_only_from_initializing_or_setting_up() {
    let pool = setup().await;
    workspaces::insert(&pool, &new_ws("a", WorkspaceState::Initializing))
        .await
        .unwrap();
    workspaces::insert(&pool, &new_ws("b", WorkspaceState::SettingUp))
        .await
        .unwrap();
    assert!(workspaces::fail(&pool, "a").await.unwrap());
    assert!(workspaces::fail(&pool, "b").await.unwrap());
    assert_eq!(state(&pool, "a").await, WorkspaceState::Failed);
    assert_eq!(state(&pool, "b").await, WorkspaceState::Failed);
}

#[tokio::test]
async fn list_for_session_and_delete() {
    let pool = setup().await;
    workspaces::insert(&pool, &new_ws("a", WorkspaceState::Initializing))
        .await
        .unwrap();
    workspaces::insert(&pool, &new_ws("b", WorkspaceState::Ready))
        .await
        .unwrap();
    let ids: Vec<_> = workspaces::list(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|w| w.workspace.local_id)
        .collect();
    assert_eq!(ids, ["a", "b"]);

    sqlx::query("INSERT INTO sessions (id, workspace_id) VALUES ('s1', 'b')")
        .execute(&pool)
        .await
        .unwrap();
    let w = workspaces::for_session(&pool, "s1").await.unwrap().unwrap();
    assert_eq!(w.workspace.local_id, "b");
    assert_eq!(workspaces::for_session(&pool, "s2").await.unwrap(), None);

    assert!(!workspaces::delete_if_initializing(&pool, "b")
        .await
        .unwrap());
    assert!(workspaces::delete_if_initializing(&pool, "a")
        .await
        .unwrap());
    assert_eq!(workspaces::list(&pool).await.unwrap().len(), 1);
}
