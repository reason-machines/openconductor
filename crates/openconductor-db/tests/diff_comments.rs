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

mod remote {
    use super::*;
    use openconductor_db::diff_comments::{RemoteDiffComment, RemoteScope};

    fn gh(id: &str) -> RemoteDiffComment {
        RemoteDiffComment {
            id: id.into(),
            file_path: Some("src/a.rs".into()),
            line_number: Some(3),
            end_line_number: Some(5),
            body: "use a const".into(),
            location: Location::Modified,
            created_at: 1_000,
            updated_at: Some(1_000),
            remote_url: format!("https://github.com/acme/app/pull/7#{id}"),
            author: Some("octo".into()),
            author_avatar_url: Some("https://a/octo.png".into()),
            thread_id: Some("T1".into()),
            reply_to_comment_id: None,
            is_outdated: false,
            is_resolved: false,
            suggestion_base_code: Some("let x = 1;".into()),
        }
    }

    async fn ids(pool: &SqlitePool) -> Vec<String> {
        diff_comments::list_for_workspace(pool, "w")
            .await
            .unwrap()
            .into_iter()
            .map(|c| c.id)
            .collect()
    }

    #[tokio::test]
    async fn upsert_inserts_pending_rows_with_github_fields() {
        let pool = pool().await;
        let n = diff_comments::upsert_remote(&pool, "w", &[gh("github-T1-1")])
            .await
            .unwrap();
        assert_eq!(n, 1);
        let c = diff_comments::get(&pool, "github-T1-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(c.state, Some(State::Pending));
        assert_eq!((c.line_number, c.end_line_number), (Some(3), Some(5)));
        assert_eq!(
            c.remote_url.as_deref(),
            Some("https://github.com/acme/app/pull/7#github-T1-1")
        );
        assert_eq!(c.author.as_deref(), Some("octo"));
        assert_eq!(c.thread_id.as_deref(), Some("T1"));
        assert_eq!(c.suggestion_base_code.as_deref(), Some("let x = 1;"));
        assert!(!c.is_outdated && !c.is_resolved);
        // False flags are stored as NULL, as the reference writes them.
        let raw: (Option<i64>, Option<i64>) =
            sqlx::query_as("SELECT is_outdated, is_resolved FROM diff_comments WHERE id = ?")
                .bind("github-T1-1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(raw, (None, None));
    }

    #[tokio::test]
    async fn upsert_refreshes_github_fields_and_keeps_local_state() {
        let pool = pool().await;
        diff_comments::upsert_remote(&pool, "w", &[gh("github-T1-1")])
            .await
            .unwrap();
        // Same data again: nothing to change.
        assert_eq!(
            diff_comments::upsert_remote(&pool, "w", &[gh("github-T1-1")])
                .await
                .unwrap(),
            0
        );
        diff_comments::mark_sent(&pool, &["github-T1-1".into()], 50)
            .await
            .unwrap();
        let mut next = gh("github-T1-1");
        next.body = "use a const, please".into();
        next.is_resolved = true;
        next.is_outdated = true;
        next.line_number = None;
        next.end_line_number = None;
        next.created_at = 9_999;
        next.updated_at = Some(2_000);
        assert_eq!(
            diff_comments::upsert_remote(&pool, "w", &[next])
                .await
                .unwrap(),
            1
        );
        let c = diff_comments::get(&pool, "github-T1-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(c.body.as_deref(), Some("use a const, please"));
        assert!(c.is_resolved && c.is_outdated);
        assert_eq!(c.line_number, None);
        assert_eq!(c.updated_at, Some(2_000));
        assert_eq!(c.state, Some(State::Sent), "local state kept");
        assert_eq!(c.created_at, 1_000, "created_at kept");
    }

    #[tokio::test]
    async fn upsert_leaves_rows_in_states_the_reference_freezes_and_other_workspaces() {
        let pool = pool().await;
        diff_comments::upsert_remote(&pool, "w", &[gh("github-T1-1")])
            .await
            .unwrap();
        sqlx::query("UPDATE diff_comments SET state = 'superseded' WHERE id = 'github-T1-1'")
            .execute(&pool)
            .await
            .unwrap();
        let mut next = gh("github-T1-1");
        next.body = "changed".into();
        assert_eq!(
            diff_comments::upsert_remote(&pool, "w", &[next.clone()])
                .await
                .unwrap(),
            0
        );
        sqlx::query("UPDATE diff_comments SET state = 'pending' WHERE id = 'github-T1-1'")
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(
            diff_comments::upsert_remote(&pool, "other", &[next])
                .await
                .unwrap(),
            0,
            "a row owned by another workspace is not rewritten"
        );
    }

    #[tokio::test]
    async fn delete_missing_removes_only_vanished_rows_of_its_scope() {
        let pool = pool().await;
        diff_comments::insert(&pool, &comment("local", Some(1)))
            .await
            .unwrap();
        let mut general = gh("github-general-5");
        general.file_path = None;
        general.thread_id = None;
        diff_comments::upsert_remote(&pool, "w", &[gh("github-T1-1"), gh("github-T1-2"), general])
            .await
            .unwrap();

        let gone = diff_comments::delete_missing_remote(
            &pool,
            "w",
            RemoteScope::ReviewThreads,
            &["github-T1-1".into()],
        )
        .await
        .unwrap();
        assert_eq!(gone, 1);
        assert_eq!(
            ids(&pool).await,
            ["local", "github-T1-1", "github-general-5"]
        );

        // An empty list clears the scope; general comments go only with their own scope.
        diff_comments::delete_missing_remote(&pool, "w", RemoteScope::ReviewThreads, &[])
            .await
            .unwrap();
        assert_eq!(ids(&pool).await, ["local", "github-general-5"]);
        diff_comments::delete_missing_remote(&pool, "w", RemoteScope::General, &[])
            .await
            .unwrap();
        assert_eq!(ids(&pool).await, ["local"]);
    }
}

#[tokio::test]
async fn old_side_is_stored_as_original_and_legacy_base_rows_read_as_original() {
    let pool = pool().await;
    let mut n = comment("o", Some(4));
    n.location = Location::Original;
    let c = diff_comments::insert(&pool, &n).await.unwrap();
    assert_eq!(c.location, Some(Location::Original));
    let raw: (String,) = sqlx::query_as("SELECT location FROM diff_comments WHERE id = 'o'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(raw.0, "original");

    // A row an earlier build wrote with our old `base` value.
    sqlx::query("UPDATE diff_comments SET location = 'base' WHERE id = 'o'")
        .execute(&pool)
        .await
        .unwrap();
    let c = diff_comments::get(&pool, "o").await.unwrap().unwrap();
    assert_eq!(c.location, Some(Location::Original));
}

#[tokio::test]
async fn prompt_handoff_reviewed_is_workspace_scoped_idempotent_and_preserves_superseded() {
    let pool = pool().await;
    for id in ["one", "old", "other-workspace"] {
        let mut row = comment(id, Some(12));
        if id == "other-workspace" {
            row.workspace_id = "another".into();
        }
        diff_comments::insert(&pool, &row).await.unwrap();
    }
    sqlx::query("UPDATE diff_comments SET state = 'superseded' WHERE id = 'old'")
        .execute(&pool)
        .await
        .unwrap();
    let ids = ["one", "old", "other-workspace"].map(str::to_owned);
    assert_eq!(
        diff_comments::mark_reviewed(&pool, "w", &ids, 200)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        diff_comments::mark_reviewed(&pool, "w", &ids, 300)
            .await
            .unwrap(),
        0
    );
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT id, state FROM diff_comments ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        rows,
        vec![
            ("old".into(), "superseded".into()),
            ("one".into(), "reviewed".into()),
            ("other-workspace".into(), "pending".into())
        ]
    );
    let updated: i64 = sqlx::query_scalar("SELECT updated_at FROM diff_comments WHERE id = 'one'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(updated, 200);
}

#[tokio::test]
async fn prompt_handoff_reference_states_round_trip_without_collapsing_to_pending() {
    let pool = pool().await;
    for (index, state) in [
        "draft",
        "ready_for_review",
        "reviewed",
        "hidden",
        "superseded",
        "sent",
    ]
    .iter()
    .enumerate()
    {
        let id = format!("state-{index}");
        diff_comments::insert(&pool, &comment(&id, Some(12)))
            .await
            .unwrap();
        sqlx::query("UPDATE diff_comments SET state = ? WHERE id = ?")
            .bind(state)
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();
    }
    let rows = diff_comments::list(&pool, "w").await.unwrap();
    assert_eq!(rows.len(), 6);
    assert!(rows.iter().any(|row| row.state == Some(State::Draft)));
    assert!(rows
        .iter()
        .any(|row| row.state == Some(State::ReadyForReview)));
    assert!(rows.iter().any(|row| row.state == Some(State::Reviewed)));
    assert!(rows.iter().any(|row| row.state == Some(State::Hidden)));
    assert!(rows.iter().any(|row| row.state == Some(State::Superseded)));
    assert!(rows.iter().any(|row| row.state == Some(State::Sent)));
}
