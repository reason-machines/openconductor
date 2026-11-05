//! Operations behind the PR area's Tauri commands, kept free of `tauri` so
//! the standalone harness can test them. Errors are the `Display` text.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use super::fetch::{fetch_prs, PrRequest};
use super::gh::{Addressing, Gh, MergeMethod, MergeMethodCache, ProcessRunner, Runner};
use super::info::{derived_status, PrLookup, WorkspaceStatus};
use super::prompt::CreatePrRequest;

/// `gh` to run: `$OPENCONDUCTOR_GH` when set (a bundled copy), else `gh` on PATH.
pub fn gh_path() -> PathBuf {
    std::env::var_os("OPENCONDUCTOR_GH").map_or_else(|| PathBuf::from("gh"), PathBuf::from)
}

/// `gh` addressing the repository checked out at `repo_path`.
pub fn gh_in(repo_path: &str) -> Gh<ProcessRunner> {
    Gh {
        runner: ProcessRunner,
        gh_path: gh_path(),
        addressing: Addressing::Cwd(repo_path.into()),
    }
}

/// Branch checked out in `path`, or `None` when git can't tell.
pub fn git_current_branch(path: &Path) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(["branch", "--show-current"])
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupRequest {
    pub workspace_path: PathBuf,
    pub local_branch: String,
    pub workspace_branch: String,
    #[serde(default)]
    pub upstream_branch: Option<String>,
    #[serde(default)]
    pub pr_number: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupResult {
    /// `None` when it could not be determined this time; keep the previous.
    pub lookup: Option<PrLookup>,
    pub derived_status: Option<WorkspaceStatus>,
}

/// Look up each workspace's PR in one repository.
pub fn lookup_prs<R: Runner>(
    gh: &Gh<R>,
    requests: &[LookupRequest],
    mut current_branch: impl FnMut(&Path) -> Option<String>,
) -> Result<Vec<LookupResult>, String> {
    let prs: Vec<PrRequest> = requests
        .iter()
        .map(|r| PrRequest {
            local_branch: r.local_branch.clone(),
            workspace_branch: r.workspace_branch.clone(),
            upstream_branch: r.upstream_branch.clone(),
            pr_number: r.pr_number,
        })
        .collect();
    // Worktrees of one repository never share a checked-out branch.
    let lookups = fetch_prs(gh, &prs, |pr| {
        let r = requests
            .iter()
            .find(|r| r.local_branch == pr.local_branch)?;
        current_branch(&r.workspace_path)
    })
    .map_err(|e| e.to_string())?;
    Ok(lookups
        .into_iter()
        .map(|lookup| LookupResult {
            derived_status: lookup.as_ref().map(derived_status),
            lookup,
        })
        .collect())
}

/// Merge with `method`, or the repository's preferred allowed method.
pub fn merge_pr<R: Runner>(
    gh: &Gh<R>,
    cache: &MergeMethodCache,
    repo_key: &str,
    number: u64,
    method: Option<MergeMethod>,
) -> Result<MergeMethod, String> {
    let method = resolve_method(gh, cache, repo_key, method)?;
    gh.merge(number, method).map_err(|e| e.to_string())?;
    Ok(method)
}

/// Turn auto-merge on (with `method` or the preferred one) or off.
pub fn set_auto_merge<R: Runner>(
    gh: &Gh<R>,
    cache: &MergeMethodCache,
    repo_key: &str,
    number: u64,
    enabled: bool,
    method: Option<MergeMethod>,
) -> Result<(), String> {
    if !enabled {
        return gh.disable_auto_merge(number).map_err(|e| e.to_string());
    }
    let method = resolve_method(gh, cache, repo_key, method)?;
    gh.enable_auto_merge(number, method)
        .map_err(|e| e.to_string())
}

fn resolve_method<R: Runner>(
    gh: &Gh<R>,
    cache: &MergeMethodCache,
    repo_key: &str,
    method: Option<MergeMethod>,
) -> Result<MergeMethod, String> {
    match method {
        Some(m) => Ok(m),
        None => cache
            .get_or_fetch(repo_key, || gh.allowed_merge_method())
            .map_err(|e| e.to_string()),
    }
}

/// Owned form of [`CreatePrRequest`] for IPC.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CreatePrPrompt {
    pub branch: String,
    pub remote: String,
    pub target_branch: String,
    pub draft: bool,
    pub diff_tool: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub template: Option<String>,
    pub custom_instructions: Option<String>,
}

impl CreatePrPrompt {
    pub fn as_request(&self) -> CreatePrRequest<'_> {
        CreatePrRequest {
            branch: &self.branch,
            remote: &self.remote,
            target_branch: &self.target_branch,
            draft: self.draft,
            diff_tool: self.diff_tool.as_deref(),
            title: self.title.as_deref(),
            description: self.description.as_deref(),
            template: self.template.as_deref(),
            custom_instructions: self.custom_instructions.as_deref(),
        }
    }
}
