use serde_json::json;

use super::gh_tests::{gh_cwd, Fake};
use super::review_comments::*;

fn comment(id: &str, db: Option<u64>, reply_to: Option<(&str, Option<u64>)>) -> serde_json::Value {
    json!({
        "id": id,
        "body": format!("body {id}"),
        "diffHunk": "@@ -10,3 +10,4 @@ fn x() {\n ctx\n-old\n+new\n+added\n ctx2",
        "author": { "login": "octo", "avatarUrl": "https://a/octo.png" },
        "createdAt": "2024-05-01T12:00:00Z",
        "updatedAt": "2024-05-01T12:00:01.250Z",
        "url": format!("https://github.com/acme/app/pull/7#discussion_{id}"),
        "databaseId": db,
        "replyTo": reply_to.map(|(i, d)| json!({ "id": i, "databaseId": d })),
    })
}

fn thread(id: &str, comments: Vec<serde_json::Value>, more: Option<&str>) -> serde_json::Value {
    json!({
        "id": id,
        "isOutdated": false,
        "isResolved": true,
        "path": "src/a.rs",
        "line": 12,
        "startLine": 11,
        "originalLine": 12,
        "originalStartLine": 11,
        "startDiffSide": "RIGHT",
        "diffSide": "RIGHT",
        "comments": {
            "nodes": comments,
            "pageInfo": { "hasNextPage": more.is_some(), "endCursor": more },
        },
    })
}

fn threads_page(threads: Vec<serde_json::Value>, next: Option<&str>) -> String {
    json!({ "data": { "repository": { "pullRequest": { "reviewThreads": {
        "nodes": threads,
        "pageInfo": { "hasNextPage": next.is_some(), "endCursor": next },
    } } }, "rateLimit": { "cost": 1 } } })
    .to_string()
}

fn parse_thread(v: serde_json::Value) -> ReviewThread {
    serde_json::from_value(v).unwrap()
}

#[test]
fn iso_timestamps_become_epoch_millis() {
    assert_eq!(iso_millis(Some("1970-01-01T00:00:00Z")), Some(0));
    assert_eq!(
        iso_millis(Some("2024-05-01T12:00:00Z")),
        Some(1_714_564_800_000)
    );
    assert_eq!(
        iso_millis(Some("2024-05-01T12:00:01.25Z")),
        Some(1_714_564_801_250)
    );
    assert_eq!(
        iso_millis(Some("2024-05-01T14:00:00+02:00")),
        Some(1_714_564_800_000)
    );
    assert_eq!(
        iso_millis(Some("2000-02-29T00:00:00Z")),
        Some(951_782_400_000)
    );
    assert_eq!(iso_millis(Some("not a date")), None);
    assert_eq!(iso_millis(None), None);
}

#[test]
fn review_comments_map_to_rows_with_thread_state_and_anchor() {
    let t = parse_thread(thread(
        "T1",
        vec![
            comment("C1", Some(101), None),
            comment("C2", Some(102), Some(("C1", Some(101)))),
            comment("C3", None, Some(("C2", None))),
        ],
        None,
    ));
    let set = sync_set(Some(vec![t]), None);
    let ids: Vec<_> = set.comments.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(ids, ["github-T1-101", "github-T1-102", "github-C3"]);
    assert_eq!(set.review_ids.as_deref().unwrap().len(), 3);
    assert_eq!(set.general_ids, None, "general comments were not read");

    let root = &set.comments[0];
    assert_eq!(root.file_path.as_deref(), Some("src/a.rs"));
    assert_eq!(
        (root.line_number, root.end_line_number),
        (Some(11), Some(12))
    );
    assert_eq!(root.anchor, Anchor::Modified);
    assert_eq!(root.thread_id.as_deref(), Some("T1"));
    assert_eq!(root.reply_to_comment_id, None);
    assert!(root.is_resolved && !root.is_outdated);
    assert_eq!(root.author.as_deref(), Some("octo"));
    assert_eq!(
        root.author_avatar_url.as_deref(),
        Some("https://a/octo.png")
    );
    assert_eq!(root.created_at, 1_714_564_800_000);
    assert_eq!(root.updated_at, Some(1_714_564_801_250));
    assert_eq!(
        set.comments[1].reply_to_comment_id.as_deref(),
        Some("github-T1-101")
    );
    assert_eq!(
        set.comments[2].reply_to_comment_id.as_deref(),
        Some("github-C2")
    );
}

#[test]
fn single_line_left_side_and_outdated_threads() {
    let mut v = thread("T", vec![comment("C", Some(1), None)], None);
    v["startLine"] = json!(null);
    v["startDiffSide"] = json!(null);
    v["line"] = json!(11);
    v["diffSide"] = json!("LEFT");
    let set = sync_set(Some(vec![parse_thread(v.clone())]), None);
    let c = &set.comments[0];
    assert_eq!(
        (c.line_number, c.end_line_number, c.anchor),
        (Some(11), None, Anchor::Base)
    );

    // GitHub drops `line` once the code moved on; the row has no line.
    v["line"] = json!(null);
    v["isOutdated"] = json!(true);
    v["isResolved"] = json!(false);
    let set = sync_set(Some(vec![parse_thread(v)]), None);
    let c = &set.comments[0];
    assert_eq!(c.line_number, None);
    assert!(c.is_outdated && !c.is_resolved);
}

#[test]
fn suggestion_base_code_reads_the_original_range_from_the_hunk() {
    let hunk = "@@ -10,3 +10,4 @@ fn x() {\n ctx\n-old\n+new\n+added\n ctx2";
    let mut t = parse_thread(thread("T", vec![], None));
    // New side: 10 ctx, 11 new, 12 added, 13 ctx2.
    assert_eq!(
        suggestion_base_code(hunk, &t).as_deref(),
        Some("new\nadded")
    );
    t.original_start_line = None;
    t.original_line = Some(13);
    assert_eq!(suggestion_base_code(hunk, &t).as_deref(), Some("ctx2"));
    // Old side: 10 ctx, 11 old, 12 ctx2.
    t.diff_side = DiffSide::Left;
    t.start_diff_side = None;
    t.original_line = Some(11);
    assert_eq!(suggestion_base_code(hunk, &t).as_deref(), Some("old"));
    // Outside the hunk: known thread, unknown code.
    t.original_line = Some(40);
    assert_eq!(suggestion_base_code(hunk, &t).as_deref(), Some(""));
    // No original line, or a range across both sides: none.
    t.original_line = None;
    assert_eq!(suggestion_base_code(hunk, &t), None);
    t.original_line = Some(11);
    t.start_diff_side = Some(DiffSide::Right);
    assert_eq!(suggestion_base_code(hunk, &t), None);
    // A "\ No newline" marker is not a line.
    let hunk = "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b";
    let mut t = parse_thread(thread("T", vec![], None));
    t.original_start_line = None;
    t.original_line = Some(1);
    assert_eq!(suggestion_base_code(hunk, &t).as_deref(), Some("b"));
}

#[test]
fn general_comments_are_whole_pr_rows() {
    let g: GeneralComment = serde_json::from_value(json!({
        "id": "IC_1", "body": "LGTM", "author": null, "createdAt": "2024-05-01T12:00:00Z",
        "updatedAt": null, "url": "https://github.com/acme/app/pull/7#issuecomment-5", "databaseId": 5,
    }))
    .unwrap();
    let set = sync_set(None, Some(vec![g]));
    assert_eq!(set.review_ids, None);
    assert_eq!(
        set.general_ids.as_deref(),
        Some(&["github-general-5".to_string()][..])
    );
    let c = &set.comments[0];
    assert_eq!(
        (c.file_path.as_deref(), c.line_number, c.anchor),
        (None, None, Anchor::File)
    );
    assert_eq!((c.author.as_deref(), c.thread_id.as_deref()), (None, None));
}

#[test]
fn review_threads_page_through_threads_and_long_threads() {
    let fake = Fake::default();
    fake.reply(
        0,
        &threads_page(
            vec![thread("T1", vec![comment("A", Some(1), None)], Some("c1"))],
            Some("t1"),
        ),
        "",
    );
    // Rest of T1's comments.
    fake.reply(
        0,
        &json!({ "data": { "node": { "comments": {
            "nodes": [comment("B", Some(2), Some(("A", Some(1))))],
            "pageInfo": { "hasNextPage": false, "endCursor": null },
        } } } })
        .to_string(),
        "",
    );
    fake.reply(
        0,
        &threads_page(
            vec![thread("T2", vec![comment("C", Some(3), None)], None)],
            None,
        ),
        "",
    );
    let threads = gh_cwd(&fake).review_threads(7).unwrap().unwrap();
    assert_eq!(threads.len(), 2);
    assert_eq!(threads[0].comments.nodes.len(), 2);

    let calls = fake.calls.borrow();
    assert_eq!(calls.len(), 3);
    let first = &calls[0].0;
    assert!(first.contains(&"prNumber=7".to_string()));
    assert!(
        !first.iter().any(|a| a.starts_with("threadCursor=")),
        "no cursor on page one"
    );
    assert!(first.iter().any(|a| a.contains("reviewThreads(first: 100")));
    assert!(calls[1].0.contains(&"threadId=T1".to_string()));
    assert!(calls[1].0.contains(&"commentCursor=c1".to_string()));
    assert!(calls[2].0.contains(&"threadCursor=t1".to_string()));
}

#[test]
fn review_threads_fail_on_gh_errors_and_return_none_without_a_pr() {
    let fake = Fake::default();
    fake.reply(1, "", "HTTP 401");
    assert!(gh_cwd(&fake)
        .review_threads(7)
        .unwrap_err()
        .to_string()
        .contains("HTTP 401"));
    let fake = Fake::default();
    fake.reply(0, r#"{"data":{"repository":{"pullRequest":null}}}"#, "");
    assert_eq!(gh_cwd(&fake).review_threads(7).unwrap(), None);
}

#[test]
fn general_comments_are_unavailable_rather_than_an_error() {
    let fake = Fake::default();
    fake.reply(1, "", "boom");
    assert_eq!(gh_cwd(&fake).general_comments(7), None);
    let fake = Fake::default();
    fake.reply(
        0,
        &json!({ "data": { "repository": { "pullRequest": { "comments": {
            "nodes": [{ "id": "IC", "body": "hi", "author": { "login": "o" }, "createdAt": null,
                        "updatedAt": null, "url": "u", "databaseId": 9 }],
            "pageInfo": { "hasNextPage": false, "endCursor": null },
        } } } } })
        .to_string(),
        "",
    );
    let got = gh_cwd(&fake).general_comments(7).unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].author.as_ref().unwrap().avatar_url, None);
}

#[test]
fn branch_pr_reads_number_and_state_and_treats_no_pr_as_none() {
    let fake = Fake::default();
    fake.reply(0, r#"{"number":7,"state":"OPEN"}"#, "");
    let pr = gh_cwd(&fake).branch_pr().unwrap().unwrap();
    assert_eq!(pr.number, 7);
    assert!(pr.syncs());
    assert_eq!(fake.last_args(), ["pr", "view", "--json", "number,state"]);
    assert!(!BranchPr {
        number: 1,
        state: "MERGED".into()
    }
    .syncs());
    assert!(BranchPr {
        number: 1,
        state: "CLOSED".into()
    }
    .syncs());

    let fake = Fake::default();
    fake.reply(1, "", "no pull requests found for branch \"x\"");
    assert_eq!(gh_cwd(&fake).branch_pr().unwrap(), None);
    let fake = Fake::default();
    fake.reply(1, "", "not logged in");
    assert!(gh_cwd(&fake).branch_pr().is_err());
}

#[test]
fn resolve_thread_requires_githubs_confirmation() {
    let ok = r#"{"data":{"resolveReviewThread":{"thread":{"id":"T","isResolved":true}}}}"#;
    let fake = Fake::default();
    fake.reply(0, ok, "");
    gh_cwd(&fake).resolve_thread("T").unwrap();
    let args = fake.last_args();
    assert!(args.contains(&"threadId=T".to_string()));
    assert!(args.iter().any(|a| a.contains("resolveReviewThread")));

    let fake = Fake::default();
    fake.reply(
        0,
        r#"{"data":{"resolveReviewThread":{"thread":{"id":"T","isResolved":false}}}}"#,
        "",
    );
    assert!(gh_cwd(&fake).resolve_thread("T").is_err());
    let fake = Fake::default();
    fake.reply(
        0,
        r#"{"errors":[{"message":"Resource not accessible"}]}"#,
        "",
    );
    let e = gh_cwd(&fake).resolve_thread("T").unwrap_err().to_string();
    assert!(e.contains("Resource not accessible"), "{e}");
}
