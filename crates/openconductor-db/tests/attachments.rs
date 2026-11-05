use openconductor_db::attachments::{self, NewAttachment};
use openconductor_db::open_in_memory;
use openconductor_db::session_messages::{self, NewMessage};
use sqlx::SqlitePool;

async fn pool() -> SqlitePool {
    open_in_memory().await.unwrap()
}

fn draft(id: &str, session: &str) -> NewAttachment {
    NewAttachment {
        id: id.into(),
        kind: "image".into(),
        original_name: format!("{id}.png"),
        path: format!("/tmp/{id}.png"),
        is_loading: false,
        is_draft: true,
        session_id: session.into(),
        session_message_id: None,
        comment_id: None,
    }
}

/// `created_at` defaults to `datetime('now')` (one-second resolution);
/// give each row a distinct time so `ORDER BY created_at` is deterministic.
async fn stamp(pool: &SqlitePool, id: &str, at: &str) {
    sqlx::query("UPDATE attachments SET created_at = ? WHERE id = ?")
        .bind(at)
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
}

async fn add(pool: &SqlitePool, a: NewAttachment, at: &str) {
    let id = a.id.clone();
    attachments::create(pool, &a).await.unwrap();
    stamp(pool, &id, at).await;
}

fn ids(v: Vec<attachments::Attachment>) -> Vec<String> {
    v.into_iter().map(|a| a.id).collect()
}

#[tokio::test]
async fn create_stores_flags_and_defaults() {
    let pool = pool().await;
    let mut a = draft("a", "s");
    a.is_loading = true;
    let got = attachments::create(&pool, &a).await.unwrap();
    assert!(got.is_draft && got.is_loading);
    assert_eq!(got.kind.as_deref(), Some("image"));
    assert_eq!(got.original_name.as_deref(), Some("a.png"));
    assert!(!got.created_at.is_empty());
    assert!(attachments::get(&pool, "other", "a")
        .await
        .unwrap()
        .is_none());

    assert!(attachments::finalize_path(&pool, "s", "a", "/store/a.png")
        .await
        .unwrap());
    assert!(!attachments::finalize_path(&pool, "s", "zz", "/x")
        .await
        .unwrap());
    let got = attachments::get(&pool, "s", "a").await.unwrap().unwrap();
    assert_eq!(got.path.as_deref(), Some("/store/a.png"));
    assert!(!got.is_loading);
}

#[tokio::test]
async fn send_promotes_all_drafts_and_restore_reverts() {
    let pool = pool().await;
    add(&pool, draft("b", "s"), "2026-11-05 10:00:02").await;
    add(&pool, draft("a", "s"), "2026-11-05 10:00:01").await;
    add(&pool, draft("x", "s2"), "2026-11-05 10:00:00").await;
    assert_eq!(
        ids(attachments::list_drafts(&pool, "s").await.unwrap()),
        ["a", "b"]
    );

    attachments::mark_drafts_sent(&pool, "s", "m1", None)
        .await
        .unwrap();
    assert!(attachments::list_drafts(&pool, "s")
        .await
        .unwrap()
        .is_empty());
    let on_message = attachments::list_for_message(&pool, "m1").await.unwrap();
    assert_eq!(ids(on_message.clone()), ["a", "b"]);
    assert!(on_message.iter().all(|a| !a.is_draft));
    assert_eq!(
        ids(attachments::list_drafts(&pool, "s2").await.unwrap()),
        ["x"]
    );

    assert_eq!(
        attachments::restore_to_draft(&pool, "s", "m1")
            .await
            .unwrap(),
        2
    );
    assert!(attachments::list_for_message(&pool, "m1")
        .await
        .unwrap()
        .is_empty());
    assert_eq!(
        ids(attachments::list_drafts(&pool, "s").await.unwrap()),
        ["a", "b"]
    );
}

#[tokio::test]
async fn send_with_ids_keeps_exactly_those_on_the_message() {
    let pool = pool().await;
    add(&pool, draft("a", "s"), "2026-11-05 10:00:01").await;
    add(&pool, draft("b", "s"), "2026-11-05 10:00:02").await;
    let mut stale = draft("old", "s");
    stale.is_draft = false;
    stale.session_message_id = Some("m1".into());
    add(&pool, stale, "2026-11-05 10:00:00").await;

    attachments::mark_drafts_sent(&pool, "s", "m1", Some(&["a".into()]))
        .await
        .unwrap();
    assert_eq!(
        ids(attachments::list_for_message(&pool, "m1").await.unwrap()),
        ["a"]
    );
    assert_eq!(
        ids(attachments::list_drafts(&pool, "s").await.unwrap()),
        ["b"]
    );

    // An empty id list clears the message's attachments and leaves drafts.
    attachments::mark_drafts_sent(&pool, "s", "m1", Some(&[]))
        .await
        .unwrap();
    assert!(attachments::list_for_message(&pool, "m1")
        .await
        .unwrap()
        .is_empty());
    assert_eq!(
        ids(attachments::list_drafts(&pool, "s").await.unwrap()),
        ["b"]
    );
}

#[tokio::test]
async fn session_lists_include_message_attachments() {
    let pool = pool().await;
    session_messages::insert(
        &pool,
        &NewMessage {
            id: "m1".into(),
            session_id: "s".into(),
            role: "user".into(),
            content: "hi".into(),
            sent_at: Some("2026-11-05T10:00:00Z".into()),
            created_at: "2026-11-05T10:00:00Z".into(),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    // Filed under another session id but attached to one of s's messages.
    let mut moved = draft("on-msg", "elsewhere");
    moved.is_draft = false;
    moved.session_message_id = Some("m1".into());
    add(&pool, moved, "2026-11-05 10:00:01").await;
    add(&pool, draft("d", "s"), "2026-11-05 10:00:02").await;
    add(&pool, draft("other", "s2"), "2026-11-05 10:00:00").await;

    assert_eq!(
        ids(attachments::list_for_session(&pool, "s").await.unwrap()),
        ["on-msg", "d"]
    );
    assert_eq!(
        ids(attachments::list_sent_for_session(&pool, "s")
            .await
            .unwrap()),
        ["on-msg"]
    );
}

#[tokio::test]
async fn retarget_moves_only_listed_drafts() {
    let pool = pool().await;
    add(&pool, draft("a", "s1"), "2026-11-05 10:00:01").await;
    add(&pool, draft("b", "s1"), "2026-11-05 10:00:02").await;
    let mut sent = draft("c", "s1");
    sent.is_draft = false;
    add(&pool, sent, "2026-11-05 10:00:03").await;

    let ids_ab = ["a".to_string(), "c".to_string()];
    assert_eq!(
        attachments::retarget_drafts(&pool, &ids_ab, "s1", "s2")
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        ids(attachments::list_drafts(&pool, "s2").await.unwrap()),
        ["a"]
    );
    assert_eq!(
        ids(attachments::list_drafts(&pool, "s1").await.unwrap()),
        ["b"]
    );
    assert_eq!(
        attachments::retarget_drafts(&pool, &ids_ab, "s1", "s1")
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        attachments::retarget_drafts(&pool, &[], "s1", "s2")
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn delete_returns_the_row_and_respects_only_draft() {
    let pool = pool().await;
    let mut sent = draft("sent", "s");
    sent.is_draft = false;
    attachments::create(&pool, &sent).await.unwrap();
    attachments::create(&pool, &draft("d", "s")).await.unwrap();

    assert!(attachments::delete(&pool, "s", "sent", true)
        .await
        .unwrap()
        .is_none());
    let gone = attachments::delete(&pool, "s", "d", true)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(gone.id, "d");
    assert!(gone.is_draft);
    let gone = attachments::delete(&pool, "s", "sent", false)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(gone.id, "sent");
    assert!(attachments::delete(&pool, "s", "sent", false)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn review_comment_lookups() {
    let pool = pool().await;
    for (id, session, message) in [
        ("a", "s1", Some("m1")),
        ("b", "s2", None),
        ("c", "s1", Some("m2")),
    ] {
        let mut a = draft(id, session);
        a.kind = "review_comment".into();
        a.comment_id = Some(format!("cm-{id}"));
        a.session_message_id = message.map(Into::into);
        attachments::create(&pool, &a).await.unwrap();
    }
    sqlx::query("UPDATE attachments SET comment_id = 'cm-a' WHERE id = 'b'")
        .execute(&pool)
        .await
        .unwrap();
    let mut sessions = attachments::session_ids_for_comment(&pool, "cm-a")
        .await
        .unwrap();
    sessions.sort();
    assert_eq!(sessions, ["s1", "s2"]);

    let mut comments =
        attachments::comment_ids_for_messages(&pool, "s1", &["m1".into(), "m2".into()])
            .await
            .unwrap();
    comments.sort();
    assert_eq!(comments, ["cm-a", "cm-c"]);
    assert!(attachments::comment_ids_for_messages(&pool, "s1", &[])
        .await
        .unwrap()
        .is_empty());
}
