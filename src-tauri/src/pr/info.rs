//! Normalized pull request info for a workspace, and the workspace status
//! it implies.

use serde::{Deserialize, Serialize};

use super::checks::{summarize, ChecksSummary};
use super::model::{
    Check, MergeQueueState, MergeStateStatus, PrNode, PrState, ReviewDecision, ViewerPermission,
};

/// What we know about a workspace branch's pull request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "info", rename_all = "camelCase")]
pub enum PrLookup {
    /// No pull request for this branch (or the one found belongs to a
    /// branch the workspace has since left).
    None,
    /// The workspace's pull request was closed without merging.
    Closed,
    Found(Box<PrInfo>),
}

impl PrLookup {
    pub fn info(&self) -> Option<&PrInfo> {
        match self {
            PrLookup::Found(info) => Some(info),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeQueueEntry {
    pub state: MergeQueueState,
    pub position: u32,
    pub enqueued_at: String,
    pub estimated_time_to_merge: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrInfo {
    pub number: u64,
    pub url: String,
    pub title: String,
    pub body: String,
    pub author_login: Option<String>,
    pub base_ref_name: String,
    pub base_ref_oid: Option<String>,
    pub head_ref_name: String,
    pub head_ref_oid: String,
    pub viewer_did_author: Option<bool>,
    /// `Some` when the viewer has reviewed this PR.
    pub viewer_latest_review: Option<ViewerReview>,
    /// `None` when the repository permission was not reported.
    pub viewer_can_merge: Option<bool>,
    pub is_draft: bool,
    pub is_merged: bool,
    pub is_auto_merge_enabled: bool,
    pub merge_queue: Option<MergeQueueEntry>,
    /// Mergeability and checks; `None` once merged (no longer relevant).
    pub status: Option<PrStatus>,
}

/// The viewer's latest review; the commit is unknown when GitHub omits it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerReview {
    pub commit_oid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrStatus {
    pub merge_state: MergeStateStatus,
    pub checks: ChecksSummary,
    pub review_decision: Option<ReviewDecision>,
    pub num_review_requests: u32,
}

/// Convert one GraphQL node. A closed, unmerged node becomes
/// [`PrLookup::Closed`]; the caller decides whether it still applies.
pub fn lookup_from_node(node: PrNode, permission: Option<ViewerPermission>) -> PrLookup {
    if node.state == PrState::Closed && node.merged_at.is_none() {
        return PrLookup::Closed;
    }
    let rollup: Option<Vec<Check>> = node
        .head_ref
        .and_then(|r| r.target)
        .and_then(|t| t.status_check_rollup)
        .map(|r| r.contexts.present().map(Check::from).collect());
    let is_merged = node.merged_at.is_some();
    let status = (!is_merged).then(|| PrStatus {
        merge_state: node.merge_state_status,
        checks: summarize(node.merge_state_status, rollup),
        review_decision: node.review_decision,
        num_review_requests: node.review_requests.total_count,
    });
    PrLookup::Found(Box::new(PrInfo {
        number: node.number,
        url: node.url,
        title: node.title,
        body: node.body,
        author_login: node.author.map(|a| a.login),
        base_ref_name: node.base_ref_name,
        base_ref_oid: node.base_ref.and_then(|r| r.target).and_then(|t| t.oid),
        head_ref_name: node.head_ref_name,
        head_ref_oid: node.head_ref_oid,
        viewer_did_author: node.viewer_did_author,
        viewer_latest_review: node.viewer_latest_review.map(|r| ViewerReview {
            commit_oid: r.commit.map(|c| c.oid),
        }),
        viewer_can_merge: permission.map(ViewerPermission::can_merge),
        is_draft: node.is_draft,
        is_merged,
        is_auto_merge_enabled: node.auto_merge_request.is_some(),
        merge_queue: node.merge_queue_entry.map(|q| MergeQueueEntry {
            state: q.state,
            position: q.position,
            enqueued_at: q.enqueued_at,
            estimated_time_to_merge: q.estimated_time_to_merge,
        }),
        status,
    }))
}

/// Workspace status column values (`workspaces.derived_status`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceStatus {
    Backlog,
    InProgress,
    InReview,
    Done,
    Canceled,
}

impl WorkspaceStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::InProgress => "in-progress",
            Self::InReview => "in-review",
            Self::Done => "done",
            Self::Canceled => "canceled",
        }
    }

    /// Unknown or missing stored values read as in progress.
    pub fn parse(s: Option<&str>) -> Self {
        match s {
            Some("backlog") => Self::Backlog,
            Some("in-review") => Self::InReview,
            Some("done") => Self::Done,
            Some("canceled") => Self::Canceled,
            _ => Self::InProgress,
        }
    }
}

/// Status a workspace gets from its pull request: none means still in
/// progress, open means in review, merged means done, closed means canceled.
pub fn derived_status(lookup: &PrLookup) -> WorkspaceStatus {
    match lookup {
        PrLookup::None => WorkspaceStatus::InProgress,
        PrLookup::Closed => WorkspaceStatus::Canceled,
        PrLookup::Found(info) if info.is_merged => WorkspaceStatus::Done,
        PrLookup::Found(_) => WorkspaceStatus::InReview,
    }
}

/// PR title and body to store on the workspace (`pr_title`,
/// `pr_description`) when they differ from what is stored.
pub fn metadata_update<'a>(
    info: &'a PrInfo,
    stored_title: Option<&str>,
    stored_body: Option<&str>,
) -> Option<(&'a str, &'a str)> {
    let changed =
        stored_title != Some(info.title.as_str()) || stored_body != Some(info.body.as_str());
    changed.then_some((info.title.as_str(), info.body.as_str()))
}
