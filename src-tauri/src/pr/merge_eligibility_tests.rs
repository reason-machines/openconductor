use serde_json::json;

use super::info::lookup_from_node;
use super::info_tests::node;
use super::merge_eligibility::{can_merge, merge_with_optional_failures};
use super::model::ViewerPermission;

fn info(patch: serde_json::Value, perm: ViewerPermission) -> super::info::PrInfo {
    *match lookup_from_node(node(patch), Some(perm)) {
        super::info::PrLookup::Found(i) => i,
        other => panic!("expected a PR, got {other:?}"),
    }
}

fn failing() -> serde_json::Value {
    json!({"target": {"statusCheckRollup": {"contexts": {"nodes": [
        {"name": "lint", "status": "COMPLETED", "conclusion": "FAILURE"}]}}}})
}

#[test]
fn clean_open_pr_with_write_access_can_merge() {
    assert!(can_merge(&info(json!({}), ViewerPermission::Write), false));
    assert!(!can_merge(&info(json!({}), ViewerPermission::Read), false));
    assert!(!can_merge(
        &info(json!({"isDraft": true}), ViewerPermission::Admin),
        false
    ));
    let merged = json!({"state": "MERGED", "mergedAt": "2026-01-02T00:00:00Z"});
    assert!(!can_merge(&info(merged, ViewerPermission::Admin), false));
}

#[test]
fn only_clean_and_unstable_merge_states_qualify() {
    for (state, want) in [
        ("CLEAN", true),
        ("UNSTABLE", true),
        ("BLOCKED", false),
        ("BEHIND", false),
        ("DIRTY", false),
        ("HAS_HOOKS", false),
        ("UNKNOWN", false),
    ] {
        let pr = info(json!({"mergeStateStatus": state}), ViewerPermission::Write);
        assert_eq!(can_merge(&pr, false), want, "{state}");
    }
}

#[test]
fn optional_failures_merge_unless_the_setting_blocks_them() {
    let pr = info(
        json!({"mergeStateStatus": "UNSTABLE", "headRef": failing()}),
        ViewerPermission::Write,
    );
    assert!(can_merge(&pr, false));
    assert!(merge_with_optional_failures(&pr, false));
    assert!(!can_merge(&pr, true));
    assert!(!merge_with_optional_failures(&pr, true));
    let clean = info(json!({"headRef": failing()}), ViewerPermission::Write);
    assert!(
        !merge_with_optional_failures(&clean, false),
        "CLEAN reports no failures"
    );
}
