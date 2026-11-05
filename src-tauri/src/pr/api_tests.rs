use std::path::Path;

use serde_json::json;

use super::api::{
    lookup_prs, merge_pr, preferred_merge_method, set_auto_merge, CreatePrPrompt, LookupRequest,
};
use super::gh::{MergeMethod, MergeMethodCache};
use super::gh_tests::{gh_cwd, Fake};
use super::header::{header_state, HeaderInputs};
use super::info::{lookup_from_node, PrLookup};
use super::info_tests::node;
use super::model::ViewerPermission;
use super::prompt::create_pr_prompt;

const METHODS: &str = r#"{"data":{"repository":{"squashMergeAllowed":false,"rebaseMergeAllowed":true,"mergeCommitAllowed":true}}}"#;

#[test]
fn lookup_adds_derived_status_and_reads_the_right_checkout() {
    let f = Fake::default();
    let closed = json!({"number": 3, "url": "u", "author": null, "baseRefName": "main",
        "baseRef": null, "headRefName": "b", "headRefOid": "h", "viewerDidAuthor": true,
        "viewerLatestReview": null, "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z", "isDraft": false, "mergeStateStatus": "CLEAN",
        "mergedAt": null, "reviewDecision": null, "reviewRequests": {"totalCount": 0},
        "state": "CLOSED", "autoMergeRequest": null, "mergeQueueEntry": null,
        "title": "t", "body": "", "headRef": null});
    let body =
        json!({"data": {"repository": {"pr0ByBranch": {"nodes": []}, "pr1ByNumber": closed}}});
    f.reply(0, &body.to_string(), "");
    let reqs: Vec<LookupRequest> = serde_json::from_value(json!([
        {"workspacePath": "/ws/a", "localBranch": "a", "workspaceBranch": "a"},
        {"workspacePath": "/ws/b", "localBranch": "b", "workspaceBranch": "b", "prNumber": 3}
    ]))
    .unwrap();
    let mut asked = Vec::new();
    let out = lookup_prs(&gh_cwd(&f), &reqs, |p: &Path| {
        asked.push(p.to_path_buf());
        Some("b".into())
    })
    .unwrap();
    assert_eq!(asked, vec![Path::new("/ws/b").to_path_buf()]);
    let wire = serde_json::to_value(&out).unwrap();
    assert_eq!(
        wire[0],
        json!({"lookup": {"kind": "none"}, "derivedStatus": "in-progress"})
    );
    assert_eq!(
        wire[1],
        json!({"lookup": {"kind": "closed"}, "derivedStatus": "canceled"})
    );
}

#[test]
fn merge_uses_explicit_method_or_cached_preference() {
    let f = Fake::default();
    let gh = gh_cwd(&f);
    let cache = MergeMethodCache::default();
    assert_eq!(
        merge_pr(&gh, &cache, "/repo", 5, Some(MergeMethod::Squash)),
        Ok(MergeMethod::Squash)
    );
    assert_eq!(
        f.calls.borrow().len(),
        1,
        "no settings query for an explicit method"
    );
    f.reply(0, METHODS, "");
    assert_eq!(
        merge_pr(&gh, &cache, "/repo", 5, None),
        Ok(MergeMethod::Rebase)
    );
    assert_eq!(
        preferred_merge_method(&gh, &cache, "/repo"),
        Ok(MergeMethod::Rebase),
        "the tooltip reads the same cached method"
    );
    assert_eq!(f.last_args(), vec!["pr", "merge", "5", "--rebase"]);
    set_auto_merge(&gh, &cache, "/repo", 5, true, None).unwrap();
    assert_eq!(
        f.last_args(),
        vec!["pr", "merge", "5", "--rebase", "--auto"]
    );
    assert_eq!(
        f.calls.borrow().len(),
        4,
        "merge method cached per repository"
    );
    set_auto_merge(&gh, &cache, "/repo", 5, false, None).unwrap();
    assert_eq!(f.last_args(), vec!["pr", "merge", "5", "--disable-auto"]);
    f.reply(1, "", "not mergeable");
    let err = merge_pr(&gh, &cache, "/repo", 6, None).unwrap_err();
    assert!(err.contains("not mergeable"), "{err}");
}

#[test]
fn ipc_shapes_round_trip_for_the_header() {
    let lookup = lookup_from_node(node(json!({})), Some(ViewerPermission::Write));
    let wire = serde_json::to_value(&lookup).unwrap();
    assert_eq!(wire["kind"], "found");
    assert_eq!(wire["info"]["viewerCanMerge"], true);
    assert_eq!(wire["info"]["status"]["mergeState"], "CLEAN");
    assert_eq!(wire["info"]["status"]["checks"]["status"], "passing");
    let back: PrLookup = serde_json::from_value(wire.clone()).unwrap();
    assert_eq!(back, lookup);
    let inputs: HeaderInputs = serde_json::from_value(json!({
        "pr": wire, "canCreatePr": true, "hasRemote": true,
        "upstream": {"branchExists": true, "ahead": 1}
    }))
    .unwrap();
    let state = serde_json::to_value(header_state(&inputs)).unwrap();
    assert_eq!(
        state,
        json!({"tone": "out_of_sync", "action": {"type": "push", "ahead": 1}})
    );
}

#[test]
fn create_pr_prompt_request_from_ipc() {
    let req: CreatePrPrompt = serde_json::from_value(json!({
        "branch": "feat", "remote": "origin", "targetBranch": "main", "draft": true
    }))
    .unwrap();
    let text = create_pr_prompt(&req.as_request());
    assert!(text.contains("`gh pr create --base main --draft`"));
}
