use openconductor_db::repos::{self, NewRepo};
use openconductor_db::workspaces::{self, NewWorkspace, WorkspaceState};
use openconductor_db::{open_in_memory, Error};
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
async fn archive_and_unarchive() {
    let pool = setup().await;
    workspaces::insert(&pool, &new_ws("a", WorkspaceState::Ready))
        .await
        .unwrap();
    assert!(!workspaces::unarchive(&pool, "a").await.unwrap());
    sqlx::query("UPDATE workspaces SET updated_at = '2000-01-01 00:00:00'")
        .execute(&pool)
        .await
        .unwrap();
    workspaces::archive(&pool, "a", "me/a-final", Some("abc123"))
        .await
        .unwrap();
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert_eq!(w.state, WorkspaceState::Archived);
    assert_eq!(w.branch.as_deref(), Some("me/a-final"));
    assert_eq!(w.archive_commit.as_deref(), Some("abc123"));
    // No trigger: archiving leaves updated_at alone.
    assert_eq!(w.updated_at, "2000-01-01 00:00:00");
    assert!(workspaces::unarchive(&pool, "a").await.unwrap());
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert_eq!(w.state, WorkspaceState::SettingUp);
    assert_ne!(w.updated_at, "2000-01-01 00:00:00");
    assert!(matches!(
        workspaces::archive(&pool, "nope", "b", None).await,
        Err(Error::NotFound)
    ));
}

#[tokio::test]
async fn touch_only_moves_forward() {
    let pool = setup().await;
    workspaces::insert(&pool, &new_ws("a", WorkspaceState::Ready))
        .await
        .unwrap();
    workspaces::touch(&pool, "a", "2100-01-01 00:00:00")
        .await
        .unwrap();
    workspaces::touch(&pool, "a", "2000-01-01 00:00:00")
        .await
        .unwrap();
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert_eq!(w.updated_at, "2100-01-01 00:00:00");
}

/// What chat_messages_save does (Conductor's addUserMessage ->
/// setSessionUpdatedAt): a user message moves its workspace's last activity
/// to its created_at; assistant output leaves it alone.
#[tokio::test]
async fn a_user_message_is_workspace_activity_and_assistant_output_is_not() {
    use openconductor_db::chat_messages::{latest_user_message_at, Batch, StoredMessage};
    let msg = |id: &str, role: &str, at: &str| StoredMessage {
        id: id.into(),
        role: role.into(),
        created_at: at.into(),
        full_message: "{}".into(),
        ..Default::default()
    };
    let pool = setup().await;
    workspaces::insert(&pool, &new_ws("a", WorkspaceState::Ready))
        .await
        .unwrap();
    let reply = Batch {
        upserts: vec![msg("a1", "assistant", "2100-01-01T00:00:00.000Z")],
        ..Default::default()
    };
    assert_eq!(latest_user_message_at(&reply), None);
    let sent = Batch {
        upserts: vec![
            msg("u1", "user", "2099-01-01T00:00:00.000Z"),
            msg("u2", "user", "2099-06-01T12:00:00.000Z"),
            msg("a2", "assistant", "2100-01-01T00:00:00.000Z"),
        ],
        ..Default::default()
    };
    let at = latest_user_message_at(&sent).unwrap();
    assert_eq!(at, "2099-06-01T12:00:00.000Z");
    workspaces::touch(&pool, "a", at).await.unwrap();
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert_eq!(w.updated_at, "2099-06-01T12:00:00.000Z");
    // An older ISO time (a re-saved message) does not move it back.
    workspaces::touch(&pool, "a", "2099-01-01T00:00:00.000Z")
        .await
        .unwrap();
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert_eq!(w.updated_at, "2099-06-01T12:00:00.000Z");
}

#[tokio::test]
async fn field_setters() {
    let pool = setup().await;
    workspaces::insert(&pool, &new_ws("a", WorkspaceState::Ready))
        .await
        .unwrap();
    sqlx::query("UPDATE workspaces SET pr_title = 't', pr_description = 'd'")
        .execute(&pool)
        .await
        .unwrap();
    workspaces::rename_branch(&pool, "a", "me/better", Some("me/a"))
        .await
        .unwrap();
    workspaces::set_active_session(&pool, "a", Some("s1"))
        .await
        .unwrap();
    workspaces::set_target_branch(&pool, "a", Some("develop"))
        .await
        .unwrap();
    workspaces::set_notes(&pool, "a", Some("todo"))
        .await
        .unwrap();
    workspaces::set_pinned_at(&pool, "a", Some("2026-11-05T10:00:00Z"))
        .await
        .unwrap();
    workspaces::set_unread(&pool, "a", true).await.unwrap();
    workspaces::set_manual_status(&pool, "a", Some("done"))
        .await
        .unwrap();
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert_eq!(w.branch.as_deref(), Some("me/better"));
    assert_eq!(w.placeholder_branch_name.as_deref(), Some("me/a"));
    assert_eq!((w.pr_title, w.pr_description), (None, None));
    assert_eq!(w.active_session_id.as_deref(), Some("s1"));
    assert_eq!(w.intended_target_branch.as_deref(), Some("develop"));
    assert_eq!(w.notes.as_deref(), Some("todo"));
    assert_eq!(w.pinned_at.as_deref(), Some("2026-11-05T10:00:00Z"));
    assert!(w.unread);
    assert_eq!(w.manual_status.as_deref(), Some("done"));
    workspaces::set_derived_status(&pool, "a", "in-review")
        .await
        .unwrap();
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert_eq!(
        (w.manual_status, w.derived_status.as_deref()),
        (None, Some("in-review"))
    );
    workspaces::set_state(&pool, "a", WorkspaceState::Archiving)
        .await
        .unwrap();
    assert_eq!(state(&pool, "a").await, WorkspaceState::Archiving);
    assert!(matches!(
        workspaces::set_notes(&pool, "nope", None).await,
        Err(Error::NotFound)
    ));
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

#[tokio::test]
async fn user_set_workspace_name_is_read() {
    let pool = setup().await;
    workspaces::insert(&pool, &new_ws("a", WorkspaceState::Ready))
        .await
        .unwrap();
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert!(!w.user_set_workspace_name);
    sqlx::query("UPDATE workspaces SET workspace_name = 'Mine', user_set_workspace_name = 1")
        .execute(&pool)
        .await
        .unwrap();
    let w = workspaces::get(&pool, "a")
        .await
        .unwrap()
        .unwrap()
        .workspace;
    assert!(w.user_set_workspace_name);
    assert_eq!(w.workspace_name.as_deref(), Some("Mine"));
}

#[tokio::test]
async fn pr_metadata_round_trips_and_clears() {
    let pool = setup().await;
    workspaces::insert(&pool, &new_ws("a", WorkspaceState::Ready))
        .await
        .unwrap();
    let meta = |pool: SqlitePool| async move {
        let w = workspaces::get(&pool, "a")
            .await
            .unwrap()
            .unwrap()
            .workspace;
        (w.pr_title, w.pr_description)
    };
    workspaces::set_pr_metadata(&pool, "a", Some("Add thing"), Some("Body"))
        .await
        .unwrap();
    assert_eq!(
        meta(pool.clone()).await,
        (Some("Add thing".into()), Some("Body".into()))
    );
    workspaces::set_pr_metadata(&pool, "a", None, None)
        .await
        .unwrap();
    assert_eq!(meta(pool.clone()).await, (None, None));
    assert!(matches!(
        workspaces::set_pr_metadata(&pool, "nope", Some("t"), None).await,
        Err(Error::NotFound)
    ));
}
