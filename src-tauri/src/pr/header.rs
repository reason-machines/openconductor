//! What the workspace header's git/PR control shows and offers, derived from
//! the PR lookup and the local git state. Order of the rules matters: the
//! first match wins, mirroring the reference app's precedence.

use serde::{Deserialize, Serialize};

use super::checks::ChecksStatus;
use super::info::{PrLookup, PrStatus};
use super::merge_eligibility::{can_merge, merge_with_optional_failures};
use super::model::{MergeQueueState, MergeStateStatus, ReviewDecision};

/// Visual tone of the control.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Tone {
    NoPr,
    Loading,
    OutOfSync,
    InSync,
    Queued,
    Merged,
}

/// The action the control offers, with the data its label needs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum HeaderAction {
    CreatePr,
    Working,
    LoadingPr,
    CommitAndPush,
    /// Local and remote branch histories diverged (remote was rewritten).
    Incompatible,
    Pull {
        behind: u32,
    },
    Push {
        ahead: u32,
    },
    MergeConflicts,
    ChangesRequested {
        has_pending_comments: bool,
    },
    DraftPr,
    ChecksFailing {
        failed: usize,
        total: Option<usize>,
        pending: usize,
        fixable: bool,
    },
    ChecksPending {
        pending: usize,
    },
    ApprovePr,
    ReviewRequired,
    Blocked,
    /// `optional_failed` counts failed checks GitHub does not require.
    ReadyToMerge {
        optional_failed: usize,
    },
    UnableToMerge,
    QueuedToMerge {
        state: MergeQueueState,
    },
    Merged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HeaderState {
    pub tone: Tone,
    pub action: HeaderAction,
}

/// Remote tracking state of the workspace branch.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UpstreamSync {
    pub branch_exists: bool,
    pub diverged: bool,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HeaderInputs {
    /// Latest PR lookup; `None` while it has never loaded.
    pub pr: Option<PrLookup>,
    /// Forge supports creating PRs (GitHub remote).
    pub can_create_pr: bool,
    /// Repository has a remote to push to.
    pub has_remote: bool,
    /// Git status / diff / PR data is still loading.
    pub loading: bool,
    /// Branch differs from its target.
    pub has_changes: bool,
    pub has_uncommitted: bool,
    pub agent_working: bool,
    pub upstream: Option<UpstreamSync>,
    /// Unsubmitted review comments exist for the PR.
    pub has_pending_comments: bool,
    /// Setting: hide merge when any check failed, even optional ones.
    pub optional_checks_block: bool,
}

fn state(tone: Tone, action: HeaderAction) -> Option<HeaderState> {
    Some(HeaderState { tone, action })
}

/// Derive the header control; `None` hides it.
pub fn header_state(i: &HeaderInputs) -> Option<HeaderState> {
    let info = i.pr.as_ref().and_then(PrLookup::info);
    let has_pr = info.is_some();
    if let Some(pr) = info {
        if pr.is_merged {
            return state(Tone::Merged, HeaderAction::Merged);
        }
        if let Some(q) = &pr.merge_queue {
            return state(Tone::Queued, HeaderAction::QueuedToMerge { state: q.state });
        }
    }
    if i.can_create_pr && !has_pr && !i.loading && i.has_changes {
        return state(Tone::NoPr, HeaderAction::CreatePr);
    }
    if i.agent_working && !has_pr {
        return state(Tone::Loading, HeaderAction::Working);
    }
    if i.loading {
        // Merged and queued PRs were handled above.
        return has_pr.then_some(HeaderState {
            tone: Tone::Loading,
            action: HeaderAction::LoadingPr,
        });
    }
    if i.can_create_pr && !has_pr {
        return None;
    }
    if i.has_uncommitted {
        return state(Tone::OutOfSync, HeaderAction::CommitAndPush);
    }
    if let Some(up) = i.upstream.filter(|u| u.branch_exists) {
        if up.diverged {
            return state(Tone::OutOfSync, HeaderAction::Incompatible);
        }
        if up.behind > 0 {
            return state(Tone::OutOfSync, HeaderAction::Pull { behind: up.behind });
        }
        if up.ahead > 0 {
            return state(Tone::OutOfSync, HeaderAction::Push { ahead: up.ahead });
        }
    }
    let status = info.and_then(|p| p.status.as_ref());
    if status.is_some_and(|s| s.merge_state == MergeStateStatus::Dirty) {
        return state(Tone::OutOfSync, HeaderAction::MergeConflicts);
    }
    if status.is_some_and(|s| s.review_decision == Some(ReviewDecision::ChangesRequested)) {
        let has_pending_comments = i.has_pending_comments;
        return state(
            Tone::OutOfSync,
            HeaderAction::ChangesRequested {
                has_pending_comments,
            },
        );
    }
    if info.is_some_and(|p| p.is_draft) {
        return state(Tone::NoPr, HeaderAction::DraftPr);
    }
    let optional_only =
        info.is_some_and(|p| merge_with_optional_failures(p, i.optional_checks_block));
    let checks_not_passing =
        |s: &&PrStatus| matches!(s.checks.status, Some(st) if st != ChecksStatus::Passing);
    if let Some(s) = status.filter(checks_not_passing).filter(|_| !optional_only) {
        let c = &s.checks;
        if c.status == Some(ChecksStatus::Failing)
            || (c.num_checks.is_some() && !c.failing.is_empty())
        {
            let fixable = c.failing.iter().any(|f| f.details_url.is_some());
            let (failed, total, pending) = (c.failing.len(), c.num_checks, c.num_pending);
            return state(
                Tone::OutOfSync,
                HeaderAction::ChecksFailing {
                    failed,
                    total,
                    pending,
                    fixable,
                },
            );
        }
        if c.status == Some(ChecksStatus::Pending) {
            return state(
                Tone::OutOfSync,
                HeaderAction::ChecksPending {
                    pending: c.num_pending,
                },
            );
        }
    }
    if let (Some(pr), Some(s)) = (info, status) {
        if s.review_decision == Some(ReviewDecision::ReviewRequired) {
            let review_is_stale = match &pr.viewer_latest_review {
                None => true,
                Some(review) => review
                    .commit_oid
                    .as_deref()
                    .is_some_and(|c| c != pr.head_ref_oid),
            };
            let can_approve = pr.viewer_can_merge == Some(true)
                && pr.viewer_did_author != Some(true)
                && review_is_stale;
            let action = if can_approve {
                HeaderAction::ApprovePr
            } else {
                HeaderAction::ReviewRequired
            };
            return state(Tone::OutOfSync, action);
        }
        if s.merge_state == MergeStateStatus::Blocked {
            return state(Tone::OutOfSync, HeaderAction::Blocked);
        }
    }
    if let Some(pr) = info {
        let s = pr.status.as_ref();
        if s.is_some_and(|s| s.merge_state == MergeStateStatus::Unknown) {
            return state(Tone::Loading, HeaderAction::LoadingPr);
        }
        if pr.viewer_can_merge == Some(false) {
            return None;
        }
        if can_merge(pr, i.optional_checks_block) {
            let optional_failed = if optional_only {
                s.map_or(0, |s| s.checks.failing.len())
            } else {
                0
            };
            return state(Tone::InSync, HeaderAction::ReadyToMerge { optional_failed });
        }
        return state(Tone::OutOfSync, HeaderAction::UnableToMerge);
    }
    if !i.has_remote {
        return None;
    }
    state(Tone::NoPr, HeaderAction::CreatePr)
}
