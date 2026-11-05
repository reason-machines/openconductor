//! When the workspace header may offer a merge button for a PR.

use super::info::PrInfo;
use super::model::MergeStateStatus;

/// True when the merge button may be shown for this PR.
pub fn can_merge(info: &PrInfo, optional_checks_block: bool) -> bool {
    let Some(status) = info.status.as_ref() else {
        return false;
    };
    if info.is_merged || info.is_draft || info.viewer_can_merge == Some(false) {
        return false;
    }
    match status.merge_state {
        MergeStateStatus::Clean => true,
        MergeStateStatus::Unstable => !(optional_checks_block && !status.checks.failing.is_empty()),
        _ => false,
    }
}

/// Mergeable although some optional (non-required) checks failed.
pub fn merge_with_optional_failures(info: &PrInfo, optional_checks_block: bool) -> bool {
    !optional_checks_block
        && can_merge(info, false)
        && info.status.as_ref().is_some_and(|s| {
            s.merge_state == MergeStateStatus::Unstable && !s.checks.failing.is_empty()
        })
}
