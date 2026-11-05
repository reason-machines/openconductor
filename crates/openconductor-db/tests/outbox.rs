use openconductor_db::outbox::{
    self, AssetPatch, AssetState, MessagePatch, MessageState, Mode, NewAsset, NewMessage,
    MAX_SEND_ATTEMPTS,
};
use openconductor_db::{iso_time, open_in_memory};

const NOW: i64 = 1_793_880_000_000;

fn msg(id: &str, session: &str, order: Option<i64>, created: &str) -> NewMessage {
    NewMessage {
        message_id: id.into(),
        session_id: session.into(),
        delivery_payload: r#"{"message":"hi"}"#.into(),
        config: "{}".into(),
        mode: Mode::Queue,
        asset_ids: "[]".into(),
        queue_order: order,
        state: MessageState::Ready,
        send_attempt_count: 0,
        next_send_attempt_at: None,
        last_error: None,
        created_at: created.into(),
    }
}

fn asset(id: &str, uploaded: bool) -> NewAsset {
    NewAsset {
        attachment_id: id.into(),
        source_ref: Some(format!("draft/{id}")),
        original_name: Some(format!("{id}.png")),
        asset_id: None,
        relative_path: None,
        uploaded,
    }
}

#[test]
fn retry_delay_doubles_from_two_seconds_to_a_minute() {
    let delays: Vec<i64> = (0..=8).map(outbox::retry_delay_ms).collect();
    assert_eq!(
        delays,
        [2_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000]
    );
    assert_eq!(outbox::retry_delay_ms(i64::MAX), 60_000);
}

#[tokio::test]
async fn enqueue_lists_in_queue_order_and_ignores_duplicates() {
    let pool = open_in_memory().await.unwrap();
    let t = |s| format!("2026-11-05T12:00:0{s}.000Z");
    assert!(
        outbox::enqueue(&pool, &msg("m3", "s1", Some(2), &t(1)), &[], NOW)
            .await
            .unwrap()
    );
    assert!(
        outbox::enqueue(&pool, &msg("m2", "s1", Some(1), &t(2)), &[], NOW)
            .await
            .unwrap()
    );
    assert!(
        outbox::enqueue(&pool, &msg("m1", "s1", None, &t(3)), &[], NOW)
            .await
            .unwrap()
    );
    assert!(
        outbox::enqueue(&pool, &msg("x", "s2", Some(1), &t(0)), &[], NOW)
            .await
            .unwrap()
    );
    let mut dup = msg("m1", "s2", Some(9), &t(9));
    dup.mode = Mode::Steer;
    assert!(!outbox::enqueue(&pool, &dup, &[], NOW).await.unwrap());

    let ids =
        |v: Vec<outbox::OutboxMessage>| v.into_iter().map(|m| m.message_id).collect::<Vec<_>>();
    assert_eq!(
        ids(outbox::list_for_session(&pool, "s1").await.unwrap()),
        ["m1", "m2", "m3"]
    );
    assert_eq!(
        ids(outbox::list_all(&pool).await.unwrap()),
        ["m1", "x", "m2", "m3"]
    );

    let m1 = outbox::get(&pool, "m1").await.unwrap().unwrap();
    assert_eq!(
        m1.session_id.as_deref(),
        Some("s1"),
        "INSERT OR IGNORE kept the first row"
    );
    assert_eq!(m1.mode, Mode::Queue);
    assert_eq!(m1.state, MessageState::Ready);
    assert!(m1.readable);
    assert_eq!(
        m1.updated_at.as_deref(),
        Some(iso_time::from_millis(NOW).as_str())
    );
    assert_eq!(outbox::get(&pool, "nope").await.unwrap(), None);
}

#[tokio::test]
async fn unreadable_rows_and_unknown_values_read_as_failed() {
    let pool = open_in_memory().await.unwrap();
    let mut bad = msg("bad", "s", None, "t");
    bad.config = "[1]".into();
    outbox::enqueue(&pool, &bad, &[], NOW).await.unwrap();
    let mut broken = msg("broken", "s", None, "t");
    broken.asset_ids = "not json".into();
    outbox::enqueue(&pool, &broken, &[], NOW).await.unwrap();
    outbox::enqueue(&pool, &msg("odd", "s", None, "t"), &[], NOW)
        .await
        .unwrap();
    sqlx::query("UPDATE session_messages_outbox SET state = 'weird', mode = 'other' WHERE message_id = 'odd'")
        .execute(&pool)
        .await
        .unwrap();

    for id in ["bad", "broken"] {
        let m = outbox::get(&pool, id).await.unwrap().unwrap();
        assert!(!m.readable, "{id}");
        assert_eq!(m.state, MessageState::Failed, "{id}");
    }
    let odd = outbox::get(&pool, "odd").await.unwrap().unwrap();
    assert!(odd.readable);
    assert_eq!(odd.state, MessageState::Failed);
    assert_eq!(odd.mode, Mode::Queue);
}

#[tokio::test]
async fn patch_sets_only_given_columns_and_empty_patch_writes_nothing() {
    let pool = open_in_memory().await.unwrap();
    outbox::enqueue(&pool, &msg("m", "s", Some(1), "t"), &[], NOW)
        .await
        .unwrap();
    outbox::update_message(&pool, "m", &MessagePatch::default(), NOW + 5)
        .await
        .unwrap();
    let m = outbox::get(&pool, "m").await.unwrap().unwrap();
    assert_eq!(m.updated_at, Some(iso_time::from_millis(NOW)));

    let patch = MessagePatch {
        mode: Some(Mode::Steer),
        queue_order: Some(7),
        next_send_attempt_at: Some(Some("later".into())),
        last_error: Some(Some(r#"{"userMessage":"x"}"#.into())),
        ..Default::default()
    };
    outbox::update_message(&pool, "m", &patch, NOW + 5)
        .await
        .unwrap();
    let m = outbox::get(&pool, "m").await.unwrap().unwrap();
    assert_eq!((m.mode, m.queue_order), (Mode::Steer, Some(7)));
    assert_eq!(m.next_send_attempt_at.as_deref(), Some("later"));
    assert_eq!(
        m.delivery_payload.as_deref(),
        Some(r#"{"message":"hi"}"#),
        "untouched"
    );
    assert_eq!(m.updated_at, Some(iso_time::from_millis(NOW + 5)));

    let clear = MessagePatch {
        next_send_attempt_at: Some(None),
        last_error: Some(None),
        ..Default::default()
    };
    outbox::update_message(&pool, "m", &clear, NOW + 6)
        .await
        .unwrap();
    let m = outbox::get(&pool, "m").await.unwrap().unwrap();
    assert_eq!((m.next_send_attempt_at, m.last_error), (None, None));
}

#[tokio::test]
async fn claim_fail_with_backoff_then_fail_terminally_and_retry() {
    let pool = open_in_memory().await.unwrap();
    outbox::enqueue(&pool, &msg("m", "s", None, "t"), &[], NOW)
        .await
        .unwrap();

    let m = outbox::get(&pool, "m").await.unwrap().unwrap();
    outbox::mark_sending(&pool, &m, NOW).await.unwrap();
    let m = outbox::get(&pool, "m").await.unwrap().unwrap();
    assert_eq!((m.state, m.send_attempt_count), (MessageState::Sending, 1));

    let state = outbox::record_send_failure(&pool, &m, r#"{"userMessage":"down"}"#, NOW)
        .await
        .unwrap();
    assert_eq!(state, MessageState::Ready);
    let m = outbox::get(&pool, "m").await.unwrap().unwrap();
    assert_eq!(m.send_attempt_count, 2);
    assert_eq!(
        m.next_send_attempt_at,
        Some(iso_time::from_millis(NOW + 4_000))
    );
    assert_eq!(m.last_error.as_deref(), Some(r#"{"userMessage":"down"}"#));

    // Claiming again keeps the count already recorded.
    outbox::mark_sending(&pool, &m, NOW).await.unwrap();
    assert_eq!(
        outbox::get(&pool, "m")
            .await
            .unwrap()
            .unwrap()
            .send_attempt_count,
        2
    );

    outbox::update_message(
        &pool,
        "m",
        &MessagePatch {
            send_attempt_count: Some(MAX_SEND_ATTEMPTS - 1),
            ..Default::default()
        },
        NOW,
    )
    .await
    .unwrap();
    let m = outbox::get(&pool, "m").await.unwrap().unwrap();
    let state = outbox::record_send_failure(&pool, &m, "{}", NOW)
        .await
        .unwrap();
    assert_eq!(state, MessageState::Failed);
    let m = outbox::get(&pool, "m").await.unwrap().unwrap();
    assert_eq!(
        (m.state, m.send_attempt_count),
        (MessageState::Failed, MAX_SEND_ATTEMPTS)
    );
    assert_eq!(m.next_send_attempt_at, None);

    outbox::retry(&pool, "m", NOW + 1).await.unwrap();
    let m = outbox::get(&pool, "m").await.unwrap().unwrap();
    assert_eq!((m.state, m.send_attempt_count), (MessageState::Ready, 0));
    assert_eq!((m.next_send_attempt_at, m.last_error), (None, None));
}

#[tokio::test]
async fn assets_enqueue_update_replace_and_reset() {
    let pool = open_in_memory().await.unwrap();
    sqlx::query("INSERT INTO attachments (id, comment_id) VALUES ('a1', 'c1')")
        .execute(&pool)
        .await
        .unwrap();
    let mut m = msg("m", "s", None, "t");
    m.state = MessageState::Uploading;
    outbox::enqueue(&pool, &m, &[asset("a2", true), asset("a1", false)], NOW)
        .await
        .unwrap();

    let assets = outbox::assets_for_message(&pool, "m").await.unwrap();
    assert_eq!(
        assets
            .iter()
            .map(|a| (a.attachment_id.as_str(), a.state))
            .collect::<Vec<_>>(),
        [("a1", AssetState::Pending), ("a2", AssetState::Uploaded)],
        "same created_at, then by attachment_id"
    );
    assert_eq!(assets[0].comment_id.as_deref(), Some("c1"));
    assert!(outbox::has_pending_assets(&pool, "m").await.unwrap());

    outbox::update_asset(
        &pool,
        "a1",
        &AssetPatch {
            state: Some(AssetState::Failed),
            upload_attempt_count: Some(1),
            last_error: Some(Some("{}".into())),
            ..Default::default()
        },
        NOW + 1,
    )
    .await
    .unwrap();
    outbox::reset_assets_for_retry(&pool, "m", NOW + 2)
        .await
        .unwrap();
    let a1 = &outbox::assets_for_message(&pool, "m").await.unwrap()[0];
    assert_eq!(
        (a1.state, a1.upload_attempt_count),
        (AssetState::Pending, 0)
    );
    assert_eq!(a1.last_error, None);
    let a2 = &outbox::assets_for_message(&pool, "m").await.unwrap()[1];
    assert_eq!(
        a2.updated_at,
        Some(iso_time::from_millis(NOW)),
        "uploaded rows untouched"
    );

    outbox::update_asset(
        &pool,
        "a1",
        &AssetPatch {
            state: Some(AssetState::Uploaded),
            asset_id: Some("asset-1".into()),
            relative_path: Some("uploads/a1.png".into()),
            ..Default::default()
        },
        NOW + 3,
    )
    .await
    .unwrap();
    assert!(!outbox::has_pending_assets(&pool, "m").await.unwrap());

    // Replacing keeps a3 and a2 (overwritten as pending again), drops a1.
    outbox::replace_assets(
        &pool,
        "m",
        &[asset("a3", false), asset("a2", false)],
        NOW + 4,
    )
    .await
    .unwrap();
    let ids: Vec<String> = outbox::assets_for_message(&pool, "m")
        .await
        .unwrap()
        .into_iter()
        .map(|a| a.attachment_id)
        .collect();
    assert_eq!(ids, ["a2", "a3"]);
    outbox::replace_assets(&pool, "m", &[], NOW + 5)
        .await
        .unwrap();
    assert!(outbox::assets_for_message(&pool, "m")
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn delete_removes_messages_with_their_assets() {
    let pool = open_in_memory().await.unwrap();
    for id in ["m1", "m2", "m3"] {
        outbox::enqueue(
            &pool,
            &msg(id, "s", None, "t"),
            &[asset(&format!("{id}-a"), false)],
            NOW,
        )
        .await
        .unwrap();
    }
    outbox::delete_message(&pool, "m1").await.unwrap();
    outbox::delete_messages(&pool, &["m2".into()])
        .await
        .unwrap();
    outbox::delete_messages(&pool, &[]).await.unwrap();
    let left: Vec<String> = outbox::list_all(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|m| m.message_id)
        .collect();
    assert_eq!(left, ["m3"]);
    let assets: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM session_assets_outbox")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(assets, 1);
}

#[tokio::test]
async fn pause_and_resume_a_session() {
    let pool = open_in_memory().await.unwrap();
    assert!(!outbox::is_paused(&pool, "s").await.unwrap());
    outbox::set_paused(&pool, "s", true, NOW).await.unwrap();
    assert!(outbox::is_paused(&pool, "s").await.unwrap());
    assert!(!outbox::is_paused(&pool, "other").await.unwrap());
    outbox::set_paused(&pool, "s", false, NOW + 1)
        .await
        .unwrap();
    assert!(!outbox::is_paused(&pool, "s").await.unwrap());
    let rows: Vec<(Option<String>, String)> =
        sqlx::query_as("SELECT paused_at, updated_at FROM session_messages_outbox_state")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(rows, [(None, iso_time::from_millis(NOW + 1))]);
}
