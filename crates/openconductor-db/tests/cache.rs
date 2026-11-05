use std::cell::RefCell;

use openconductor_db::cache::now_iso;
use openconductor_db::cache::pending_messages::{self, PendingMessage, PendingSnapshot};
use openconductor_db::cache::session_messages::{self, CachedMessage, CatchUp};
use openconductor_db::cache::session_state::{self, PrimaryWatermark, CACHE_VERSION};
use openconductor_db::navigation::{self, Layout, LayoutSection};
use openconductor_db::{
    favorite_models, iso_time, open_cache, open_cache_in_memory, Scope, SqlitePool,
};

const T1: &str = "2026-11-05T10:00:00.000Z";
const T2: &str = "2026-11-05T11:00:00.000Z";

fn msg(id: &str, rowid: Option<i64>, sent_at: Option<&str>) -> CachedMessage {
    CachedMessage {
        id: id.into(),
        session_id: "s".into(),
        role: Some("user".into()),
        content: Some(format!("content {id}")),
        sent_at: sent_at.map(Into::into),
        source_rowid: rowid,
        ..Default::default()
    }
}

/// A stand-in for `conductor.db`'s settled rows of session `s`.
fn primary(n: i64) -> Vec<CachedMessage> {
    (1..=n)
        .map(|i| {
            msg(
                &format!("m{i}"),
                Some(i),
                Some(&format!("2026-11-05T10:00:{i:02}.000Z")),
            )
        })
        .collect()
}

fn watermark(rows: &[CachedMessage]) -> PrimaryWatermark {
    PrimaryWatermark {
        primary_max_rowid: rows
            .iter()
            .filter_map(|m| m.source_rowid)
            .max()
            .unwrap_or(0),
        primary_message_count: rows.len() as i64,
    }
}

async fn ids(pool: &SqlitePool) -> Vec<String> {
    session_messages::settled(pool, "s")
        .await
        .unwrap()
        .rows
        .into_iter()
        .map(|r| r.message.id)
        .collect()
}

#[test]
fn now_is_an_iso_time() {
    let now = now_iso();
    assert!(now.ends_with('Z') && now.len() == 24, "{now}");
    assert!(iso_time::to_millis(&now).is_some());
}

#[tokio::test]
async fn open_cache_creates_file() {
    let dir = std::env::temp_dir().join(format!("oc-cache-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("cache.db");
    let _ = std::fs::remove_file(&file);
    let pool = open_cache(&file).await.unwrap();
    session_state::touch(&pool, "s", T1).await.unwrap();
    drop(pool);
    let pool = open_cache(&file).await.unwrap();
    assert_eq!(
        session_state::transcript_revision(&pool, "s")
            .await
            .unwrap(),
        Some(1)
    );
    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn touch_creates_then_bumps_revision_keeping_first_written() {
    let pool = open_cache_in_memory().await.unwrap();
    assert_eq!(
        session_state::transcript_revision(&pool, "s")
            .await
            .unwrap(),
        None
    );
    session_state::touch(&pool, "s", T1).await.unwrap();
    session_state::touch(&pool, "s", T2).await.unwrap();
    let snap = session_state::snapshot(&pool, "s").await.unwrap().unwrap();
    assert_eq!(snap.cache_revision, Some(2));
    assert_eq!(snap.cache_version, Some(CACHE_VERSION));
    assert_eq!(snap.first_written_at.as_deref(), Some(T1));
    assert_eq!(snap.last_modified_at.as_deref(), Some(T2));
    assert_eq!(snap.feed_offset, None);
}

#[tokio::test]
async fn feed_offset_defaults_to_minus_one_and_round_trips() {
    let pool = open_cache_in_memory().await.unwrap();
    assert_eq!(session_state::feed_offset(&pool, "s").await.unwrap(), -1);
    session_state::set_feed_offset(&pool, "s", Some(42), T1)
        .await
        .unwrap();
    assert_eq!(session_state::feed_offset(&pool, "s").await.unwrap(), 42);
    session_state::set_feed_offset(&pool, "s", None, T2)
        .await
        .unwrap();
    assert_eq!(session_state::feed_offset(&pool, "s").await.unwrap(), -1);
    let snap = session_state::snapshot(&pool, "s").await.unwrap().unwrap();
    assert_eq!(snap.first_written_at.as_deref(), Some(T1));
    // Setting the offset does not count as a transcript write.
    assert_eq!(snap.cache_revision, None);
}

#[tokio::test]
async fn record_read_only_touches_existing_rows() {
    let pool = open_cache_in_memory().await.unwrap();
    session_state::record_read(&pool, "s", T1).await.unwrap();
    assert!(session_state::snapshot(&pool, "s").await.unwrap().is_none());
    session_state::touch(&pool, "s", T1).await.unwrap();
    session_state::record_read(&pool, "s", T2).await.unwrap();
    // The reference never reads last_read_at back; check the column itself.
    let read: Option<String> = sqlx::query_scalar(
        "SELECT last_read_at FROM client_cache_session_state WHERE session_id = ?",
    )
    .bind("s")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(read.as_deref(), Some(T2));
}

#[tokio::test]
async fn invalidate_drops_mirror_of_other_versions() {
    let pool = open_cache_in_memory().await.unwrap();
    // No state row: invalidated (and nothing to drop).
    assert!(session_state::invalidate_if_stale(&pool, "s")
        .await
        .unwrap());
    session_messages::upsert(&pool, &msg("a", Some(1), Some(T1)), T1)
        .await
        .unwrap();
    assert!(!session_state::invalidate_if_stale(&pool, "s")
        .await
        .unwrap());
    assert_eq!(ids(&pool).await, ["a"]);

    sqlx::query("UPDATE client_cache_session_state SET cache_version = 0")
        .execute(&pool)
        .await
        .unwrap();
    assert!(session_state::invalidate_if_stale(&pool, "s")
        .await
        .unwrap());
    assert!(ids(&pool).await.is_empty());
    assert!(session_state::snapshot(&pool, "s").await.unwrap().is_none());
}

#[tokio::test]
async fn upsert_replaces_by_id_and_bumps_revision() {
    let pool = open_cache_in_memory().await.unwrap();
    let mut m = msg("a", Some(1), Some(T1));
    session_messages::upsert(&pool, &m, T1).await.unwrap();
    m.content = Some("edited".into());
    session_messages::upsert(&pool, &m, T2).await.unwrap();
    let t = session_messages::settled(&pool, "s").await.unwrap();
    assert_eq!(t.revision, Some(2));
    assert_eq!(t.rows.len(), 1);
    // The paged read does not select source_rowid (the reference's columns).
    let expected = CachedMessage {
        source_rowid: None,
        ..m
    };
    assert_eq!(t.rows[0].message, expected);
}

#[tokio::test]
async fn settled_skips_unsent_and_orders_by_sent_at_then_rowid() {
    let pool = open_cache_in_memory().await.unwrap();
    for m in [
        msg("late", Some(3), Some(T2)),
        msg("pending", None, None),
        msg("early-b", Some(2), Some(T1)),
        msg("early-a", Some(1), Some(T1)),
    ] {
        session_messages::upsert(&pool, &m, T1).await.unwrap();
    }
    // Same sent_at: insertion (cache rowid) order breaks the tie.
    assert_eq!(ids(&pool).await, ["early-b", "early-a", "late"]);
}

#[tokio::test]
async fn settled_pages_past_page_size() {
    let pool = open_cache_in_memory().await.unwrap();
    let n = session_messages::PAGE_SIZE + 3;
    for i in 0..n {
        // Half share one sent_at so the (sent_at, rowid) cursor must break ties.
        let sent = if i % 2 == 0 {
            T1.to_string()
        } else {
            iso_time::from_millis(i)
        };
        session_messages::upsert(
            &pool,
            &msg(&format!("m{i:04}"), Some(i + 1), Some(&sent)),
            T1,
        )
        .await
        .unwrap();
    }
    let t = session_messages::settled(&pool, "s").await.unwrap();
    assert_eq!(t.rows.len() as i64, n);
    let mut seen: Vec<_> = t.rows.iter().map(|r| r.message.id.clone()).collect();
    seen.sort();
    seen.dedup();
    assert_eq!(seen.len() as i64, n);
    let first = session_messages::settled_page(&pool, "s", None, 2)
        .await
        .unwrap();
    let last = &first[1];
    let next = session_messages::settled_page(
        &pool,
        "s",
        Some((last.message.sent_at.as_deref().unwrap(), last.cache_rowid)),
        1,
    )
    .await
    .unwrap();
    assert_eq!(next[0].message.id, t.rows[2].message.id);
}

#[tokio::test]
async fn delete_mirrored_keeps_client_written_rows() {
    let pool = open_cache_in_memory().await.unwrap();
    session_messages::upsert(&pool, &msg("mirrored", Some(1), Some(T1)), T1)
        .await
        .unwrap();
    session_messages::upsert(&pool, &msg("client", None, Some(T2)), T1)
        .await
        .unwrap();
    assert_eq!(
        session_messages::count_mirrored(&pool, "s").await.unwrap(),
        1
    );
    session_messages::delete_mirrored(&pool, "s").await.unwrap();
    assert_eq!(ids(&pool).await, ["client"]);
}

#[tokio::test]
async fn catch_up_appends_then_is_current() {
    let pool = open_cache_in_memory().await.unwrap();
    let rows = primary(3);
    let fetched = RefCell::new(Vec::new());
    let two = &rows[..2];
    let r = session_messages::catch_up(&pool, "s", watermark(two), T1, |after| {
        fetched.borrow_mut().push(after);
        let out: Vec<_> = two
            .iter()
            .filter(|m| m.source_rowid.unwrap() > after)
            .cloned()
            .collect();
        async move { Ok(out) }
    })
    .await
    .unwrap();
    assert_eq!(r, CatchUp::Appended);
    let r = session_messages::catch_up(&pool, "s", watermark(&rows), T2, |after| {
        fetched.borrow_mut().push(after);
        let out: Vec<_> = rows
            .iter()
            .filter(|m| m.source_rowid.unwrap() > after)
            .cloned()
            .collect();
        async move { Ok(out) }
    })
    .await
    .unwrap();
    assert_eq!(r, CatchUp::Appended);
    // Second catch-up read only past the recorded max rowid.
    assert_eq!(*fetched.borrow(), [0, 2]);
    assert_eq!(ids(&pool).await, ["m1", "m2", "m3"]);
    assert_eq!(
        session_state::primary_watermark(&pool, "s").await.unwrap(),
        watermark(&rows)
    );
    let r = session_messages::catch_up(&pool, "s", watermark(&rows), T2, |_| async {
        panic!("no fetch when current")
    })
    .await
    .unwrap();
    assert_eq!(r, CatchUp::Current);
}

#[tokio::test]
async fn catch_up_rebuilds_when_primary_shrank_or_count_disagrees() {
    let pool = open_cache_in_memory().await.unwrap();
    let rows = primary(3);
    session_messages::rebuild(&pool, "s", &rows, T1)
        .await
        .unwrap();
    assert_eq!(
        session_state::primary_watermark(&pool, "s").await.unwrap(),
        watermark(&rows)
    );

    // m2 deleted in the primary: count shrank, refill from 0.
    let kept: Vec<_> = rows.iter().filter(|m| m.id != "m2").cloned().collect();
    let r = session_messages::catch_up(&pool, "s", watermark(&kept), T2, |after| {
        assert_eq!(after, 0);
        let out = kept.clone();
        async move { Ok(out) }
    })
    .await
    .unwrap();
    assert_eq!(r, CatchUp::Rebuilt);
    assert_eq!(ids(&pool).await, ["m1", "m3"]);

    // A mirrored row lost behind the watermark: appending leaves the count
    // short, so the mirror is cleared and refilled.
    let mut more = kept.clone();
    more.push(msg("m4", Some(4), Some("2026-11-05T10:00:04.000Z")));
    sqlx::query("DELETE FROM session_messages WHERE id = 'm1'")
        .execute(&pool)
        .await
        .unwrap();
    let calls = RefCell::new(Vec::new());
    let r = session_messages::catch_up(&pool, "s", watermark(&more), T2, |after| {
        calls.borrow_mut().push(after);
        let out: Vec<_> = more
            .iter()
            .filter(|m| m.source_rowid.unwrap() > after)
            .cloned()
            .collect();
        async move { Ok(out) }
    })
    .await
    .unwrap();
    assert_eq!(r, CatchUp::Rebuilt);
    assert_eq!(*calls.borrow(), [3, 0]);
    assert_eq!(ids(&pool).await, ["m1", "m3", "m4"]);
}

#[tokio::test]
async fn rebuild_resets_state_and_keeps_client_rows() {
    let pool = open_cache_in_memory().await.unwrap();
    session_messages::upsert(&pool, &msg("old", Some(9), Some(T1)), T1)
        .await
        .unwrap();
    session_messages::upsert(&pool, &msg("client", None, Some(T2)), T1)
        .await
        .unwrap();
    session_state::set_feed_offset(&pool, "s", Some(7), T1)
        .await
        .unwrap();
    let rows = primary(2);
    session_messages::rebuild(&pool, "s", &rows, T2)
        .await
        .unwrap();
    assert_eq!(ids(&pool).await, ["m1", "m2", "client"]);
    let snap = session_state::snapshot(&pool, "s").await.unwrap().unwrap();
    // The state row was recreated: feed offset gone, revision restarted.
    assert_eq!(snap.feed_offset, None);
    assert_eq!(snap.cache_revision, Some(2));
    assert_eq!(snap.first_written_at.as_deref(), Some(T2));
}

fn pending(id: &str, position: i64) -> PendingMessage {
    PendingMessage {
        message_id: id.into(),
        delivery_payload: format!("{{\"message\":\"{id}\"}}"),
        config: Some("{}".into()),
        mode: "queue".into(),
        position,
        revision: 1,
        sender_id: Some("u".into()),
        received_at: Some(T1.into()),
    }
}

#[tokio::test]
async fn pending_snapshot_round_trips_in_position_order() {
    let pool = open_cache_in_memory().await.unwrap();
    assert_eq!(pending_messages::load(&pool, "s").await.unwrap(), None);
    let snap = PendingSnapshot {
        session_id: "s".into(),
        generation: 4,
        paused: true,
        messages: vec![pending("b", 1), pending("c", 0), pending("a", 1)],
    };
    pending_messages::store(&pool, &snap, T1).await.unwrap();
    let back = pending_messages::load(&pool, "s").await.unwrap().unwrap();
    assert_eq!(back.generation, 4);
    assert!(back.paused);
    let order: Vec<_> = back
        .messages
        .iter()
        .map(|m| m.message_id.as_str())
        .collect();
    assert_eq!(order, ["c", "a", "b"]);
    assert_eq!(back.messages[0], pending("c", 0));

    // Replaced whole: messages missing from the new snapshot are gone.
    let next = PendingSnapshot {
        session_id: "s".into(),
        generation: 5,
        paused: false,
        messages: vec![],
    };
    pending_messages::store(&pool, &next, T2).await.unwrap();
    assert_eq!(
        pending_messages::load(&pool, "s").await.unwrap().unwrap(),
        next
    );
}

#[tokio::test]
async fn pending_snapshot_of_other_version_is_cleared() {
    let pool = open_cache_in_memory().await.unwrap();
    let snap = PendingSnapshot {
        session_id: "s".into(),
        generation: 1,
        paused: false,
        messages: vec![pending("a", 0)],
    };
    pending_messages::store(&pool, &snap, T1).await.unwrap();
    sqlx::query("UPDATE session_pending_messages_state SET cache_version = 99")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(pending_messages::load(&pool, "s").await.unwrap(), None);
    let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM session_pending_messages")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 0);
    pending_messages::store(&pool, &snap, T1).await.unwrap();
    pending_messages::clear(&pool, "s").await.unwrap();
    assert_eq!(pending_messages::load(&pool, "s").await.unwrap(), None);
}

fn hosted(host: &str) -> Scope {
    Scope {
        hosting_server_url: Some(host.into()),
        organization_id: "org".into(),
        user_id: "me".into(),
    }
}

fn section(id: &str, name: &str, workspaces: &[&str]) -> LayoutSection {
    LayoutSection {
        id: id.into(),
        name: name.into(),
        emoji: None,
        workspace_ids: workspaces.iter().map(|w| w.to_string()).collect(),
    }
}

#[tokio::test]
async fn cache_navigation_is_scoped_by_hosting_server() {
    let pool = open_cache_in_memory().await.unwrap();
    let a = hosted("https://a.example");
    assert_eq!(navigation::read_layout(&pool, &a).await.unwrap(), None);
    let mut first = section("s1", "Focus", &["w1", "w2"]);
    first.emoji = Some("x".into());
    let layout = Layout {
        sections: vec![first, section("s2", "Later", &[])],
        updated_at: iso_time::to_millis(T1).unwrap(),
    };
    assert!(navigation::write_layout(&pool, &a, &layout).await.unwrap());
    // Members written together share created_at and come back in (random)
    // membership id order, as in the reference: compare them as sets.
    let mut back = navigation::read_layout(&pool, &a).await.unwrap().unwrap();
    for s in &mut back.sections {
        s.workspace_ids.sort();
    }
    assert_eq!(back, layout);
    let (rows, members) = navigation::read(&pool, &a).await.unwrap();
    assert!(rows.iter().all(
        |r| r.hosting_server_url.as_deref() == Some("https://a.example") && r.icon_name.is_none()
    ));
    assert_eq!(members.len(), 2);

    // Another hosting server, same organization and user, sees nothing.
    let b = hosted("https://b.example");
    assert_eq!(navigation::read_layout(&pool, &b).await.unwrap(), None);
    // An older layout is refused.
    let stale = Layout {
        sections: vec![],
        updated_at: iso_time::to_millis(T1).unwrap() - 1,
    };
    assert!(!navigation::write_layout(&pool, &a, &stale).await.unwrap());
    navigation::delete_layout(&pool, &a).await.unwrap();
    assert_eq!(navigation::read_layout(&pool, &a).await.unwrap(), None);
    assert!(navigation::read(&pool, &a).await.unwrap().1.is_empty());
}

#[tokio::test]
async fn cache_favorite_models_are_scoped_by_hosting_server() {
    let pool = open_cache_in_memory().await.unwrap();
    let a = hosted("https://a.example");
    let b = hosted("https://b.example");
    let fav = |id: &str, cfg: &str| (id.to_string(), cfg.to_string());
    let t1 = iso_time::to_millis(T1).unwrap();
    let t2 = iso_time::to_millis(T2).unwrap();
    favorite_models::replace(
        &pool,
        &a,
        &[fav("m1", "{\"model\":\"x\"}"), fav("m2", "{}")],
        t1,
    )
    .await
    .unwrap();
    favorite_models::replace(&pool, &b, &[fav("m9", "{}")], t1)
        .await
        .unwrap();
    favorite_models::replace(
        &pool,
        &a,
        &[fav("m3", "{}"), fav("m1", "{\"model\":\"y\"}")],
        t2,
    )
    .await
    .unwrap();
    let got: Vec<_> = favorite_models::list(&pool, &a)
        .await
        .unwrap()
        .into_iter()
        .map(|f| (f.id, f.configuration, f.created_at))
        .collect();
    assert_eq!(
        got,
        [
            ("m3".to_string(), "{}".to_string(), T2.to_string()),
            (
                "m1".to_string(),
                "{\"model\":\"y\"}".to_string(),
                T1.to_string()
            ),
        ]
    );
    assert_eq!(favorite_models::list(&pool, &b).await.unwrap().len(), 1);
    let host: Vec<Option<String>> =
        sqlx::query_scalar("SELECT DISTINCT hosting_server_url FROM favorite_models ORDER BY 1")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        host,
        [
            Some("https://a.example".to_string()),
            Some("https://b.example".to_string())
        ]
    );
    favorite_models::replace(&pool, &a, &[], t2).await.unwrap();
    assert!(favorite_models::list(&pool, &a).await.unwrap().is_empty());
}
