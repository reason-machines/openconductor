//! Fetch the pull request for several workspace branches of one repository
//! in a single GraphQL call: by pinned PR number when known, otherwise the
//! newest open PR whose head is the branch.

use serde_json::Value;

use super::checks::parse_timestamp_ms;
use super::gh::{Gh, GhError, Runner, Var};
use super::info::{lookup_from_node, PrLookup};
use super::model::{PrNode, PrState, ViewerPermission};

/// At most this many workspaces per query, to bound GraphQL cost.
pub const BATCH_SIZE: usize = 5;

/// One workspace's lookup request.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PrRequest {
    /// Branch currently checked out in the workspace (the PR head to find).
    pub local_branch: String,
    /// Branch stored for the workspace.
    pub workspace_branch: String,
    /// Remote branch it tracks; a pinned PR with another head is ignored.
    pub upstream_branch: Option<String>,
    /// PR number already associated with the workspace.
    pub pr_number: Option<u64>,
}

/// The fields selected for every pull request.
pub const PR_FIELDS: &str = "fragment PrFields on PullRequest { number url author { login avatarUrl } baseRefName baseRef { target { oid } } headRefName headRefOid viewerDidAuthor viewerLatestReview { commit { oid } } createdAt updatedAt isDraft mergeable mergeStateStatus mergedAt reviewDecision reviewRequests(first: 1) { totalCount } state autoMergeRequest { enabledAt } mergeQueueEntry { state position enqueuedAt estimatedTimeToMerge } title body headRef { target { ... on Commit { statusCheckRollup { contexts(first: 100) { nodes { ... on CheckRun { conclusion status name detailsUrl startedAt completedAt checkSuite { workflowRun { workflow { name } } } } ... on StatusContext { state context targetUrl } } } } } } } }";

/// Query for `count` workspaces: aliases `pr<i>ByBranch` / `pr<i>ByNumber`,
/// one of which is skipped per workspace via `$hasPrNumber<i>`.
pub fn build_query(count: usize) -> String {
    let mut params = String::from("$owner: String!, $repo: String!");
    let mut body = String::new();
    for i in 0..count {
        params.push_str(&format!(
            ", $headRefName{i}: String!, $prNumber{i}: Int!, $hasPrNumber{i}: Boolean!"
        ));
        body.push_str(&format!(
            " pr{i}ByBranch: pullRequests(first: 5, headRefName: $headRefName{i}, states: [OPEN, MERGED], orderBy: {{field: CREATED_AT, direction: DESC}}) @skip(if: $hasPrNumber{i}) {{ nodes {{ ...PrFields }} }} \
             pr{i}ByNumber: pullRequest(number: $prNumber{i}) @include(if: $hasPrNumber{i}) {{ ...PrFields }}"
        ));
    }
    format!("{PR_FIELDS} query({params}) {{ repository(owner: $owner, name: $repo) {{ viewerPermission{body} }} }}")
}

fn request_vars(requests: &[PrRequest]) -> Vec<(String, Var)> {
    let mut vars = Vec::new();
    for (i, r) in requests.iter().enumerate() {
        vars.push((format!("headRefName{i}"), Var::Str(r.local_branch.clone())));
        vars.push((format!("prNumber{i}"), Var::Int(r.pr_number.unwrap_or(0))));
        vars.push((format!("hasPrNumber{i}"), Var::Bool(r.pr_number.is_some())));
    }
    vars
}

fn parse_node(v: &Value) -> Option<PrNode> {
    serde_json::from_value(v.clone()).ok()
}

fn time(s: &str) -> i64 {
    parse_timestamp_ms(s).unwrap_or(0)
}

/// Pick the node for one request from the repository object.
fn select(repo: &Value, i: usize, r: &PrRequest) -> Option<PrNode> {
    if r.pr_number.is_none() {
        let nodes = repo[format!("pr{i}ByBranch")]["nodes"].as_array()?;
        let mut open: Vec<PrNode> = nodes
            .iter()
            .filter_map(parse_node)
            .filter(|n| n.state == PrState::Open)
            .collect();
        open.sort_by_key(|n| std::cmp::Reverse((time(&n.created_at), time(&n.updated_at))));
        return open.into_iter().next();
    }
    let node = parse_node(&repo[format!("pr{i}ByNumber")])?;
    match &r.upstream_branch {
        Some(up) if *up != node.head_ref_name => None,
        _ => Some(node),
    }
}

/// Resolve one request. A closed PR only counts when its head is still the
/// workspace's branch and that branch is still checked out; `current_branch`
/// is asked only then. `None` means it could not be determined.
fn resolve(
    node: Option<PrNode>,
    r: &PrRequest,
    permission: Option<ViewerPermission>,
    current_branch: &mut impl FnMut(&PrRequest) -> Option<String>,
) -> Option<PrLookup> {
    let Some(node) = node else {
        return Some(PrLookup::None);
    };
    let closed = node.state == PrState::Closed && node.merged_at.is_none();
    if !closed {
        return Some(lookup_from_node(node, permission));
    }
    if node.head_ref_name != r.local_branch {
        return Some(PrLookup::None);
    }
    let checked_out = current_branch(r)?;
    Some(if checked_out.trim() == r.workspace_branch {
        PrLookup::Closed
    } else {
        PrLookup::None
    })
}

/// Look up PRs for `requests`, in batches of [`BATCH_SIZE`]. Results line
/// up with `requests`.
pub fn fetch_prs<R: Runner>(
    gh: &Gh<R>,
    requests: &[PrRequest],
    mut current_branch: impl FnMut(&PrRequest) -> Option<String>,
) -> Result<Vec<Option<PrLookup>>, GhError> {
    let mut out = Vec::with_capacity(requests.len());
    for batch in requests.chunks(BATCH_SIZE) {
        let mut vars = gh.repo_vars().to_vec();
        vars.extend(request_vars(batch));
        let stdout = gh.graphql("Loading pull requests", &build_query(batch.len()), &vars)?;
        let resp: Value =
            serde_json::from_str(&stdout).map_err(|e| GhError::Parse(e.to_string()))?;
        let repo = &resp["data"]["repository"];
        if repo.is_null() {
            let msg = resp["errors"][0]["message"]
                .as_str()
                .unwrap_or("no repository data");
            return Err(GhError::Parse(msg.to_string()));
        }
        let permission: Option<ViewerPermission> =
            serde_json::from_value(repo["viewerPermission"].clone()).ok();
        for (i, r) in batch.iter().enumerate() {
            out.push(resolve(
                select(repo, i, r),
                r,
                permission,
                &mut current_branch,
            ));
        }
    }
    Ok(out)
}
