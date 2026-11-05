use openconductor_db::sessions::{
    self, AgentType, NewSession, PermissionMode, RemoteSession, SessionMutation, SessionStatus,
    UNTITLED,
};
use openconductor_db::{open_in_memory, Error};
use sqlx::SqlitePool;

async fn pool() -> SqlitePool {
    open_in_memory().await.unwrap()
}

fn new_session(id: &str, workspace: &str, now: &str) -> NewSession {
    NewSession {
        id: id.into(),
        workspace_id: workspace.into(),
        agent_type: Some(AgentType::Claude),
        model: Some("opus".into()),
        acp_config: None,
        permission_mode: PermissionMode::Default,
        codex_thinking_level: None,
        agent_personality: None,
        fast_mode: false,
        claude_effort_level: Some("high".into()),
        now: now.into(),
    }
}

/// Stage `updated_at` values directly: the `update_sessions_updated_at`
/// trigger would overwrite them with `datetime('now')`.
async fn set_updated_at(pool: &SqlitePool, id: &str, at: &str) {
    sqlx::query("DROP TRIGGER IF EXISTS update_sessions_updated_at")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("UPDATE sessions SET updated_at = ? WHERE id = ?")
        .bind(at)
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
}

async fn create(pool: &SqlitePool, id: &str, workspace: &str, now: &str) {
    sessions::create(pool, &new_session(id, workspace, now))
        .await
        .unwrap();
}

#[tokio::test]
async fn create_stores_reference_defaults() {
    let pool = pool().await;
    let s = sessions::create(&pool, &new_session("s1", "w", "2026-11-05T10:00:00.000Z"))
        .await
        .unwrap();
    assert_eq!(s.status, SessionStatus::Idle);
    assert_eq!(s.title, UNTITLED);
    assert_eq!(s.feed_offset, -1);
    assert_eq!(s.claude_session_id, None);
    assert_eq!(s.last_user_message_at, None);
    assert_eq!(s.agent_type, Some(AgentType::Claude));
    assert_eq!(s.permission_mode, PermissionMode::Default);
    assert_eq!(s.created_at, "2026-11-05T10:00:00.000Z");
    assert_eq!(s.updated_at, "2026-11-05T10:00:00.000Z");
    assert!(!s.unread && !s.is_hidden && !s.fast_mode && !s.freshly_compacted);
    assert_eq!(s.context_token_count, 0);

    let raw: (String, String, i64) =
        sqlx::query_as("SELECT status, agent_type, fast_mode FROM sessions WHERE id = 's1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(raw, ("idle".into(), "claude".into(), 0));
}

#[tokio::test]
async fn unknown_status_fails_to_decode_like_the_reference() {
    let pool = pool().await;
    create(&pool, "s", "w", "2026-11-05T10:00:00Z").await;
    sqlx::query("UPDATE sessions SET status = 'bogus' WHERE id = 's'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(sessions::get(&pool, "s").await.is_err());
}

#[tokio::test]
async fn null_permission_mode_reads_as_default() {
    let pool = pool().await;
    create(&pool, "s", "w", "2026-11-05T10:00:00Z").await;
    sqlx::query("UPDATE sessions SET permission_mode = NULL, title = NULL WHERE id = 's'")
        .execute(&pool)
        .await
        .unwrap();
    let s = sessions::get(&pool, "s").await.unwrap().unwrap();
    assert_eq!(s.permission_mode, PermissionMode::Default);
    assert_eq!(s.title, UNTITLED);
}

#[tokio::test]
async fn workspace_list_splits_hidden_and_sorts_like_the_reference() {
    let pool = pool().await;
    create(&pool, "b", "w", "2026-11-05T10:00:02.000Z").await;
    create(&pool, "a", "w", "2026-11-05T10:00:01.000Z").await;
    create(&pool, "c", "w", "2026-11-05T10:00:03.000Z").await;
    create(&pool, "h1", "w", "2026-11-05T09:00:00.000Z").await;
    create(&pool, "h2", "w", "2026-11-05T09:30:00.000Z").await;
    create(&pool, "other", "w2", "2026-11-05T08:00:00.000Z").await;
    sessions::hide(&pool, "h1").await.unwrap();
    sessions::hide(&pool, "h2").await.unwrap();
    // The trigger stamps updated_at in `datetime('now')` format; give the
    // hidden ones distinct times in that format to check the mixed-format sort.
    set_updated_at(&pool, "h1", "2026-11-05 11:00:00").await;
    set_updated_at(&pool, "h2", "2026-11-05 10:30:00").await;

    let ids = |v: Vec<sessions::Session>| v.into_iter().map(|s| s.id).collect::<Vec<_>>();
    let visible = sessions::list_for_workspace(&pool, "w", false)
        .await
        .unwrap();
    assert_eq!(ids(visible), ["a", "b", "c"]);
    let hidden = sessions::list_for_workspace(&pool, "w", true)
        .await
        .unwrap();
    assert_eq!(ids(hidden), ["h1", "h2"]);

    sessions::unhide(&pool, "h1").await.unwrap();
    assert_eq!(sessions::is_hidden(&pool, "h1").await.unwrap(), Some(false));
    assert_eq!(sessions::is_hidden(&pool, "h2").await.unwrap(), Some(true));
    assert_eq!(sessions::is_hidden(&pool, "nope").await.unwrap(), None);
    let visible = sessions::list_for_workspace(&pool, "w", false)
        .await
        .unwrap();
    assert_eq!(ids(visible), ["h1", "a", "b", "c"]);
}

#[tokio::test]
async fn updates_move_updated_at_through_the_trigger() {
    let pool = pool().await;
    create(&pool, "s", "w", "2000-01-01T00:00:00.000Z").await;
    sessions::set_title(&pool, "s", "Fix the build")
        .await
        .unwrap();
    let s = sessions::get(&pool, "s").await.unwrap().unwrap();
    assert_eq!(s.title, "Fix the build");
    assert_ne!(s.updated_at, "2000-01-01T00:00:00.000Z");
    assert_eq!(s.created_at, "2000-01-01T00:00:00.000Z");
}

#[tokio::test]
async fn status_compare_and_set() {
    let pool = pool().await;
    create(&pool, "s", "w", "2026-11-05T10:00:00Z").await;
    sessions::set_status(&pool, "s", SessionStatus::Working)
        .await
        .unwrap();
    assert!(
        !sessions::set_status_if(&pool, "s", SessionStatus::Idle, SessionStatus::Error)
            .await
            .unwrap()
    );
    assert!(
        sessions::set_status_if(&pool, "s", SessionStatus::Working, SessionStatus::Waiting)
            .await
            .unwrap()
    );
    let s = sessions::get(&pool, "s").await.unwrap().unwrap();
    assert_eq!(s.status, SessionStatus::Waiting);
    assert!(matches!(
        sessions::set_status(&pool, "missing", SessionStatus::Idle).await,
        Err(Error::NotFound)
    ));
}

#[tokio::test]
async fn mutation_writes_only_present_fields() {
    let pool = pool().await;
    create(&pool, "s", "w", "2026-11-05T10:00:00Z").await;
    sessions::set_context_usage(&pool, "s", Some(12.5), Some(1000))
        .await
        .unwrap();
    sessions::apply_mutation(
        &pool,
        "s",
        &SessionMutation {
            status: Some(SessionStatus::Working),
            claude_session_id: Some("agent-1".into()),
            latest_user_message_at: Some("2026-11-05T10:05:00.000Z".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let s = sessions::get(&pool, "s").await.unwrap().unwrap();
    assert_eq!(s.status, SessionStatus::Working);
    assert_eq!(s.claude_session_id.as_deref(), Some("agent-1"));
    assert_eq!(s.permission_mode, PermissionMode::Default);
    assert_eq!(s.context_token_count, 1000);
    assert_eq!(s.context_used_percent, Some(12.5));
    assert_eq!(
        s.last_user_message_at.as_deref(),
        Some("2026-11-05T10:05:00.000Z")
    );

    // An older user-message time never moves last_user_message_at back.
    sessions::apply_mutation(
        &pool,
        "s",
        &SessionMutation {
            permission_mode: Some(PermissionMode::Plan),
            latest_user_message_at: Some("2026-11-05T10:01:00.000Z".into()),
            context_token_count: Some(2000),
            context_used_percent: Some(25.0),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let s = sessions::get(&pool, "s").await.unwrap().unwrap();
    assert_eq!(s.permission_mode, PermissionMode::Plan);
    assert_eq!(s.status, SessionStatus::Working);
    assert_eq!(s.claude_session_id.as_deref(), Some("agent-1"));
    assert_eq!(
        s.last_user_message_at.as_deref(),
        Some("2026-11-05T10:05:00.000Z")
    );
    assert_eq!(
        (s.context_token_count, s.context_used_percent),
        (2000, Some(25.0))
    );

    // An empty mutation is a no-op, even for a missing session.
    sessions::apply_mutation(&pool, "missing", &SessionMutation::default())
        .await
        .unwrap();
}

#[tokio::test]
async fn context_usage_keeps_values_given_as_none() {
    let pool = pool().await;
    create(&pool, "s", "w", "2026-11-05T10:00:00Z").await;
    sessions::set_context_usage(&pool, "s", Some(40.0), Some(80))
        .await
        .unwrap();
    sessions::set_context_usage(&pool, "s", None, Some(90))
        .await
        .unwrap();
    let s = sessions::get(&pool, "s").await.unwrap().unwrap();
    assert_eq!(
        (s.context_used_percent, s.context_token_count),
        (Some(40.0), 90)
    );
}

#[tokio::test]
async fn model_thinking_level_and_flags() {
    let pool = pool().await;
    create(&pool, "s", "w", "2026-11-05T10:00:00Z").await;
    sessions::set_agent_and_model(&pool, "s", AgentType::Codex, Some("gpt"), true)
        .await
        .unwrap();
    assert!(
        sessions::set_thinking_level(&pool, "s", AgentType::Codex, "medium")
            .await
            .unwrap()
    );
    assert!(
        !sessions::set_thinking_level(&pool, "s", AgentType::Acp, "x")
            .await
            .unwrap()
    );
    sessions::set_agent_personality(&pool, "s", Some("pragmatic"))
        .await
        .unwrap();
    sessions::set_freshly_compacted(&pool, "s", true)
        .await
        .unwrap();
    sessions::set_resume_session_at(&pool, "s", Some("msg-9"))
        .await
        .unwrap();
    sessions::set_feed_offset(&pool, "s", Some(42))
        .await
        .unwrap();
    sessions::set_claude_session_id(&pool, "s", Some("thread"))
        .await
        .unwrap();
    let s = sessions::get(&pool, "s").await.unwrap().unwrap();
    assert_eq!(s.agent_type, Some(AgentType::Codex));
    assert_eq!(s.model.as_deref(), Some("gpt"));
    assert!(s.fast_mode && s.freshly_compacted);
    assert_eq!(s.codex_thinking_level.as_deref(), Some("medium"));
    assert_eq!(s.claude_effort_level.as_deref(), Some("high"));
    assert_eq!(s.agent_personality.as_deref(), Some("pragmatic"));
    assert_eq!(s.resume_session_at.as_deref(), Some("msg-9"));
    assert_eq!(s.feed_offset, 42);
    assert_eq!(s.claude_session_id.as_deref(), Some("thread"));

    sessions::set_fast_mode(&pool, "s", false).await.unwrap();
    sessions::set_feed_offset(&pool, "s", None).await.unwrap();
    let s = sessions::get(&pool, "s").await.unwrap().unwrap();
    assert!(!s.fast_mode);
    assert_eq!(s.feed_offset, -1);
}

#[tokio::test]
async fn unread_and_mark_workspace_read() {
    let pool = pool().await;
    create(&pool, "a", "w", "2026-11-05T10:00:00Z").await;
    create(&pool, "b", "w", "2026-11-05T10:00:01Z").await;
    create(&pool, "c", "w2", "2026-11-05T10:00:02Z").await;
    for id in ["a", "b", "c"] {
        sessions::set_unread(&pool, id, true).await.unwrap();
    }
    sessions::set_unread(&pool, "b", false).await.unwrap();
    assert_eq!(
        sessions::mark_workspace_read(&pool, "w").await.unwrap(),
        ["a"]
    );
    assert!(!sessions::get(&pool, "a").await.unwrap().unwrap().unread);
    assert!(sessions::get(&pool, "c").await.unwrap().unwrap().unread);
}

#[tokio::test]
async fn upsert_unread_creates_or_fills_the_chat_row() {
    let pool = pool().await;
    // A chat with no row (a Codex chat): the row is created in its workspace.
    sessions::upsert_unread(&pool, "app/oslo", "app/oslo", true)
        .await
        .unwrap();
    let s = sessions::get(&pool, "app/oslo").await.unwrap().unwrap();
    assert!(s.unread);
    assert_eq!(s.workspace_id.as_deref(), Some("app/oslo"));
    assert_eq!(s.status, SessionStatus::Idle);

    // A row that chat_messages::save made with no workspace gets one.
    openconductor_db::chat_messages::save(
        &pool,
        "app/oslo:review:1",
        &openconductor_db::chat_messages::Batch::default(),
    )
    .await
    .unwrap();
    assert_eq!(
        sessions::workspace_id(&pool, "app/oslo:review:1")
            .await
            .unwrap(),
        None
    );
    sessions::upsert_unread(&pool, "app/oslo:review:1", "app/oslo", true)
        .await
        .unwrap();
    assert_eq!(
        sessions::workspace_id(&pool, "app/oslo:review:1")
            .await
            .unwrap()
            .as_deref(),
        Some("app/oslo")
    );

    // An existing workspace is kept; the flag clears.
    create(&pool, "s", "w", "2026-11-05T10:00:00Z").await;
    sessions::upsert_unread(&pool, "s", "other", true)
        .await
        .unwrap();
    sessions::upsert_unread(&pool, "s", "other", false)
        .await
        .unwrap();
    let s = sessions::get(&pool, "s").await.unwrap().unwrap();
    assert_eq!((s.workspace_id.as_deref(), s.unread), (Some("w"), false));

    // mark_workspace_read now reaches the chats the upsert placed.
    assert_eq!(
        sessions::mark_workspace_read(&pool, "app/oslo")
            .await
            .unwrap(),
        ["app/oslo", "app/oslo:review:1"]
    );
}

#[tokio::test]
async fn unread_chats_lists_visible_unread_chats_by_workspace() {
    let pool = pool().await;
    create(&pool, "b", "w1", "2026-11-05T10:00:00Z").await;
    create(&pool, "a", "w1", "2026-11-05T10:00:01Z").await;
    create(&pool, "hidden", "w1", "2026-11-05T10:00:02Z").await;
    create(&pool, "read", "w2", "2026-11-05T10:00:03Z").await;
    create(&pool, "c", "w2", "2026-11-05T10:00:04Z").await;
    for id in ["a", "b", "hidden", "c"] {
        sessions::set_unread(&pool, id, true).await.unwrap();
    }
    sessions::hide(&pool, "hidden").await.unwrap();
    // A row with no workspace (chat_messages::save) is not listed.
    sqlx::query("INSERT INTO sessions (id, unread_count) VALUES ('orphan', 1)")
        .execute(&pool)
        .await
        .unwrap();
    set_updated_at(&pool, "a", "2026-11-05T11:00:00.000Z").await;

    let rows = sessions::unread_chats(&pool).await.unwrap();
    let ids: Vec<_> = rows
        .iter()
        .map(|r| (r.workspace_id.as_str(), r.id.as_str()))
        .collect();
    assert_eq!(ids, [("w1", "a"), ("w1", "b"), ("w2", "c")]);
    assert_eq!(rows[0].updated_at, "2026-11-05T11:00:00.000Z");
}

#[tokio::test]
async fn last_user_message_at_only_moves_forward_when_bumped() {
    let pool = pool().await;
    create(&pool, "s", "w", "2026-11-05T10:00:00Z").await;
    sessions::bump_last_user_message_at(&pool, "s", "2026-11-05T10:10:00.000Z")
        .await
        .unwrap();
    sessions::bump_last_user_message_at(&pool, "s", "2026-11-05T10:05:00.000Z")
        .await
        .unwrap();
    let at = |s: sessions::Session| s.last_user_message_at.unwrap();
    assert_eq!(
        at(sessions::get(&pool, "s").await.unwrap().unwrap()),
        "2026-11-05T10:10:00.000Z"
    );
    sessions::set_last_user_message_at(&pool, "s", "2026-11-05T09:00:00.000Z")
        .await
        .unwrap();
    assert_eq!(
        at(sessions::get(&pool, "s").await.unwrap().unwrap()),
        "2026-11-05T09:00:00.000Z"
    );
}

#[tokio::test]
async fn busy_sessions_reset_to_idle() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO repos (id, name, root_path) VALUES ('r', 'repo', '/r'); \
         INSERT INTO workspaces (local_id, repository_id, state) VALUES ('local', 'r', 'ready'); \
         INSERT INTO workspaces (local_id, repository_id, state, hosting_server_url) \
         VALUES ('cloud', 'r', 'ready', 'https://example.test');",
    )
    .execute(&pool)
    .await
    .unwrap();
    for (id, ws, status) in [
        ("l-working", "local", SessionStatus::Working),
        ("l-input", "local", SessionStatus::NeedsUserInput),
        ("l-error", "local", SessionStatus::Error),
        ("c-working", "cloud", SessionStatus::Working),
        ("c-input", "cloud", SessionStatus::NeedsUserInput),
    ] {
        create(&pool, id, ws, "2026-11-05T10:00:00Z").await;
        sessions::set_status(&pool, id, status).await.unwrap();
    }

    // Startup: local workspaces only, and needs_user_input survives.
    let mut reset = sessions::reset_busy_to_idle_at_startup(&pool)
        .await
        .unwrap();
    reset.sort();
    assert_eq!(reset, ["l-working"]);

    // Per workspace: needs_user_input is reset too.
    let reset = sessions::reset_busy_to_idle_in_workspace(&pool, "cloud")
        .await
        .unwrap();
    assert_eq!(reset.len(), 2);
    let status = |id: &'static str| {
        let pool = pool.clone();
        async move { sessions::get(&pool, id).await.unwrap().unwrap().status }
    };
    assert_eq!(status("l-input").await, SessionStatus::NeedsUserInput);
    assert_eq!(status("l-error").await, SessionStatus::Error);
    assert_eq!(status("c-input").await, SessionStatus::Idle);
}

#[tokio::test]
async fn remote_insert_is_ignored_when_present() {
    let pool = pool().await;
    let remote = RemoteSession {
        id: "r1".into(),
        workspace_id: "w".into(),
        agent_type: Some(AgentType::Claude),
        model: None,
        permission_mode: PermissionMode::Plan,
        codex_thinking_level: None,
        agent_personality: None,
        fast_mode: false,
        claude_effort_level: None,
        remote_archived_at: None,
        is_hidden: true,
        title: "Remote".into(),
        created_at: "2026-11-05T10:00:00Z".into(),
        updated_at: "2026-11-05T10:00:00Z".into(),
    };
    assert!(sessions::insert_remote_if_missing(&pool, &remote)
        .await
        .unwrap());
    let again = RemoteSession {
        title: "Changed".into(),
        ..remote
    };
    assert!(!sessions::insert_remote_if_missing(&pool, &again)
        .await
        .unwrap());
    let s = sessions::get(&pool, "r1").await.unwrap().unwrap();
    assert_eq!(s.title, "Remote");
    assert!(s.is_hidden);
    assert_eq!(s.permission_mode, PermissionMode::Plan);
    assert_eq!(s.feed_offset, -1);
}

#[tokio::test]
async fn list_and_delete() {
    let pool = pool().await;
    create(&pool, "a", "w1", "2026-11-05T10:00:00Z").await;
    create(&pool, "b", "w2", "2026-11-05T10:00:00Z").await;
    create(&pool, "c", "w3", "2026-11-05T10:00:00Z").await;
    set_updated_at(&pool, "b", "2099-01-01 00:00:00").await;
    let all = sessions::list(&pool).await.unwrap();
    assert_eq!(all[0].id, "b");
    assert_eq!(all.len(), 3);
    assert_eq!(
        sessions::workspace_id(&pool, "a").await.unwrap().as_deref(),
        Some("w1")
    );

    let mut gone = sessions::delete_for_workspaces(&pool, &["w1".into(), "w2".into()])
        .await
        .unwrap();
    gone.sort();
    assert_eq!(gone, ["a", "b"]);
    assert!(sessions::delete_for_workspaces(&pool, &[])
        .await
        .unwrap()
        .is_empty());
    assert!(sessions::delete(&pool, "c").await.unwrap());
    assert!(!sessions::delete(&pool, "c").await.unwrap());
    assert!(sessions::list(&pool).await.unwrap().is_empty());
}
