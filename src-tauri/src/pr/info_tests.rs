use serde_json::{json, Value};

use super::checks::ChecksStatus;
use super::info::{derived_status, lookup_from_node, metadata_update, PrLookup, WorkspaceStatus};
use super::model::{MergeStateStatus, PrNode, ViewerPermission};

/// An open, mergeable PR node; `patch` overrides top-level fields.
pub(super) fn node(patch: Value) -> PrNode {
    let mut base = json!({
        "number": 7, "url": "https://github.com/o/r/pull/7",
        "author": {"login": "octo", "avatarUrl": "https://a/x.png"},
        "baseRefName": "main", "baseRef": {"target": {"oid": "base1"}},
        "headRefName": "feat", "headRefOid": "head1",
        "viewerDidAuthor": false, "viewerLatestReview": null,
        "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
        "isDraft": false, "mergeStateStatus": "CLEAN", "mergedAt": null,
        "reviewDecision": null, "reviewRequests": {"totalCount": 0},
        "state": "OPEN", "autoMergeRequest": null, "mergeQueueEntry": null,
        "title": "Add thing", "body": "Body", "headRef": null
    });
    for (k, v) in patch.as_object().expect("object patch") {
        base[k] = v.clone();
    }
    serde_json::from_value(base).expect("valid node")
}

#[test]
fn open_node_becomes_found_with_status_and_permission() {
    let n = node(json!({
        "mergeStateStatus": "UNSTABLE",
        "autoMergeRequest": {"enabledAt": "2026-01-01T00:00:00Z"},
        "viewerLatestReview": {"commit": {"oid": "old"}},
        "headRef": {"target": {"statusCheckRollup": {"contexts": {"nodes": [
            {"name": "test", "conclusion": "FAILURE", "status": "COMPLETED"}
        ]}}}}
    }));
    let lookup = lookup_from_node(n, Some(ViewerPermission::Maintain));
    let info = lookup.info().expect("found");
    assert_eq!(info.number, 7);
    assert_eq!(info.base_ref_oid.as_deref(), Some("base1"));
    assert_eq!(info.viewer_can_merge, Some(true));
    let review = info.viewer_latest_review.as_ref().expect("reviewed");
    assert_eq!(review.commit_oid.as_deref(), Some("old"));
    assert!(info.is_auto_merge_enabled);
    let status = info.status.as_ref().expect("open PR has status");
    assert_eq!(status.merge_state, MergeStateStatus::Unstable);
    assert_eq!(status.checks.status, Some(ChecksStatus::Failing));
    assert_eq!(derived_status(&lookup), WorkspaceStatus::InReview);
}

#[test]
fn read_permission_cannot_merge_and_missing_permission_is_unknown() {
    let l = lookup_from_node(node(json!({})), Some(ViewerPermission::Read));
    assert_eq!(l.info().unwrap().viewer_can_merge, Some(false));
    let l = lookup_from_node(node(json!({})), None);
    assert_eq!(l.info().unwrap().viewer_can_merge, None);
}

#[test]
fn merged_node_is_done_and_drops_status() {
    let l = lookup_from_node(
        node(json!({"state": "MERGED", "mergedAt": "2026-01-02T00:00:00Z"})),
        None,
    );
    let info = l.info().unwrap();
    assert!(info.is_merged);
    assert!(info.status.is_none());
    assert_eq!(derived_status(&l), WorkspaceStatus::Done);
}

#[test]
fn closed_unmerged_node_is_canceled() {
    let l = lookup_from_node(node(json!({"state": "CLOSED"})), None);
    assert_eq!(l, PrLookup::Closed);
    assert_eq!(derived_status(&l), WorkspaceStatus::Canceled);
    assert_eq!(derived_status(&PrLookup::None), WorkspaceStatus::InProgress);
}

#[test]
fn workspace_status_round_trips_and_defaults() {
    for s in [
        WorkspaceStatus::Backlog,
        WorkspaceStatus::InProgress,
        WorkspaceStatus::InReview,
        WorkspaceStatus::Done,
        WorkspaceStatus::Canceled,
    ] {
        assert_eq!(WorkspaceStatus::parse(Some(s.as_str())), s);
    }
    assert_eq!(
        WorkspaceStatus::parse(Some("bogus")),
        WorkspaceStatus::InProgress
    );
    assert_eq!(WorkspaceStatus::parse(None), WorkspaceStatus::InProgress);
}

#[test]
fn metadata_is_written_only_when_changed() {
    let l = lookup_from_node(node(json!({})), None);
    let info = l.info().unwrap();
    assert_eq!(metadata_update(info, Some("Add thing"), Some("Body")), None);
    assert_eq!(
        metadata_update(info, Some("Add thing"), None),
        Some(("Add thing", "Body"))
    );
    assert_eq!(
        metadata_update(info, Some("Old"), Some("Body")),
        Some(("Add thing", "Body"))
    );
}
