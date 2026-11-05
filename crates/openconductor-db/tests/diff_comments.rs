use openconductor_db::diff_comments::{self, Location, NewDiffComment, State};
use openconductor_db::{open_in_memory, Error};
use sqlx::SqlitePool;

fn comment(id: &str, line: Option<i64>) -> NewDiffComment {
    NewDiffComment {
        id: id.into(),
        workspace_id: "w".into(),
        file_path: "src/a.rs".into(),
        line_number: line,
        end_line_number: None,
        body: format!("  body {id}\n"),
        location: if line.is_some() {
            Location::Modified
        } else {
            Location::File
        },
        created_at: 100,
        author: None,
        reply_to: None,
    }
}

async fn pool() -> SqlitePool {
    open_in_memory().await.unwrap()
}

#[tokio::test]
async fn insert_stores_observed_values() {
    let pool = pool().await;
    let c = diff_comments::insert(&pool, &comment("c1", Some(12)))
        .await
        .unwrap();
    assert_eq!(c.state, Some(State::Pending));
    assert_eq!(c.location, Some(Location::Modified));
    assert_eq!(c.line_number, Some(12));
    assert_eq!(c.end_line_number, None);
    assert_eq!(c.body.as_deref(), Some("body c1"));
    assert_eq!(c.thread_id.as_deref(), Some("c1"));
    assert!(!c.is_outdated && !c.is_resolved && !c.is_file_level());

    let raw: (String, String) =
        sqlx::query_as("SELECT state, location FROM diff_comments WHERE id = 'c1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(raw, ("pending".into(), "modified".into()));
}

#[tokio::test]
async fn file_level_comment_has_null_line() {
    let pool = pool().await;
    let mut n = comment("f", None);
    n.end_line_number = Some(9);
    let c = diff_comments::insert(&pool, &n).await.unwrap();
    assert!(c.is_file_level());
    assert_eq!((c.line_number, c.end_line_number), (None, None));
    let raw: (String, bool) =
        sqlx::query_as("SELECT location, line_number IS NULL FROM diff_comments WHERE id = 'f'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(raw, ("file".into(), true));
}

#[tokio::test]
async fn ranges_are_ordered_and_collapsed() {
    let pool = pool().await;
    let mut n = comment("r", Some(20));
    n.end_line_number = Some(14);
    let c = diff_comments::insert(&pool, &n).await.unwrap();
    assert_eq!((c.line_number, c.end_line_number), (Some(14), Some(20)));
    let mut n = comment("s", Some(5));
    n.end_line_number = Some(5);
    let c = diff_comments::insert(&pool, &n).await.unwrap();
    assert_eq!((c.line_number, c.end_line_number), (Some(5), None));
}

#[tokio::test]
async fn replies_join_the_root_thread() {
    let pool = pool().await;
    diff_comments::insert(&pool, &comment("root", Some(3)))
        .await
        .unwrap();
    let mut r1 = comment("r1", Some(3));
    r1.reply_to = Some("root".into());
    r1.created_at = 200;
    let r1 = diff_comments::insert(&pool, &r1).await.unwrap();
    let mut r2 = comment("r2", Some(3));
    r2.reply_to = Some("r1".into());
    r2.created_at = 300;
    let r2 = diff_comments::insert(&pool, &r2).await.unwrap();
    assert_eq!(r1.thread_id.as_deref(), Some("root"));
    assert_eq!(r2.thread_id.as_deref(), Some("root"));
    assert_eq!(r2.reply_to_comment_id.as_deref(), Some("r1"));

    let ids: Vec<_> = diff_comments::list_for_workspace(&pool, "w")
        .await
        .unwrap()
        .into_iter()
        .map(|c| c.id)
        .collect();
    assert_eq!(ids, ["root", "r1", "r2"]);
    assert!(diff_comments::list_for_workspace(&pool, "other")
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn edit_resolve_send_and_outdate() {
    let pool = pool().await;
    diff_comments::insert(&pool, &comment("a", Some(1)))
        .await
        .unwrap();
    let mut reply = comment("b", Some(1));
    reply.reply_to = Some("a".into());
    diff_comments::insert(&pool, &reply).await.unwrap();

    diff_comments::update_body(&pool, "a", " new text ", 500)
        .await
        .unwrap();
    let a = diff_comments::get(&pool, "a").await.unwrap().unwrap();
    assert_eq!(
        (a.body.as_deref(), a.updated_at),
        (Some("new text"), Some(500))
    );
    assert!(matches!(
        diff_comments::update_body(&pool, "missing", "x", 1).await,
        Err(Error::NotFound)
    ));

    assert_eq!(
        diff_comments::set_thread_resolved(&pool, "a", true, 600)
            .await
            .unwrap(),
        2
    );
    assert!(diff_comments::list_for_workspace(&pool, "w")
        .await
        .unwrap()
        .iter()
        .all(|c| c.is_resolved));
    diff_comments::set_thread_resolved(&pool, "a", false, 700)
        .await
        .unwrap();
    assert!(
        !diff_comments::get(&pool, "b")
            .await
            .unwrap()
            .unwrap()
            .is_resolved
    );

    assert_eq!(
        diff_comments::mark_sent(&pool, &["a".into()], 800)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        diff_comments::get(&pool, "a").await.unwrap().unwrap().state,
        Some(State::Sent)
    );
    assert_eq!(
        diff_comments::get(&pool, "b").await.unwrap().unwrap().state,
        Some(State::Pending)
    );

    diff_comments::set_outdated(&pool, "a", true).await.unwrap();
    assert!(
        diff_comments::get(&pool, "a")
            .await
            .unwrap()
            .unwrap()
            .is_outdated
    );
}

#[tokio::test]
async fn delete_reply_keeps_thread_and_delete_root_drops_it() {
    let pool = pool().await;
    diff_comments::insert(&pool, &comment("root", Some(3)))
        .await
        .unwrap();
    for id in ["r1", "r2"] {
        let mut r = comment(id, Some(3));
        r.reply_to = Some("root".into());
        diff_comments::insert(&pool, &r).await.unwrap();
    }
    diff_comments::insert(&pool, &comment("other", Some(8)))
        .await
        .unwrap();

    assert_eq!(diff_comments::delete(&pool, "r1").await.unwrap(), 1);
    assert_eq!(diff_comments::delete(&pool, "root").await.unwrap(), 2);
    let left: Vec<_> = diff_comments::list_for_workspace(&pool, "w")
        .await
        .unwrap()
        .into_iter()
        .map(|c| c.id)
        .collect();
    assert_eq!(left, ["other"]);
    assert_eq!(
        diff_comments::delete_for_workspace(&pool, "w")
            .await
            .unwrap(),
        1
    );
}

#[tokio::test]
async fn reads_reference_rows_with_null_flags() {
    let pool = pool().await;
    sqlx::query(
        "INSERT INTO diff_comments (id, workspace_id, file_path, body, state, location, created_at) \
         VALUES ('x', 'w', 'a.ts', 'hi', 'pending', 'file', 1)",
    )
    .execute(&pool)
    .await
    .unwrap();
    let c = diff_comments::get(&pool, "x").await.unwrap().unwrap();
    assert!(c.is_file_level() && !c.is_outdated && !c.is_resolved);
    assert_eq!(c.thread_id, None);
    assert_eq!(
        diff_comments::set_thread_resolved(&pool, "x", true, 2)
            .await
            .unwrap(),
        1
    );
    assert_eq!(diff_comments::delete(&pool, "x").await.unwrap(), 1);
}
