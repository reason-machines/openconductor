use super::model::{Check, MergeStateStatus, PrNode, PrState, RawCheck, ReviewDecision};

const NODE: &str = r#"{
  "number": 42, "url": "https://github.com/o/r/pull/42",
  "author": {"login": "octo", "avatarUrl": "https://a/x.png"},
  "baseRefName": "main", "baseRef": {"target": {"oid": "b1"}},
  "headRefName": "feat", "headRefOid": "h1",
  "viewerDidAuthor": true, "viewerLatestReview": null,
  "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-02T00:00:00Z",
  "isDraft": false, "mergeStateStatus": "SOME_NEW_VALUE", "mergedAt": null,
  "reviewDecision": "REVIEW_REQUIRED", "reviewRequests": {"totalCount": 2},
  "state": "OPEN", "autoMergeRequest": null, "mergeQueueEntry": null,
  "title": "T", "body": "B",
  "headRef": {"target": {"statusCheckRollup": {"contexts": {"nodes": [
    {"name": "build", "status": "COMPLETED", "conclusion": "SUCCESS",
     "checkSuite": {"workflowRun": {"workflow": {"name": "CI"}}}},
    null,
    {"context": "ci/legacy", "state": "PENDING", "targetUrl": "https://ci"}
  ]}}}}
}"#;

#[test]
fn pr_node_deserializes_and_unknown_enums_degrade() {
    let node: PrNode = serde_json::from_str(NODE).expect("parse");
    assert_eq!(node.number, 42);
    assert_eq!(node.state, PrState::Open);
    assert_eq!(node.merge_state_status, MergeStateStatus::Unknown);
    assert_eq!(node.review_decision, Some(ReviewDecision::ReviewRequired));
    assert_eq!(node.review_requests.total_count, 2);
    let raw: Vec<RawCheck> = node
        .head_ref
        .and_then(|r| r.target)
        .and_then(|t| t.status_check_rollup)
        .expect("rollup")
        .contexts
        .present()
        .collect();
    assert_eq!(raw.len(), 2, "null nodes are skipped");
    let first = Check::from(raw[0].clone());
    assert_eq!(
        first.workflow_name.as_deref(),
        Some("CI"),
        "workflow lifted from suite"
    );
}
