use openconductor_db::chat_messages::{load, save, Batch, StoredMessage};

fn msg(id: &str, role: &str, turn: &str, at: &str) -> StoredMessage {
    StoredMessage {
        id: id.into(),
        role: role.into(),
        content: format!("{id} text"),
        created_at: at.into(),
        turn_id: Some(turn.into()),
        sent_at: Some(at.into()),
        full_message: format!("{{\"id\":\"{id}\"}}"),
        ..Default::default()
    }
}

#[tokio::test]
async fn a_saved_chat_loads_back_in_order_with_its_agent_session() {
    let pool = openconductor_db::open_in_memory().await.unwrap();
    let first = Batch {
        upserts: vec![
            msg("u1", "user", "t1", "2026-11-05T10:00:00Z"),
            msg("a1", "assistant", "t1", "2026-11-05T10:00:01Z"),
        ],
        delete_ids: vec![],
        agent_session_id: Some("reason-1".into()),
    };
    save(&pool, "w1", &first).await.unwrap();
    // A later update of a1 (streamed text) keeps its place; a new message goes last.
    let mut a1 = msg("a1", "assistant", "t1", "2026-11-05T10:00:01Z");
    a1.full_message = "{\"id\":\"a1\",\"v\":2}".into();
    save(
        &pool,
        "w1",
        &Batch {
            upserts: vec![msg("u2", "user", "t2", "2026-11-05T10:01:00Z"), a1],
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let loaded = load(&pool, "w1").await.unwrap();
    assert_eq!(
        loaded.messages,
        vec![
            "{\"id\":\"u1\"}",
            "{\"id\":\"a1\",\"v\":2}",
            "{\"id\":\"u2\"}"
        ]
    );
    assert_eq!(loaded.agent_session_id.as_deref(), Some("reason-1"));

    let (last_user, claude): (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT last_user_message_at, claude_session_id FROM sessions WHERE id = 'w1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(last_user.as_deref(), Some("2026-11-05T10:01:00Z"));
    assert_eq!(claude.as_deref(), Some("reason-1"));
}

#[tokio::test]
async fn reset_deletes_dropped_messages_and_chats_stay_apart() {
    let pool = openconductor_db::open_in_memory().await.unwrap();
    let batch = Batch {
        upserts: vec![msg("u1", "user", "t1", "1"), msg("u2", "user", "t2", "2")],
        ..Default::default()
    };
    save(&pool, "w1", &batch).await.unwrap();
    save(
        &pool,
        "w2",
        &Batch {
            upserts: vec![msg("x1", "user", "t9", "1")],
            ..Default::default()
        },
    )
    .await
    .unwrap();
    save(
        &pool,
        "w1",
        &Batch {
            delete_ids: vec!["u2".into(), "x1".into()],
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(
        load(&pool, "w1").await.unwrap().messages,
        vec!["{\"id\":\"u1\"}"]
    );
    assert_eq!(
        load(&pool, "w2").await.unwrap().messages,
        vec!["{\"id\":\"x1\"}"],
        "a delete only touches its own chat"
    );
    assert_eq!(load(&pool, "nope").await.unwrap(), Default::default());
}

#[tokio::test]
async fn columns_conductor_filters_on_are_written() {
    let pool = openconductor_db::open_in_memory().await.unwrap();
    let mut u = msg("u1", "user", "t1", "2026-11-05T10:00:00Z");
    u.cancelled_at = Some("2026-11-05T10:00:05Z".into());
    save(
        &pool,
        "w1",
        &Batch {
            upserts: vec![u],
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let row: (String, String, Option<String>, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT role, content, turn_id, sent_at, cancelled_at FROM session_messages WHERE id = 'u1' AND session_id = 'w1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        row,
        (
            "user".into(),
            "u1 text".into(),
            Some("t1".into()),
            Some("2026-11-05T10:00:00Z".into()),
            Some("2026-11-05T10:00:05Z".into())
        )
    );
}
