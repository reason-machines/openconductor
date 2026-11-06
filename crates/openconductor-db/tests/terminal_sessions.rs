use openconductor_db::open_in_memory;
use openconductor_db::terminal_sessions::{self, TerminalSession};

fn session(id: &str) -> TerminalSession {
    TerminalSession {
        session_id: id.into(),
        workspace_id: "w1".into(),
        started_at: "2026-11-05T12:00:00.000Z".into(),
        ended_at: None,
        cwd: Some("/tmp/project".into()),
        cols: 120,
        rows: 40,
        rehydrate_sequences: "\x1b[?2004h".into(),
        alternate_screen: false,
        bracketed_paste: true,
        has_received_user_input: true,
    }
}

#[tokio::test]
async fn upsert_then_get_round_trips() {
    let pool = open_in_memory().await.unwrap();
    let s = session("s1");
    terminal_sessions::upsert(&pool, &s).await.unwrap();
    assert_eq!(terminal_sessions::get(&pool, "s1").await.unwrap(), Some(s));
    assert_eq!(terminal_sessions::get(&pool, "other").await.unwrap(), None);
}

#[tokio::test]
async fn upsert_replaces_the_row() {
    let pool = open_in_memory().await.unwrap();
    terminal_sessions::upsert(&pool, &session("s1"))
        .await
        .unwrap();
    let mut later = session("s1");
    later.ended_at = Some("2026-11-05T12:30:00.000Z".into());
    later.cwd = None;
    later.alternate_screen = true;
    terminal_sessions::upsert(&pool, &later).await.unwrap();
    assert_eq!(
        terminal_sessions::get(&pool, "s1").await.unwrap(),
        Some(later)
    );
    let count: i64 = sqlx_count(&pool).await;
    assert_eq!(count, 1);
}

#[tokio::test]
async fn flags_are_stored_as_integers() {
    let pool = open_in_memory().await.unwrap();
    terminal_sessions::upsert(&pool, &session("s1"))
        .await
        .unwrap();
    let flags: (i64, i64, i64) = sqlx::query_as(
        "SELECT alternate_screen, bracketed_paste, has_received_user_input \
         FROM terminal_sessions WHERE session_id = 's1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(flags, (0, 1, 1));
}

#[tokio::test]
async fn null_columns_read_as_empty() {
    let pool = open_in_memory().await.unwrap();
    sqlx::query("INSERT INTO terminal_sessions (session_id) VALUES ('bare')")
        .execute(&pool)
        .await
        .unwrap();
    let s = terminal_sessions::get(&pool, "bare")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(s.workspace_id, "");
    assert_eq!((s.cols, s.rows), (0, 0));
    assert!(!s.alternate_screen && !s.bracketed_paste && !s.has_received_user_input);
}

#[tokio::test]
async fn delete_removes_only_that_row() {
    let pool = open_in_memory().await.unwrap();
    terminal_sessions::upsert(&pool, &session("s1"))
        .await
        .unwrap();
    terminal_sessions::upsert(&pool, &session("s2"))
        .await
        .unwrap();
    terminal_sessions::delete(&pool, "s1").await.unwrap();
    // Deleting a row that is not there is not an error.
    terminal_sessions::delete(&pool, "s1").await.unwrap();
    assert_eq!(terminal_sessions::get(&pool, "s1").await.unwrap(), None);
    assert!(terminal_sessions::get(&pool, "s2").await.unwrap().is_some());
    assert_eq!(sqlx_count(&pool).await, 1);
}

#[tokio::test]
async fn lists_session_ids_overall_and_per_workspace() {
    let pool = open_in_memory().await.unwrap();
    let other = TerminalSession {
        workspace_id: "w2".into(),
        ..session("s3")
    };
    for s in [session("s1"), session("s2"), other] {
        terminal_sessions::upsert(&pool, &s).await.unwrap();
    }
    let mut all = terminal_sessions::session_ids(&pool).await.unwrap();
    all.sort();
    assert_eq!(all, ["s1", "s2", "s3"]);
    let mut w1 = terminal_sessions::session_ids_for_workspace(&pool, "w1")
        .await
        .unwrap();
    w1.sort();
    assert_eq!(w1, ["s1", "s2"]);
    assert_eq!(
        terminal_sessions::session_ids_for_workspace(&pool, "w2")
            .await
            .unwrap(),
        ["s3"]
    );
    assert!(terminal_sessions::session_ids_for_workspace(&pool, "none")
        .await
        .unwrap()
        .is_empty());
}

async fn sqlx_count(pool: &openconductor_db::SqlitePool) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM terminal_sessions")
        .fetch_one(pool)
        .await
        .unwrap()
}
