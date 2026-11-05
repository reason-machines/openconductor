//! GitHub Actions behind the Checks tab: a failing check's job log and
//! re-running a PR's failed jobs.
//!
//! Reference (Conductor 0.87.6 `index-BGEQ8YjU.js`, see
//! `evidence/pr/NOTES.md`): logs come from
//! `gh api repos/<owner>/<repo>/actions/jobs/<job>/logs`, trimmed to the last
//! 1,000 lines. When GitHub has no archived log (an Azure `BlobNotFound` XML
//! body with HTTP 404) and the job never started (no steps, no runner), the
//! check run's annotations are shown instead. Re-run collects the distinct
//! run ids from failing checks' Actions job URLs and runs
//! `gh run rerun <run> --failed` for each, in the workspace.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::gh::{Addressing, CmdOutput, Gh, GhError, Runner};

/// Lines of a job log kept, counting from the end.
pub const LOG_TAIL_LINES: usize = 1000;
pub const JOB_NOT_STARTED: &str = "This job did not start, so no log is available.";
pub const NO_RUN_IDS: &str = "No GitHub Actions run IDs found";

/// A check's `detailsUrl` when it points at a GitHub Actions job:
/// `github.com/<owner>/<repo>/actions/runs/<run>/job/<job>`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionsJob {
    pub owner: String,
    pub repo: String,
    pub run_id: u64,
    pub job_id: u64,
}

fn digits(s: &str) -> Option<u64> {
    let end = s.find(|c: char| !c.is_ascii_digit()).unwrap_or(s.len());
    s[..end].parse().ok()
}

impl ActionsJob {
    /// Parse a details URL; anything else (status contexts, Vercel, other
    /// hosts) is `None`. Like the reference's unanchored regex, a prefix
    /// before `github.com/` and a suffix after the job id are ignored.
    pub fn parse(url: &str) -> Option<Self> {
        let rest = &url[url.find("github.com/")? + "github.com/".len()..];
        let mut parts = rest.splitn(7, '/');
        let owner = parts.next().filter(|s| !s.is_empty())?;
        let repo = parts.next().filter(|s| !s.is_empty())?;
        (parts.next()? == "actions" && parts.next()? == "runs").then_some(())?;
        let run = parts.next()?;
        (run.bytes().all(|b| b.is_ascii_digit()) && parts.next()? == "job").then_some(())?;
        Some(Self {
            owner: owner.into(),
            repo: repo.into(),
            run_id: run.parse().ok()?,
            job_id: digits(parts.next()?)?,
        })
    }
}

/// Distinct Actions run ids among `details_urls`, in first-seen order.
pub fn rerun_run_ids<'a>(details_urls: impl IntoIterator<Item = &'a str>) -> Vec<u64> {
    let mut ids = Vec::new();
    for job in details_urls.into_iter().filter_map(ActionsJob::parse) {
        if !ids.contains(&job.run_id) {
            ids.push(job.run_id);
        }
    }
    ids
}

/// The check whose log to fetch, as the Checks tab knows it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CheckLogRequest {
    pub name: Option<String>,
    pub conclusion: Option<String>,
    pub details_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum CheckLog {
    Logs {
        name: Option<String>,
        conclusion: Option<String>,
        logs: String,
        job_id: u64,
    },
    /// The job never started; its check run's annotations, when any, say why.
    Unavailable {
        name: Option<String>,
        conclusion: Option<String>,
        message: String,
        annotation: Option<String>,
        job_id: u64,
    },
}

#[derive(Debug)]
pub enum LogError {
    /// The check is not a GitHub Actions job, so there is no log to fetch.
    NotActionsJob,
    /// GitHub has no archived log, but the job was not shown to be unstarted.
    NoArchivedLog,
    Gh(GhError),
}

impl std::fmt::Display for LogError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogError::NotActionsJob => write!(f, "this check is not a GitHub Actions job"),
            LogError::NoArchivedLog => write!(f, "GitHub returned no archived log for this job"),
            LogError::Gh(e) => e.fmt(f),
        }
    }
}

impl std::error::Error for LogError {}

fn raw<R: Runner>(gh: &Gh<R>, args: &[&str]) -> std::io::Result<CmdOutput> {
    let cwd: Option<&Path> = match &gh.addressing {
        Addressing::Cwd(dir) => Some(dir),
        Addressing::Repo { .. } => None,
    };
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    gh.runner.run(&gh.gh_path, &args, cwd)
}

fn run<R: Runner>(gh: &Gh<R>, action: &'static str, args: &[&str]) -> Result<String, GhError> {
    let out = raw(gh, args).map_err(GhError::Io)?;
    if out.code != 0 {
        // The reference merges stderr into stdout; keep both for detection.
        return Err(GhError::Failed {
            action,
            stderr: format!("{}\n{}", out.stdout, out.stderr).trim().to_string(),
        });
    }
    Ok(out.stdout)
}

/// GitHub answers a missing archived log with Azure blob XML and a 404.
pub fn is_blob_not_found(text: &str) -> bool {
    let Some(code) = text.find("<Code>BlobNotFound</Code>") else {
        return false;
    };
    let after = &text[code..];
    after
        .find("</Error>")
        .is_some_and(|end| after[end..].contains("gh: HTTP 404"))
}

/// The last `n` lines of `text`.
pub fn tail_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

/// The job's check run API URL when the job never started (no steps and
/// no runner); `None` otherwise or when the job can't be read.
fn unstarted_check_run_url<R: Runner>(gh: &Gh<R>, job: &ActionsJob) -> Option<String> {
    #[derive(Deserialize)]
    struct Job {
        #[serde(default)]
        steps: Option<Vec<serde_json::Value>>,
        #[serde(default)]
        runner_name: Option<String>,
        #[serde(default)]
        check_run_url: Option<String>,
    }
    let path = format!(
        "repos/{}/{}/actions/jobs/{}",
        job.owner, job.repo, job.job_id
    );
    let out = run(gh, "reading the job", &["api", &path]).ok()?;
    let j: Job = serde_json::from_str(&out).ok()?;
    let unstarted =
        j.steps.unwrap_or_default().is_empty() && j.runner_name.unwrap_or_default().is_empty();
    j.check_run_url.filter(|u| unstarted && !u.is_empty())
}

/// Fetch a check's job log (last [`LOG_TAIL_LINES`] lines).
pub fn fetch_check_log<R: Runner>(
    gh: &Gh<R>,
    check: &CheckLogRequest,
) -> Result<CheckLog, LogError> {
    let job = check
        .details_url
        .as_deref()
        .and_then(ActionsJob::parse)
        .ok_or(LogError::NotActionsJob)?;
    let path = format!(
        "repos/{}/{}/actions/jobs/{}/logs",
        job.owner, job.repo, job.job_id
    );
    match run(gh, "fetching the job log", &["api", &path]) {
        Ok(logs) => Ok(CheckLog::Logs {
            name: check.name.clone(),
            conclusion: check.conclusion.clone(),
            logs: tail_lines(&logs, LOG_TAIL_LINES),
            job_id: job.job_id,
        }),
        Err(GhError::Failed { stderr, .. }) if is_blob_not_found(&stderr) => {
            let url = unstarted_check_run_url(gh, &job).ok_or(LogError::NoArchivedLog)?;
            let annotations = format!("{url}/annotations");
            let annotation = run(
                gh,
                "reading annotations",
                &[
                    "api",
                    &annotations,
                    "--paginate",
                    "--jq",
                    "map(.message) | join(\"\\n\\n\")",
                ],
            )
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
            Ok(CheckLog::Unavailable {
                name: check.name.clone(),
                conclusion: check.conclusion.clone(),
                message: JOB_NOT_STARTED.into(),
                annotation,
                job_id: job.job_id,
            })
        }
        Err(e) => Err(LogError::Gh(e)),
    }
}

/// Re-run the failed jobs of every Actions run behind `failing_details_urls`.
/// Returns the run ids re-run; stops at the first failure.
pub fn rerun_failed<R: Runner>(
    gh: &Gh<R>,
    failing_details_urls: &[String],
) -> Result<Vec<u64>, String> {
    let ids = rerun_run_ids(failing_details_urls.iter().map(String::as_str));
    if ids.is_empty() {
        return Err(NO_RUN_IDS.into());
    }
    for id in &ids {
        let id_s = id.to_string();
        let out = raw(gh, &["run", "rerun", &id_s, "--failed"]).map_err(|e| e.to_string())?;
        if out.code != 0 {
            let stderr = out.stderr.trim();
            return Err(if stderr.is_empty() {
                format!("Failed to re-run workflow {id}")
            } else {
                stderr.to_string()
            });
        }
    }
    Ok(ids)
}
