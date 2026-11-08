use openconductor_db::{open_in_memory, repos::{self, NewRepo}, workspaces::{self, NewWorkspace, WorkspaceState}, workspace_links::{self, LinkKind}};
use sqlx::SqlitePool;

async fn setup() -> SqlitePool {
    let pool = open_in_memory().await.unwrap();
    repos::insert(&pool, &NewRepo { id: "r".into(), name: "repo".into(), root_path: "/repo".into(), ..Default::default() }).await.unwrap();
    for id in ["source", "target", "other"] {
        workspaces::insert(&pool, &NewWorkspace {
            local_id: id.into(), repository_id: "r".into(), directory_name: id.into(), workspace_name: None,
            branch: id.into(), placeholder_branch_name: None, state: WorkspaceState::Ready,
            initialization_parent_branch: None, intended_target_branch: None, workspace_path: Some(format!("/work/{id}")),
        }).await.unwrap();
    }
    pool
}

#[tokio::test]
async fn links_round_trip_dedupe_isolate_and_clear_to_null() {
    let pool = setup().await;
    for _ in 0..2 {
        workspace_links::set(&pool, "source", LinkKind::Workspace, "target", true).await.unwrap();
        workspace_links::set(&pool, "source", LinkKind::Directory, "/extra", true).await.unwrap();
    }
    let row = workspaces::get(&pool, "source").await.unwrap().unwrap().workspace;
    assert_eq!(row.linked_workspace_ids.as_deref(), Some("[\"target\"]"));
    assert_eq!(row.linked_directory_paths.as_deref(), Some("[\"/extra\"]"));
    assert_eq!(workspace_links::resolve(&pool, "source").await.unwrap(), ["/work/target", "/extra"]);
    assert!(workspace_links::resolve(&pool, "other").await.unwrap().is_empty());
    assert!(workspace_links::set(&pool, "source", LinkKind::Workspace, "source", true).await.is_err());
    assert!(workspace_links::set(&pool, "source", LinkKind::Workspace, "missing", true).await.is_err());
    workspace_links::set(&pool, "source", LinkKind::Workspace, "target", false).await.unwrap();
    workspace_links::set(&pool, "source", LinkKind::Directory, "/extra", false).await.unwrap();
    let row = workspaces::get(&pool, "source").await.unwrap().unwrap().workspace;
    assert_eq!(row.linked_workspace_ids, None);
    assert_eq!(row.linked_directory_paths, None);
}

#[tokio::test]
async fn each_resolution_uses_current_paths_and_omits_missing_targets() {
    let pool = setup().await;
    workspace_links::set(&pool, "source", LinkKind::Workspace, "target", true).await.unwrap();
    assert_eq!(workspace_links::resolve(&pool, "source").await.unwrap(), ["/work/target"]);
    sqlx::query("UPDATE workspaces SET workspace_path = '/moved' WHERE local_id = 'target'").execute(&pool).await.unwrap();
    assert_eq!(workspace_links::resolve(&pool, "source").await.unwrap(), ["/moved"]);
    workspaces::delete(&pool, "target").await.unwrap();
    assert!(workspace_links::resolve(&pool, "source").await.unwrap().is_empty());
    assert!(workspace_links::resolve(&pool, "missing").await.is_err());
}
