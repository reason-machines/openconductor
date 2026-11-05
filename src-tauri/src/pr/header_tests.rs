use serde_json::{json, Value};

use super::header::{header_state, HeaderAction as A, HeaderInputs, Tone, UpstreamSync};
use super::info::{lookup_from_node, PrLookup};
use super::info_tests::node;
use super::merge_eligibility::can_merge;
use super::model::{MergeQueueState, ViewerPermission};

fn pr(patch: Value) -> PrLookup {
    lookup_from_node(node(patch), Some(ViewerPermission::Write))
}

fn failing_check(details: bool) -> Value {
    let mut c = json!({"name": "test", "status": "COMPLETED", "conclusion": "FAILURE"});
    if details {
        c["detailsUrl"] = json!("https://ci/1");
    }
    json!({"target": {"statusCheckRollup": {"contexts": {"nodes": [c]}}}})
}

fn with_pr(lookup: &PrLookup) -> HeaderInputs {
    HeaderInputs {
        pr: Some(lookup.clone()),
        can_create_pr: true,
        has_remote: true,
        ..Default::default()
    }
}

fn action(i: &HeaderInputs) -> Option<A> {
    header_state(i).map(|s| s.action)
}

#[test]
fn no_pr_offers_create_only_with_changes() {
    let none = PrLookup::None;
    let mut i = with_pr(&none);
    assert_eq!(action(&i), None);
    i.has_changes = true;
    assert_eq!(header_state(&i).unwrap().tone, Tone::NoPr);
    assert_eq!(action(&i), Some(A::CreatePr));
    i.loading = true;
    assert_eq!(action(&i), None, "loading without a PR shows nothing");
    i.loading = false;
    i.has_changes = false;
    i.agent_working = true;
    assert_eq!(action(&i), Some(A::Working));
    // A closed PR counts as no PR.
    let closed = PrLookup::Closed;
    let i = HeaderInputs {
        has_changes: true,
        ..with_pr(&closed)
    };
    assert_eq!(action(&i), Some(A::CreatePr));
}

#[test]
fn merged_and_queued_win_over_everything() {
    let merged = pr(json!({"state": "MERGED", "mergedAt": "2026-01-02T00:00:00Z"}));
    let i = HeaderInputs {
        has_uncommitted: true,
        loading: true,
        ..with_pr(&merged)
    };
    assert_eq!(header_state(&i).unwrap().tone, Tone::Merged);
    let queued = pr(json!({"mergeQueueEntry": {
        "state": "AWAITING_CHECKS", "position": 1, "enqueuedAt": "2026-01-01T00:00:00Z"}}));
    let i = HeaderInputs {
        loading: true,
        ..with_pr(&queued)
    };
    assert_eq!(
        action(&i),
        Some(A::QueuedToMerge {
            state: MergeQueueState::AwaitingChecks
        })
    );
}

#[test]
fn local_state_comes_before_pr_state() {
    let p = pr(json!({"mergeStateStatus": "DIRTY"}));
    let mut i = HeaderInputs {
        has_uncommitted: true,
        ..with_pr(&p)
    };
    assert_eq!(action(&i), Some(A::CommitAndPush));
    i.has_uncommitted = false;
    let up = UpstreamSync {
        branch_exists: true,
        diverged: false,
        ahead: 2,
        behind: 1,
    };
    i.upstream = Some(up);
    assert_eq!(action(&i), Some(A::Pull { behind: 1 }));
    i.upstream = Some(UpstreamSync { behind: 0, ..up });
    assert_eq!(action(&i), Some(A::Push { ahead: 2 }));
    i.upstream = Some(UpstreamSync {
        diverged: true,
        ..up
    });
    assert_eq!(action(&i), Some(A::Incompatible));
    i.upstream = Some(UpstreamSync {
        branch_exists: false,
        ..up
    });
    assert_eq!(action(&i), Some(A::MergeConflicts));
}

#[test]
fn review_and_draft_states() {
    let p = pr(json!({"mergeStateStatus": "BLOCKED", "reviewDecision": "CHANGES_REQUESTED"}));
    let i = HeaderInputs {
        has_pending_comments: true,
        ..with_pr(&p)
    };
    assert_eq!(
        action(&i),
        Some(A::ChangesRequested {
            has_pending_comments: true
        })
    );
    let p = pr(json!({"isDraft": true, "mergeStateStatus": "DRAFT"}));
    assert_eq!(header_state(&with_pr(&p)).unwrap().tone, Tone::NoPr);
    assert_eq!(action(&with_pr(&p)), Some(A::DraftPr));
    let p = pr(json!({"mergeStateStatus": "BLOCKED", "reviewDecision": "REVIEW_REQUIRED"}));
    assert_eq!(
        action(&with_pr(&p)),
        Some(A::ApprovePr),
        "write access, not author, not reviewed"
    );
    let p = pr(
        json!({"mergeStateStatus": "BLOCKED", "reviewDecision": "REVIEW_REQUIRED",
        "viewerLatestReview": {"commit": {"oid": "head1"}}}),
    );
    assert_eq!(
        action(&with_pr(&p)),
        Some(A::ReviewRequired),
        "already reviewed this head"
    );
    let p = pr(
        json!({"mergeStateStatus": "BLOCKED", "reviewDecision": "REVIEW_REQUIRED",
        "viewerDidAuthor": true}),
    );
    assert_eq!(
        action(&with_pr(&p)),
        Some(A::ReviewRequired),
        "authors cannot approve"
    );
    let p = pr(json!({"mergeStateStatus": "BLOCKED"}));
    assert_eq!(action(&with_pr(&p)), Some(A::Blocked));
}

#[test]
fn failing_and_pending_checks() {
    let p = pr(json!({"mergeStateStatus": "BLOCKED", "headRef": failing_check(true)}));
    let want = A::ChecksFailing {
        failed: 1,
        total: Some(1),
        pending: 0,
        fixable: true,
    };
    assert_eq!(action(&with_pr(&p)), Some(want));
    let p = pr(
        json!({"mergeStateStatus": "BLOCKED", "headRef": {"target": {"statusCheckRollup":
        {"contexts": {"nodes": [{"name": "t", "status": "QUEUED"}]}}}}}),
    );
    assert_eq!(action(&with_pr(&p)), Some(A::ChecksPending { pending: 1 }));
}

#[test]
fn optional_check_failures_still_allow_merge_unless_blocking() {
    let p = pr(json!({"mergeStateStatus": "UNSTABLE", "headRef": failing_check(false)}));
    let mut i = with_pr(&p);
    assert_eq!(action(&i), Some(A::ReadyToMerge { optional_failed: 1 }));
    assert!(can_merge(p.info().unwrap(), false));
    i.optional_checks_block = true;
    assert!(!can_merge(p.info().unwrap(), true));
    let want = A::ChecksFailing {
        failed: 1,
        total: Some(1),
        pending: 0,
        fixable: false,
    };
    assert_eq!(action(&i), Some(want));
}

#[test]
fn mergeability_outcomes() {
    let p = pr(json!({}));
    assert_eq!(header_state(&with_pr(&p)).unwrap().tone, Tone::InSync);
    assert_eq!(
        action(&with_pr(&p)),
        Some(A::ReadyToMerge { optional_failed: 0 })
    );
    let p = pr(json!({"mergeStateStatus": "UNKNOWN"}));
    assert_eq!(
        action(&with_pr(&p)),
        Some(A::LoadingPr),
        "GitHub still computing"
    );
    let p = pr(json!({"mergeStateStatus": "BEHIND"}));
    assert_eq!(action(&with_pr(&p)), Some(A::UnableToMerge));
    let read_only = lookup_from_node(node(json!({})), Some(ViewerPermission::Read));
    assert_eq!(
        action(&with_pr(&read_only)),
        None,
        "no merge control without write access"
    );
    let loading = HeaderInputs {
        loading: true,
        ..with_pr(&p)
    };
    assert_eq!(action(&loading), Some(A::LoadingPr));
}

#[test]
fn forge_without_pr_creation() {
    let none = PrLookup::None;
    let i = HeaderInputs {
        pr: Some(none.clone()),
        has_remote: true,
        ..Default::default()
    };
    assert_eq!(action(&i), Some(A::CreatePr));
    let i = HeaderInputs {
        pr: Some(none.clone()),
        ..Default::default()
    };
    assert_eq!(action(&i), None);
}
