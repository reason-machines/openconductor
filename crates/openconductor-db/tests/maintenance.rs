use openconductor_db::{maintenance, open_in_memory};

#[tokio::test]
async fn symlink_deletion_queue() {
    let pool = open_in_memory().await.unwrap();
    assert!(maintenance::symlinks_pending_deletion(&pool)
        .await
        .unwrap()
        .is_empty());
    maintenance::queue_symlink_deletion(&pool, "/ws/old-name")
        .await
        .unwrap();
    maintenance::queue_symlink_deletion(&pool, "/ws/other")
        .await
        .unwrap();
    sqlx::query("INSERT INTO symlinks_pending_deletion (path) VALUES (NULL)")
        .execute(&pool)
        .await
        .unwrap();
    let mut paths = maintenance::symlinks_pending_deletion(&pool).await.unwrap();
    paths.sort();
    assert_eq!(paths, ["/ws/old-name", "/ws/other"], "NULL rows skipped");

    maintenance::unqueue_symlink_deletion(&pool, "/ws/old-name")
        .await
        .unwrap();
    maintenance::unqueue_symlink_deletion(&pool, "/ws/missing")
        .await
        .unwrap();
    assert_eq!(
        maintenance::symlinks_pending_deletion(&pool).await.unwrap(),
        ["/ws/other"]
    );
}

#[tokio::test]
async fn rollback_sql_is_recorded_and_deletes_itself() {
    let pool = open_in_memory().await.unwrap();
    maintenance::record_rollback(
        &pool,
        7,
        "SELECT 1; DELETE FROM migration_rollbacks WHERE version = 7;",
    )
    .await
    .unwrap();
    let down = "CREATE TABLE scratch (x); DELETE FROM migration_rollbacks WHERE version = 7;";
    maintenance::record_rollback(&pool, 7, down).await.unwrap();
    let stored: String =
        sqlx::query_scalar("SELECT down_sql FROM migration_rollbacks WHERE version = 7")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stored, down, "INSERT OR REPLACE keeps the latest");

    sqlx::raw_sql(&stored).execute(&pool).await.unwrap();
    let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM migration_rollbacks")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 0);
}

#[tokio::test]
async fn forget_repositories_empties_repos_workspaces_and_chats_only() {
    let pool = open_in_memory().await.unwrap();
    for sql in [
        "INSERT INTO repos (id, name, root_path) VALUES ('app', 'app', '/src/app')",
        "INSERT INTO workspaces (id, repository_id, directory_name) VALUES ('w1', 'app', 'lisbon')",
        "INSERT INTO sessions (id) VALUES ('s1')",
        "INSERT INTO session_messages (id, session_id) VALUES ('m1', 's1')",
        "INSERT INTO settings (key, value) VALUES ('conductor_root_path', '/old')",
    ] {
        sqlx::query(sql).execute(&pool).await.unwrap();
    }
    maintenance::forget_repositories(&pool).await.unwrap();
    for table in [
        "attachments",
        "diff_comments",
        "session_messages",
        "sessions",
        "workspaces",
        "repos",
    ] {
        let n: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 0, "{table} emptied");
    }
    let kept: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM settings")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(kept, 1, "settings kept");
}
