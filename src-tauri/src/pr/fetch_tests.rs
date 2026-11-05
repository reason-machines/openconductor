use serde_json::{json, Value};

use super::fetch::{build_query, fetch_prs, PrRequest, BATCH_SIZE};
use super::gh_tests::{gh_cwd, Fake};
use super::info::{PrLookup, WorkspaceStatus};

fn raw(number: u64, state: &str, head: &str, created: &str) -> Value {
    json!({
        "number": number, "url": format!("https://github.com/o/r/pull/{number}"),
        "author": null, "baseRefName": "main", "baseRef": null,
        "headRefName": head, "headRefOid": "h", "viewerDidAuthor": true,
        "viewerLatestReview": null, "createdAt": created, "updatedAt": created,
        "isDraft": false, "mergeStateStatus": "CLEAN",
        "mergedAt": if state == "MERGED" { json!("2026-02-01T00:00:00Z") } else { Value::Null },
        "reviewDecision": null, "reviewRequests": {"totalCount": 0}, "state": state,
        "autoMergeRequest": null, "mergeQueueEntry": null, "title": "t", "body": "b",
        "headRef": null
    })
}

fn req(branch: &str, number: Option<u64>) -> PrRequest {
    PrRequest {
        local_branch: branch.into(),
        workspace_branch: branch.into(),
        upstream_branch: None,
        pr_number: number,
    }
}

fn reply(f: &Fake, repo: Value) {
    f.reply(0, &json!({"data": {"repository": repo}}).to_string(), "");
}

fn number(l: &Option<PrLookup>) -> Option<u64> {
    l.as_ref().and_then(|l| l.info()).map(|i| i.number)
}

#[test]
fn query_has_aliases_and_skip_include_per_workspace() {
    let q = build_query(2);
    for s in [
        "$headRefName1: String!",
        "$hasPrNumber1: Boolean!",
        "pr0ByBranch: pullRequests(first: 5, headRefName: $headRefName0, states: [OPEN, MERGED]",
        "@skip(if: $hasPrNumber0)",
        "pr1ByNumber: pullRequest(number: $prNumber1) @include(if: $hasPrNumber1)",
        "viewerPermission",
    ] {
        assert!(q.contains(s), "missing {s}");
    }
    assert!(!q.contains("pr2By"));
}

#[test]
fn by_branch_picks_newest_open_and_ignores_merged() {
    let f = Fake::default();
    reply(
        &f,
        json!({"viewerPermission": "WRITE", "pr0ByBranch": {"nodes": [
        raw(1, "OPEN", "feat", "2026-01-01T00:00:00Z"),
        raw(3, "MERGED", "feat", "2026-03-01T00:00:00Z"),
        raw(2, "OPEN", "feat", "2026-02-01T00:00:00Z"),
        null
    ]}, "pr1ByBranch": {"nodes": [raw(4, "MERGED", "old", "2026-01-01T00:00:00Z")]}}),
    );
    let out = fetch_prs(&gh_cwd(&f), &[req("feat", None), req("old", None)], |_| {
        None
    })
    .unwrap();
    assert_eq!(number(&out[0]), Some(2));
    assert_eq!(
        out[0].as_ref().unwrap().info().unwrap().viewer_can_merge,
        Some(true)
    );
    assert_eq!(
        out[1],
        Some(PrLookup::None),
        "merged PRs are only followed by pinned number"
    );
    let args = f.last_args();
    let pos = |s: &str| args.iter().position(|a| a == s).expect(s);
    assert_eq!(args[pos("headRefName0=feat") - 1], "-f");
    assert_eq!(args[pos("hasPrNumber0=false") - 1], "-F");
    assert!(args.contains(&"prNumber0=0".to_string()));
}

#[test]
fn pinned_number_is_followed_including_merged_unless_upstream_differs() {
    let f = Fake::default();
    reply(
        &f,
        json!({"viewerPermission": "READ",
        "pr0ByNumber": raw(9, "MERGED", "feat", "2026-01-01T00:00:00Z"),
        "pr1ByNumber": raw(10, "OPEN", "other", "2026-01-01T00:00:00Z")}),
    );
    let mut moved = req("feat", Some(10));
    moved.upstream_branch = Some("feat".into());
    let out = fetch_prs(&gh_cwd(&f), &[req("feat", Some(9)), moved], |_| None).unwrap();
    let merged = out[0].as_ref().unwrap();
    assert_eq!(super::info::derived_status(merged), WorkspaceStatus::Done);
    assert_eq!(out[1], Some(PrLookup::None));
    assert!(f.last_args().contains(&"hasPrNumber0=true".to_string()));
}

#[test]
fn closed_pr_counts_only_while_its_branch_is_checked_out() {
    let f = Fake::default();
    let closed = |n| raw(n, "CLOSED", "feat", "2026-01-01T00:00:00Z");
    reply(
        &f,
        json!({"pr0ByNumber": closed(1), "pr1ByNumber": closed(2), "pr2ByNumber": closed(3)}),
    );
    let mut other_head = req("renamed", Some(3));
    other_head.workspace_branch = "renamed".into();
    let reqs = [req("feat", Some(1)), req("feat", Some(2)), other_head];
    let mut asked = 0;
    let out = fetch_prs(&gh_cwd(&f), &reqs, |r| {
        asked += 1;
        // First workspace still has `feat` checked out; second could not be read.
        (asked == 1).then(|| format!("{}\n", r.workspace_branch))
    })
    .unwrap();
    assert_eq!(out[0], Some(PrLookup::Closed));
    assert_eq!(out[1], None, "unknown when the checkout can't be read");
    assert_eq!(out[2], Some(PrLookup::None), "PR head is not this branch");
    assert_eq!(asked, 2, "branch only read for matching closed PRs");
}

#[test]
fn requests_are_batched_and_errors_surface() {
    let f = Fake::default();
    let reqs: Vec<PrRequest> = (0..BATCH_SIZE + 2)
        .map(|i| req(&format!("b{i}"), None))
        .collect();
    reply(&f, json!({}));
    reply(&f, json!({}));
    let out = fetch_prs(&gh_cwd(&f), &reqs, |_| None).unwrap();
    assert_eq!(out.len(), BATCH_SIZE + 2);
    assert_eq!(f.calls.borrow().len(), 2);
    assert!(out.iter().all(|l| *l == Some(PrLookup::None)));

    f.reply(
        0,
        r#"{"data":{"repository":null},"errors":[{"message":"Could not resolve"}]}"#,
        "",
    );
    let err = fetch_prs(&gh_cwd(&f), &reqs[..1], |_| None).unwrap_err();
    assert!(err.to_string().contains("Could not resolve"));
    f.reply(1, "", "HTTP 502");
    let err = fetch_prs(&gh_cwd(&f), &reqs[..1], |_| None).unwrap_err();
    assert!(err.to_string().contains("HTTP 502"));
}
