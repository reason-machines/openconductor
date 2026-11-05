//! Pull requests: read a workspace branch's PR from GitHub, derive what the
//! workspace header should offer (create, fix checks, merge, ...), and run
//! the `gh` commands behind those actions.
//!
//! Behavior follows the reference app as recovered from its shipped
//! frontend bundle; `evidence/pr/NOTES.md` lists each source location, what
//! we match and what differs on purpose.
//!
//! * [`model`]: GraphQL wire types for the fields we select.
//! * [`checks`]: collapse check re-runs and summarize passing / pending /
//!   failing.
//! * [`info`]: normalized PR info and the workspace status it implies.
//! * [`merge_eligibility`]: when the merge button may be offered.
//! * [`header`]: what the workspace header's git/PR control shows.
//! * [`gh`]: run `gh` from a checkout or against `owner/name`; typed
//!   GraphQL variables; the repository's preferred merge method; merge
//!   (squash / merge / rebase), auto-merge, ready, edit, retarget, approve.
//! * [`fetch`]: batched GraphQL lookup of each workspace branch's PR.
//! * [`git_state`]: local git facts for the header (uncommitted work,
//!   changes against the target, push remote, upstream ahead / behind).
//! * [`list`]: open PRs and issues for the "Create from..." picker, with
//!   `no_github:` / `no_remote:` tagged errors.
//! * [`api`]: the operations the Tauri commands run (lookup, merge,
//!   auto-merge, create-PR prompt), free of `tauri` so they are testable.
//! * `commands`: the `#[tauri::command]` wrappers registered in `lib.rs`.
//! * [`prompt`]: the create-PR message sent to the agent, and the
//!   archive-on-merge rule.
//! * [`runs`]: a failing check's GitHub Actions job log, and re-running a
//!   PR's failed jobs (Checks tab).
//! * [`review_comments`]: the PR's GitHub review threads and comments as
//!   `diff_comments` rows, and resolving a thread on GitHub.

pub mod api;
pub mod checks;
/// Checks tab commands (job log, re-run failed); not in the harness.
#[cfg(not(pr_harness))]
pub mod checks_commands;
/// Tauri command wrappers; left out of the standalone harness
/// (`--cfg pr_harness`), which has no `tauri` crate.
#[cfg(not(pr_harness))]
pub mod commands;
pub mod fetch;
pub mod gh;
pub mod git_state;
pub mod header;
pub mod info;
pub mod list;
pub mod merge_eligibility;
pub mod model;
pub mod prompt;
pub mod review_comments;
pub mod runs;

#[cfg(test)]
mod api_tests;
#[cfg(test)]
mod checks_tests;
#[cfg(test)]
mod fetch_tests;
#[cfg(test)]
mod gh_tests;
#[cfg(test)]
mod git_state_tests;
#[cfg(test)]
mod header_tests;
#[cfg(test)]
mod info_tests;
#[cfg(test)]
mod list_tests;
#[cfg(test)]
mod merge_eligibility_tests;
#[cfg(test)]
mod prompt_tests;
#[cfg(test)]
mod review_comments_tests;
#[cfg(test)]
mod runs_tests;
#[cfg(test)]
mod tests;
