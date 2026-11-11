use openconductor_db::{
    chat_messages, open_in_memory,
    sessions::{self, AgentType, NewSession, PermissionMode, SessionStatus},
    SqlitePool,
};

fn session(id: &str, agent: AgentType, now: &str) -> NewSession {
    NewSession {
        id: id.into(),
        workspace_id: "w".into(),
        agent_type: Some(agent),
        model: Some("chosen-model".into()),
        acp_config: None,
        permission_mode: PermissionMode::Default,
        codex_thinking_level: (agent == AgentType::Codex).then(|| "high".into()),
        claude_effort_level: (agent == AgentType::Claude).then(|| "high".into()),
        agent_personality: None,
        fast_mode: false,
        now: now.into(),
    }
}

async fn setup() -> SqlitePool {
    let pool = open_in_memory().await.unwrap();
    sqlx::query("INSERT INTO workspaces (local_id, state) VALUES ('w', 'ready')")
        .execute(&pool)
        .await
        .unwrap();
    pool
}

#[tokio::test]
async fn local_clear_preserves_transcript_and_options_but_not_provider_identity() {
    for agent in [AgentType::Claude, AgentType::Codex] {
        let pool = setup().await;
        let runtime_id = if agent == AgentType::Claude {
            "w:claude"
        } else {
            "w"
        };
        sessions::open_tab(
            &pool,
            "w",
            "w",
            "Renamed predecessor",
            "2026-11-01T00:00:00Z",
        )
        .await
        .unwrap();
        if runtime_id != "w" {
            sessions::create(&pool, &session(runtime_id, agent, "2026-11-01T00:00:00Z"))
                .await
                .unwrap();
        }
        sqlx::query("UPDATE sessions SET agent_type = ?, agent_personality = 'pragmatic', permission_mode = 'plan', fast_mode = 1, claude_session_id = 'old-provider', feed_offset = 123 WHERE id = ?")
            .bind(agent).bind(runtime_id).execute(&pool).await.unwrap();
        let message = chat_messages::StoredMessage {
            id: "old-message".into(),
            role: "user".into(),
            content: "Keep unchanged".into(),
            full_message: "{\"text\":\"Keep unchanged\"}".into(),
            created_at: "2026-11-01T00:00:01Z".into(),
            ..Default::default()
        };
        chat_messages::save(
            &pool,
            runtime_id,
            &chat_messages::Batch {
                upserts: vec![message],
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let before = chat_messages::load(&pool, runtime_id).await.unwrap();
        let source_before = sessions::get(&pool, runtime_id).await.unwrap().unwrap();
        let next = session("w:chat:replacement", agent, "2026-11-02T00:00:00Z");
        assert_eq!(
            sessions::replace_local(&pool, "w", &next).await.unwrap(),
            next.id
        );
        let after = sessions::get(&pool, &next.id).await.unwrap().unwrap();
        assert_eq!(after.status, SessionStatus::Idle);
        assert_eq!(after.model, next.model);
        assert_eq!(after.claude_effort_level, next.claude_effort_level);
        assert_eq!(after.codex_thinking_level, next.codex_thinking_level);
        assert_eq!(after.permission_mode, PermissionMode::Default);
        assert!(!after.fast_mode);
        assert_eq!(after.claude_session_id, None);
        assert_eq!(after.feed_offset, -1);
        assert_eq!(after.title, "Untitled");
        if agent == AgentType::Codex {
            assert_eq!(after.agent_personality.as_deref(), Some("pragmatic"));
        }
        assert_eq!(
            chat_messages::load(&pool, runtime_id).await.unwrap(),
            before
        );
        assert!(chat_messages::load(&pool, &next.id)
            .await
            .unwrap()
            .messages
            .is_empty());
        let source_after = sessions::get(&pool, runtime_id).await.unwrap().unwrap();
        assert!(source_after.is_hidden);
        assert_eq!(
            source_after.claude_session_id,
            source_before.claude_session_id
        );
        assert_eq!(source_after.feed_offset, source_before.feed_offset);
        assert_eq!(
            source_after.resume_session_at,
            source_before.resume_session_at
        );
        assert_eq!(source_after.model, source_before.model);
        assert_eq!(source_after.fast_mode, source_before.fast_mode);
        assert_eq!(source_after.permission_mode, source_before.permission_mode);
        assert!(sessions::get(&pool, "w").await.unwrap().unwrap().is_hidden);
        assert_eq!(
            sessions::primary_chat_id(&pool, "w").await.unwrap(),
            next.id
        );
        let active: String =
            sqlx::query_scalar("SELECT active_session_id FROM workspaces WHERE local_id = 'w'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(active, next.id);
        sessions::open_tab(
            &pool,
            &next.id,
            "w",
            "Replacement renamed",
            "2026-11-03T00:00:00Z",
        )
        .await
        .unwrap();
        let primary = sessions::primary_chat_id(&pool, "w").await.unwrap();
        assert_eq!(
            sessions::get(&pool, &primary).await.unwrap().unwrap().title,
            "Replacement renamed"
        );
    }
}

#[tokio::test]
async fn local_clear_at_cap_orders_new_replacement_after_older_siblings_and_repeats() {
    let pool = setup().await;
    for (id, day) in [
        ("w", "01"),
        ("w:chat:1", "02"),
        ("w:chat:2", "03"),
        ("w:chat:3", "04"),
        ("w:chat:4", "05"),
    ] {
        sessions::create(
            &pool,
            &session(id, AgentType::Codex, &format!("2026-11-{day}T00:00:00Z")),
        )
        .await
        .unwrap();
    }
    let next = session("w:chat:new", AgentType::Codex, "2026-11-10T00:00:00Z");
    assert_eq!(
        sessions::replace_local(&pool, "w", &next).await.unwrap(),
        "w:chat:1"
    );
    let visible = sessions::list_for_workspace(&pool, "w", false)
        .await
        .unwrap();
    assert_eq!(
        visible.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
        ["w:chat:1", "w:chat:2", "w:chat:3", "w:chat:4", "w:chat:new"]
    );
    let next_again = session("w:chat:again", AgentType::Codex, "2026-11-11T00:00:00Z");
    assert_eq!(
        sessions::replace_local(&pool, &next.id, &next_again)
            .await
            .unwrap(),
        "w:chat:1"
    );
    assert_eq!(
        sessions::list_for_workspace(&pool, "w", false)
            .await
            .unwrap()
            .len(),
        5
    );
    assert!(
        sessions::get(&pool, &next.id)
            .await
            .unwrap()
            .unwrap()
            .is_hidden
    );
    assert_eq!(
        sessions::primary_chat_id(&pool, "w").await.unwrap(),
        "w:chat:1"
    );
}

#[tokio::test]
async fn failed_replacement_does_not_hide_source_or_change_selected_session() {
    let pool = setup().await;
    sessions::create(
        &pool,
        &session("w", AgentType::Codex, "2026-11-01T00:00:00Z"),
    )
    .await
    .unwrap();
    sessions::create(
        &pool,
        &session("w:chat:taken", AgentType::Codex, "2026-11-02T00:00:00Z"),
    )
    .await
    .unwrap();
    assert!(sessions::replace_local(
        &pool,
        "w",
        &session("w:chat:taken", AgentType::Codex, "2026-11-03T00:00:00Z")
    )
    .await
    .is_err());
    assert!(!sessions::get(&pool, "w").await.unwrap().unwrap().is_hidden);
    let active: Option<String> =
        sqlx::query_scalar("SELECT active_session_id FROM workspaces WHERE local_id = 'w'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(active, None);
    assert!(sessions::replace_local(
        &pool,
        "other:chat:id",
        &session("w:chat:valid", AgentType::Codex, "2026-11-03T00:00:00Z")
    )
    .await
    .is_err());
    sqlx::query("UPDATE sessions SET status = 'working' WHERE id = 'w'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(sessions::replace_local(
        &pool,
        "w",
        &session("w:chat:valid", AgentType::Codex, "2026-11-03T00:00:00Z")
    )
    .await
    .is_err());
    assert!(sessions::get(&pool, "w:chat:valid")
        .await
        .unwrap()
        .is_none());
}
