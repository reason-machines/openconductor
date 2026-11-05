use openconductor_db::session_messages::{self, NewMessage, COMPACTED};
use openconductor_db::sessions::{self, AgentType, NewSession, PermissionMode};
use openconductor_db::{open_in_memory, Error};
use sqlx::SqlitePool;

async fn pool() -> SqlitePool {
    open_in_memory().await.unwrap()
}

fn user(id: &str, created: &str, sent: Option<&str>) -> NewMessage {
    NewMessage {
        id: id.into(),
        session_id: "s".into(),
        role: "user".into(),
        content: format!("text {id}"),
        sent_at: sent.map(Into::into),
        created_at: created.into(),
        turn_id: sent.map(|_| id.into()),
        ..Default::default()
    }
}

fn assistant(id: &str, turn: &str, at: &str, sdk: Option<&str>) -> NewMessage {
    NewMessage {
        id: id.into(),
        session_id: "s".into(),
        role: "assistant".into(),
        content: format!("reply {id}"),
        sent_at: Some(at.into()),
        created_at: at.into(),
        turn_id: Some(turn.into()),
        sdk_message_id: sdk.map(Into::into),
        ..Default::default()
    }
}

async fn queue(pool: &SqlitePool, id: &str, created: &str) {
    let mut m = user(id, created, None);
    m.queue_order = Some(session_messages::next_queue_order(pool, "s").await.unwrap());
    session_messages::insert(pool, &m).await.unwrap();
}

fn ids(v: Vec<session_messages::SessionMessage>) -> Vec<String> {
    v.into_iter().map(|m| m.id).collect()
}

#[tokio::test]
async fn insert_and_get_round_trip() {
    let pool = pool().await;
    let mut m = assistant("a1", "u1", "2026-11-05T10:00:01.000Z", Some("sdk-1"));
    m.is_resumable_message = true;
    m.full_message = Some("{\"type\":\"assistant\"}".into());
    m.model = Some("opus".into());
    session_messages::insert(&pool, &m).await.unwrap();
    session_messages::insert(
        &pool,
        &user(
            "u1",
            "2026-11-05T10:00:00.000Z",
            Some("2026-11-05T10:00:00.000Z"),
        ),
    )
    .await
    .unwrap();

    let a = session_messages::get(&pool, "a1").await.unwrap().unwrap();
    assert!(a.is_resumable_message);
    assert_eq!(a.role.as_deref(), Some("assistant"));
    assert_eq!(a.turn_id.as_deref(), Some("u1"));
    assert_eq!(a.sdk_message_id.as_deref(), Some("sdk-1"));
    assert_eq!(a.model.as_deref(), Some("opus"));
    assert!(!a.is_queued());

    // Not resumable is stored as NULL, not 0 (reference `is_resumable_message: null`).
    let raw: (Option<i64>, Option<i64>) = sqlx::query_as(
        "SELECT (SELECT is_resumable_message FROM session_messages WHERE id = 'a1'), \
                (SELECT is_resumable_message FROM session_messages WHERE id = 'u1')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(raw, (Some(1), None));
    assert!(session_messages::get(&pool, "nope")
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn transcript_orders_by_sent_at_and_skips_queue() {
    let pool = pool().await;
    let t = |s: &str| format!("2026-11-05T10:00:0{s}.000Z");
    session_messages::insert(&pool, &assistant("a1", "u1", &t("2"), None))
        .await
        .unwrap();
    session_messages::insert(&pool, &user("u1", &t("1"), Some(&t("1"))))
        .await
        .unwrap();
    session_messages::insert(&pool, &user("u2", &t("3"), Some(&t("3"))))
        .await
        .unwrap();
    queue(&pool, "q1", &t("4")).await;

    assert_eq!(
        ids(session_messages::list_sent(&pool, "s").await.unwrap()),
        ["u1", "a1", "u2"]
    );
    assert_eq!(
        ids(session_messages::list_sent_from(&pool, "s", 2)
            .await
            .unwrap()),
        ["u2"]
    );
    assert!(session_messages::list_sent_from(&pool, "s", 3)
        .await
        .unwrap()
        .is_empty());
    // Revision is the highest rowid among sent rows: u2 (third insert).
    assert_eq!(
        session_messages::transcript_revision(&pool, "s")
            .await
            .unwrap(),
        3
    );
    assert_eq!(
        session_messages::transcript_revision(&pool, "x")
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn queue_orders_and_numbers_messages() {
    let pool = pool().await;
    assert_eq!(
        session_messages::next_queue_order(&pool, "s")
            .await
            .unwrap(),
        1
    );
    queue(&pool, "q1", "2026-11-05T10:00:01Z").await;
    queue(&pool, "q2", "2026-11-05T10:00:00Z").await;
    // A legacy row without queue_order sorts as 0, ahead of numbered ones.
    session_messages::insert(&pool, &user("q0", "2026-11-05T10:00:05Z", None))
        .await
        .unwrap();
    let queued = session_messages::list_queued(&pool, "s").await.unwrap();
    assert_eq!(
        queued
            .iter()
            .map(|m| (m.id.as_str(), m.queue_order))
            .collect::<Vec<_>>(),
        [("q0", None), ("q1", Some(1)), ("q2", Some(2))]
    );
    assert!(queued.iter().all(|m| m.is_queued()));
    assert_eq!(
        session_messages::next_queue_order(&pool, "s")
            .await
            .unwrap(),
        3
    );

    let changed = session_messages::clear_queue_order(&pool, "s", &["q1".into(), "q2".into()], 2)
        .await
        .unwrap();
    assert_eq!(changed, 1);
    let q2 = session_messages::get(&pool, "q2").await.unwrap().unwrap();
    assert_eq!(q2.queue_order, None);
}

#[tokio::test]
async fn queue_state_counts_queued_user_messages() {
    let pool = pool().await;
    sessions::create(
        &pool,
        &NewSession {
            id: "s".into(),
            workspace_id: "w".into(),
            agent_type: Some(AgentType::Claude),
            model: Some("opus".into()),
            acp_config: None,
            permission_mode: PermissionMode::Default,
            codex_thinking_level: None,
            agent_personality: None,
            fast_mode: false,
            claude_effort_level: None,
            now: "2026-11-05T10:00:00Z".into(),
        },
    )
    .await
    .unwrap();
    sessions::set_context_usage(&pool, "s", None, Some(500))
        .await
        .unwrap();
    queue(&pool, "q1", "2026-11-05T10:00:01Z").await;
    queue(&pool, "q2", "2026-11-05T10:00:02Z").await;
    session_messages::insert(
        &pool,
        &user("u1", "2026-11-05T10:00:00Z", Some("2026-11-05T10:00:00Z")),
    )
    .await
    .unwrap();
    let st = session_messages::queue_state(&pool, "s").await.unwrap();
    assert_eq!(st.queued_message_count, 2);
    assert_eq!(st.context_token_count, 500);
    assert_eq!(st.model.as_deref(), Some("opus"));

    let none = session_messages::queue_state(&pool, "missing")
        .await
        .unwrap();
    assert_eq!(
        (
            none.queued_message_count,
            none.context_token_count,
            none.model
        ),
        (0, 0, None)
    );
}

#[tokio::test]
async fn mark_sent_promotes_once_and_honours_expected_content() {
    let pool = pool().await;
    queue(&pool, "q1", "2026-11-05T10:00:00Z").await;
    let sent = "2026-11-05T10:01:00.000Z";
    assert!(
        !session_messages::mark_sent(&pool, "s", "q1", sent, None, "q1", Some("edited"))
            .await
            .unwrap()
    );
    assert!(
        session_messages::mark_sent(&pool, "s", "q1", sent, Some("a0"), "q1", Some("text q1"))
            .await
            .unwrap()
    );
    // Already sent: no second promotion.
    assert!(
        !session_messages::mark_sent(&pool, "s", "q1", sent, None, "q1", None)
            .await
            .unwrap()
    );
    let m = session_messages::get(&pool, "q1").await.unwrap().unwrap();
    assert_eq!(m.sent_at.as_deref(), Some(sent));
    assert_eq!(m.turn_id.as_deref(), Some("q1"));
    assert_eq!(m.last_assistant_message_id.as_deref(), Some("a0"));
    assert!(session_messages::list_queued(&pool, "s")
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn cancelled_messages_leave_the_queue_but_count_as_turns() {
    let pool = pool().await;
    queue(&pool, "q1", "2026-11-05T10:00:00Z").await;
    // No reference statement writes cancelled_at; stage it directly.
    sqlx::query("UPDATE session_messages SET cancelled_at = '2026-11-05T10:00:30Z', turn_id = 'q1' WHERE id = 'q1'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(session_messages::list_queued(&pool, "s")
        .await
        .unwrap()
        .is_empty());
    assert_eq!(
        session_messages::next_queue_order(&pool, "s")
            .await
            .unwrap(),
        1
    );
    assert!(!session_messages::mark_sent(
        &pool,
        "s",
        "q1",
        "2026-11-05T10:01:00Z",
        None,
        "q1",
        None
    )
    .await
    .unwrap());
    assert_eq!(
        session_messages::current_turn_id(&pool, "s")
            .await
            .unwrap()
            .as_deref(),
        Some("q1")
    );
    assert!(session_messages::turn_exists(&pool, "s", "q1")
        .await
        .unwrap());
}

#[tokio::test]
async fn requeue_moves_a_sent_message_to_the_back() {
    let pool = pool().await;
    let sent = "2026-11-05T10:00:00.000Z";
    session_messages::insert(&pool, &user("u1", sent, Some(sent)))
        .await
        .unwrap();
    queue(&pool, "q1", "2026-11-05T10:00:01Z").await;
    assert!(
        !session_messages::requeue(&pool, "s", "u1", "2026-11-05T09:00:00.000Z")
            .await
            .unwrap()
    );
    assert!(session_messages::requeue(&pool, "s", "u1", sent)
        .await
        .unwrap());
    let u1 = session_messages::get(&pool, "u1").await.unwrap().unwrap();
    assert_eq!(
        (u1.sent_at, u1.turn_id, u1.queue_order),
        (None, None, Some(2))
    );
    assert_eq!(
        ids(session_messages::list_queued(&pool, "s").await.unwrap()),
        ["q1", "u1"]
    );
}

#[tokio::test]
async fn upsert_updates_only_matching_session_and_role() {
    let pool = pool().await;
    let mut m = user("u1", "2026-11-05T10:00:00Z", None);
    assert_eq!(session_messages::upsert(&pool, &m).await.unwrap(), 1);
    m.content = "new".into();
    m.sent_at = Some("2026-11-05T10:01:00Z".into());
    m.turn_id = Some("u1".into());
    m.model = Some("ignored".into());
    assert_eq!(session_messages::upsert(&pool, &m).await.unwrap(), 1);
    let got = session_messages::get(&pool, "u1").await.unwrap().unwrap();
    assert_eq!(got.content.as_deref(), Some("new"));
    assert_eq!(got.sent_at.as_deref(), Some("2026-11-05T10:01:00Z"));
    assert_eq!(got.model, None, "model is not part of the upsert's SET");

    let mut other = m.clone();
    other.role = "assistant".into();
    other.content = "hijack".into();
    assert_eq!(session_messages::upsert(&pool, &other).await.unwrap(), 0);
    let got = session_messages::get(&pool, "u1").await.unwrap().unwrap();
    assert_eq!(got.content.as_deref(), Some("new"));
}

#[tokio::test]
async fn assistant_lookups_and_latest_sdk_message() {
    let pool = pool().await;
    session_messages::insert(
        &pool,
        &assistant("a1", "u1", "2026-11-05T10:00:01Z", Some("sdk-1")),
    )
    .await
    .unwrap();
    session_messages::insert(
        &pool,
        &assistant("a2", "u1", "2026-11-05T10:00:02Z", Some("sdk-2")),
    )
    .await
    .unwrap();
    session_messages::insert(&pool, &assistant("a3", "u1", "2026-11-05T10:00:03Z", None))
        .await
        .unwrap();
    assert_eq!(
        session_messages::latest_assistant_sdk_message_id(&pool, "s")
            .await
            .unwrap()
            .as_deref(),
        Some("sdk-2")
    );
    assert_eq!(
        session_messages::assistant_id_by_sdk_message_id(&pool, "s", "sdk-1")
            .await
            .unwrap()
            .as_deref(),
        Some("a1")
    );
    assert_eq!(
        session_messages::assistant_id_by_turn_content(&pool, "s", "u1", "reply a3")
            .await
            .unwrap()
            .as_deref(),
        Some("a3")
    );
    assert!(
        session_messages::assistant_id_by_turn_content(&pool, "s", "u2", "reply a3")
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn turns_content_and_compaction() {
    let pool = pool().await;
    let mut u = user("u1", "2026-11-05T10:00:00Z", Some("2026-11-05T10:00:00Z"));
    u.turn_id = None;
    session_messages::insert(&pool, &u).await.unwrap();
    session_messages::insert(
        &pool,
        &user("u2", "2026-11-05T10:01:00Z", Some("2026-11-05T10:01:00Z")),
    )
    .await
    .unwrap();
    assert!(session_messages::adopt_own_turn(&pool, "s", "u1")
        .await
        .unwrap());
    assert!(!session_messages::adopt_own_turn(&pool, "s", "u1")
        .await
        .unwrap());
    assert_eq!(
        session_messages::current_turn_id(&pool, "s")
            .await
            .unwrap()
            .as_deref(),
        Some("u2")
    );
    assert!(session_messages::turn_exists(&pool, "s", "u1")
        .await
        .unwrap());
    assert!(!session_messages::turn_exists(&pool, "s", "zz")
        .await
        .unwrap());

    session_messages::update_content(&pool, "s", "u2", "edited", Some("u2"))
        .await
        .unwrap();
    assert!(matches!(
        session_messages::update_content(&pool, "other", "u2", "x", None).await,
        Err(Error::NotFound)
    ));
    assert_eq!(
        session_messages::mark_compacted(&pool, "s").await.unwrap(),
        2
    );
    let m = session_messages::get(&pool, "u2").await.unwrap().unwrap();
    assert_eq!(m.content.as_deref(), Some("edited"));
    assert_eq!(m.last_assistant_message_id.as_deref(), Some(COMPACTED));
}

#[tokio::test]
async fn delete_after_watermark_keeps_queue() {
    let pool = pool().await;
    session_messages::insert(
        &pool,
        &user("u1", "2026-11-05T10:00:00Z", Some("2026-11-05T10:00:00Z")),
    )
    .await
    .unwrap();
    session_messages::insert(&pool, &assistant("a1", "u1", "2026-11-05T10:00:05Z", None))
        .await
        .unwrap();
    queue(&pool, "q1", "2026-11-05T10:00:09Z").await;
    assert_eq!(
        session_messages::delete_after(&pool, "s", "2026-11-05T10:00:01Z")
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        ids(session_messages::list_sent(&pool, "s").await.unwrap()),
        ["u1"]
    );
    assert_eq!(
        ids(session_messages::list_queued(&pool, "s").await.unwrap()),
        ["q1"]
    );
}
