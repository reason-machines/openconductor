use serde_json::{json, Value};

use super::header::{header_state, HeaderAction as A, HeaderInputs, Tone, UpstreamSync};
use super::info::{lookup_from_node, PrLookup};
use super::info_tests::node;
use super::model::{MergeQueueState, ViewerPermission};

fn pr(patch: Value) -> PrLookup {
    lookup_from_node(node(patch), Some(ViewerPermission::Write))
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
        Some(A::QueuedToMerge(MergeQueueState::AwaitingChecks))
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
