//! Tauri commands for pull requests. Thin wrappers over [`super::api`]; the
//! `gh` calls run on a blocking thread. Argument names are snake_case here
//! and camelCase on the JS side; errors are the `Display` text.
//!
//! `repo_path` is any checkout of the repository (the main worktree or a
//! workspace); `gh` resolves the GitHub repository from its remote.

use std::sync::OnceLock;

use tauri::async_runtime::spawn_blocking;

use super::api::{self, CreatePrPrompt, LookupRequest, LookupResult};
use super::gh::{MergeMethod, MergeMethodCache};
use super::git_state::{read_git_state, GitState};
use super::header::{header_state, HeaderInputs, HeaderState};
use super::list::{OpenIssue, OpenPr};
use super::prompt::create_pr_prompt;

fn merge_methods() -> &'static MergeMethodCache {
    static CACHE: OnceLock<MergeMethodCache> = OnceLock::new();
    CACHE.get_or_init(MergeMethodCache::default)
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// Each workspace's PR, with the workspace status it implies.
#[tauri::command]
pub async fn pr_lookup(
    repo_path: String,
    requests: Vec<LookupRequest>,
) -> Result<Vec<LookupResult>, String> {
    blocking(move || api::lookup_prs(&api::gh_in(&repo_path), &requests, api::git_current_branch))
        .await
}

/// Open PRs, newest-updated first, for the "Create from..." picker.
/// Errors starting `no_github:` (gh missing or signed out) and `no_remote:`
/// (no GitHub remote) map to the picker's setup states.
#[tauri::command]
pub async fn pr_list_open(repo_path: String) -> Result<Vec<OpenPr>, String> {
    blocking(move || api::list_open_prs(&api::gh_in(&repo_path))).await
}

/// Open GitHub issues, newest-updated first; errors as [`pr_list_open`].
#[tauri::command]
pub async fn gh_issue_list_open(repo_path: String) -> Result<Vec<OpenIssue>, String> {
    blocking(move || api::list_open_issues(&api::gh_in(&repo_path))).await
}

/// Local git state of a workspace checkout, compared with `target_branch`.
#[tauri::command]
pub async fn pr_git_state(
    workspace_path: String,
    target_branch: String,
) -> Result<GitState, String> {
    blocking(move || read_git_state(std::path::Path::new(&workspace_path), &target_branch)).await
}

/// What the workspace header's PR control shows.
#[tauri::command]
pub fn pr_header_state(inputs: HeaderInputs) -> Option<HeaderState> {
    header_state(&inputs)
}

/// The message that asks the workspace's agent to open the PR. Without
/// explicit `customInstructions`, the effective `prompts.create_pr` (user,
/// repository and workspace settings files) is appended, as Conductor's
/// Create PR action reads it per workspace.
#[tauri::command]
pub fn pr_create_prompt(mut request: CreatePrPrompt) -> String {
    if request.custom_instructions.is_none() {
        if let Some(root) = request.repo_path.as_deref() {
            let ws = request.workspace_path.as_deref().map(std::path::Path::new);
            request.custom_instructions =
                crate::settings::effective::resolve(std::path::Path::new(root), ws)
                    .ok()
                    .and_then(|e| e.prompts.create_pr.map(|p| p.value));
        }
    }
    create_pr_prompt(&request.as_request())
}

/// Merge now; without `method`, the repository's preferred allowed one.
#[tauri::command]
pub async fn pr_merge(
    repo_path: String,
    number: u64,
    method: Option<MergeMethod>,
) -> Result<MergeMethod, String> {
    blocking(move || {
        api::merge_pr(
            &api::gh_in(&repo_path),
            merge_methods(),
            &repo_path,
            number,
            method,
        )
    })
    .await
}

/// The method Merge uses for this repository, for the button's tooltip.
#[tauri::command]
pub async fn pr_merge_method(repo_path: String) -> Result<MergeMethod, String> {
    blocking(move || {
        api::preferred_merge_method(&api::gh_in(&repo_path), merge_methods(), &repo_path)
    })
    .await
}

#[tauri::command]
pub async fn pr_set_auto_merge(
    repo_path: String,
    number: u64,
    enabled: bool,
    method: Option<MergeMethod>,
) -> Result<(), String> {
    blocking(move || {
        let gh = api::gh_in(&repo_path);
        api::set_auto_merge(&gh, merge_methods(), &repo_path, number, enabled, method)
    })
    .await
}

#[tauri::command]
pub async fn pr_mark_ready(repo_path: String, number: u64) -> Result<(), String> {
    blocking(move || {
        api::gh_in(&repo_path)
            .mark_ready(number)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn pr_edit(
    repo_path: String,
    number: u64,
    title: Option<String>,
    body: Option<String>,
) -> Result<(), String> {
    blocking(move || {
        let gh = api::gh_in(&repo_path);
        gh.edit(number, title.as_deref(), body.as_deref())
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn pr_retarget(repo_path: String, number: u64, base: String) -> Result<(), String> {
    blocking(move || {
        api::gh_in(&repo_path)
            .retarget(number, &base)
            .map_err(|e| e.to_string())
    })
    .await
}

/// Approve at `head_oid`, the head commit the viewer saw.
#[tauri::command]
pub async fn pr_approve(repo_path: String, number: u64, head_oid: String) -> Result<(), String> {
    blocking(move || {
        api::gh_in(&repo_path)
            .approve(number, &head_oid)
            .map_err(|e| e.to_string())
    })
    .await
}
