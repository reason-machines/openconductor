use openconductor_db::diff_comments::{self, Location, NewDiffComment};
use openconductor_db::{open, open_in_memory};
use std::time::{SystemTime, UNIX_EPOCH};

fn comment(id: &str, line: Option<i64>) -> NewDiffComment {
    NewDiffComment {
        id: id.into(),
        workspace_id: "workspace".into(),
        file_path: "example.txt".into(),
        line_number: line,
        end_line_number: line.map(|n| n + 2),
        body: "keep this range".into(),
        location: if line.is_some() {
            Location::Modified
        } else {
            Location::File
        },
        created_at: 1,
        author: None,
        reply_to: None,
    }
}

#[tokio::test]
async fn moved_range_survives_reopen_and_repeated_absolute_updates() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!("oc-anchor-{}-{unique}.db", std::process::id()));
    let pool = open(&path).await.unwrap();
    diff_comments::insert(&pool, &comment("local", Some(3)))
        .await
        .unwrap();
    for now in [2, 3] {
        assert_eq!(
            diff_comments::update_anchor(&pool, "workspace", "local", 4, Some(6), now)
                .await
                .unwrap(),
            1
        );
    }
    pool.close().await;
    let pool = open(&path).await.unwrap();
    let row = diff_comments::get(&pool, "local").await.unwrap().unwrap();
    assert_eq!((row.line_number, row.end_line_number), (Some(4), Some(6)));
    assert_eq!(row.body.as_deref(), Some("keep this range"));
    assert_eq!(row.updated_at, Some(3));
    assert_eq!(row.location, Some(Location::Modified));
    pool.close().await;
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn anchor_updates_skip_remote_whole_file_wrong_workspace_and_invalid_ranges() {
    let pool = open_in_memory().await.unwrap();
    for c in [
        comment("local", Some(3)),
        comment("remote", Some(3)),
        comment("file", None),
    ] {
        diff_comments::insert(&pool, &c).await.unwrap();
    }
    sqlx::query(
        "UPDATE diff_comments SET remote_url = 'https://example.invalid/review' WHERE id = 'remote'",
    )
    .execute(&pool)
    .await
    .unwrap();
    for (workspace, id, line, end) in [
        ("other", "local", 4, Some(6)),
        ("workspace", "remote", 4, Some(6)),
        ("workspace", "file", 4, Some(6)),
        ("workspace", "missing", 4, Some(6)),
        ("workspace", "local", 0, Some(2)),
        ("workspace", "local", 6, Some(4)),
    ] {
        assert_eq!(
            diff_comments::update_anchor(&pool, workspace, id, line, end, 2)
                .await
                .unwrap(),
            0
        );
    }
    for id in ["local", "remote"] {
        let row = diff_comments::get(&pool, id).await.unwrap().unwrap();
        assert_eq!((row.line_number, row.end_line_number), (Some(3), Some(5)));
        assert_eq!(row.updated_at, None);
    }
    let file = diff_comments::get(&pool, "file").await.unwrap().unwrap();
    assert_eq!((file.line_number, file.end_line_number), (None, None));
    diff_comments::update_anchor(&pool, "workspace", "local", 8, None, 3)
        .await
        .unwrap();
    let single = diff_comments::get(&pool, "local").await.unwrap().unwrap();
    assert_eq!(
        (single.line_number, single.end_line_number),
        (Some(8), None)
    );
}
