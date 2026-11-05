//! Wire types for the GitHub GraphQL `PullRequest` fields we read, and the
//! normalized [`PrInfo`] the rest of the app consumes.
//!
//! Field set and enum values match what the reference app selects in its
//! `PrFields` fragment (see `evidence/pr/NOTES.md`). GitHub enum values we
//! do not know deserialize to an `Other`/`Unknown` variant instead of
//! failing the whole batch.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MergeStateStatus {
    Clean,
    Dirty,
    Behind,
    Unstable,
    Blocked,
    Draft,
    HasHooks,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PrState {
    Open,
    Closed,
    Merged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ViewerPermission {
    Admin,
    Maintain,
    Write,
    Triage,
    Read,
    #[serde(other)]
    Other,
}

impl ViewerPermission {
    /// Write access or above can merge.
    pub fn can_merge(self) -> bool {
        matches!(self, Self::Admin | Self::Maintain | Self::Write)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewDecision {
    Approved,
    ChangesRequested,
    ReviewRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MergeQueueState {
    AwaitingChecks,
    Locked,
    Mergeable,
    Queued,
    Unmergeable,
    #[serde(other)]
    Other,
}

/// One entry of `statusCheckRollup.contexts`: either a check run or a
/// commit status context. GitHub's enum values are kept as strings because
/// the two kinds use different, overlapping vocabularies.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RawCheck {
    pub conclusion: Option<String>,
    pub status: Option<String>,
    pub name: Option<String>,
    pub workflow_name: Option<String>,
    pub check_suite: Option<RawCheckSuite>,
    pub details_url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub state: Option<String>,
    pub context: Option<String>,
    pub target_url: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RawCheckSuite {
    pub workflow_run: Option<RawWorkflowRun>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct RawWorkflowRun {
    pub workflow: Option<Named>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct Named {
    pub name: String,
}

/// A check normalized from [`RawCheck`]: the workflow name is lifted out of
/// the check suite when the check run does not carry it directly.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub conclusion: Option<String>,
    pub status: Option<String>,
    pub name: Option<String>,
    pub workflow_name: Option<String>,
    pub details_url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub state: Option<String>,
    pub context: Option<String>,
    pub target_url: Option<String>,
}

impl From<RawCheck> for Check {
    fn from(r: RawCheck) -> Self {
        let suite_workflow = r
            .check_suite
            .and_then(|s| s.workflow_run)
            .and_then(|w| w.workflow)
            .map(|w| w.name);
        Check {
            conclusion: r.conclusion,
            status: r.status,
            name: r.name,
            workflow_name: r.workflow_name.or(suite_workflow),
            details_url: r.details_url,
            started_at: r.started_at,
            completed_at: r.completed_at,
            state: r.state,
            context: r.context,
            target_url: r.target_url,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct Nodes<T> {
    pub nodes: Vec<Option<T>>,
}

impl<T> Nodes<T> {
    pub fn present(self) -> impl Iterator<Item = T> {
        self.nodes.into_iter().flatten()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct Rollup {
    pub contexts: Nodes<RawCheck>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RefTarget {
    pub oid: Option<String>,
    pub status_check_rollup: Option<Rollup>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct GitRef {
    pub target: Option<RefTarget>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CommitRef {
    pub oid: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct LatestReview {
    pub commit: Option<CommitRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct TotalCount {
    #[serde(rename = "totalCount")]
    pub total_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMergeRequest {
    pub enabled_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawMergeQueueEntry {
    pub state: MergeQueueState,
    pub position: u32,
    pub enqueued_at: String,
    pub estimated_time_to_merge: Option<u64>,
}

/// The `PrFields` selection for one pull request.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrNode {
    pub number: u64,
    pub url: String,
    pub author: Option<Author>,
    pub base_ref_name: String,
    pub base_ref: Option<GitRef>,
    pub head_ref_name: String,
    pub head_ref_oid: String,
    pub viewer_did_author: Option<bool>,
    pub viewer_latest_review: Option<LatestReview>,
    pub created_at: String,
    pub updated_at: String,
    pub is_draft: bool,
    pub merge_state_status: MergeStateStatus,
    pub merged_at: Option<String>,
    pub review_decision: Option<ReviewDecision>,
    pub review_requests: TotalCount,
    pub state: PrState,
    pub auto_merge_request: Option<AutoMergeRequest>,
    pub merge_queue_entry: Option<RawMergeQueueEntry>,
    pub title: String,
    pub body: String,
    pub head_ref: Option<GitRef>,
}
