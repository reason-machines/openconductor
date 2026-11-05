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
