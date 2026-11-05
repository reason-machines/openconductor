//! Open PRs and issues for the "Create from..." picker, read with
//! `gh pr list` / `gh issue list` from a checkout.
//!
//! Errors are tagged so the picker can tell its states apart: `no_github:`
//! when `gh` is missing or not signed in, `no_remote:` when the checkout has
//! no GitHub remote (or is not a git repository). Anything else is the plain
//! failure text.

use std::fmt;
use std::io;

use serde::{Deserialize, Serialize};

use super::gh::{Addressing, Gh, Runner};

/// How many open PRs or issues one call returns.
pub const LIST_LIMIT: u32 = 100;

const PR_FIELDS: &str =
    "number,title,headRefName,baseRefName,author,isCrossRepository,headRepositoryOwner,updatedAt";
const ISSUE_FIELDS: &str = "number,title,url,body,updatedAt";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPr {
    pub number: u64,
    pub title: String,
    pub head_ref_name: String,
    pub base_ref_name: String,
    /// Author login; `None` for a deleted account.
    pub author: Option<String>,
    pub is_cross_repository: bool,
    /// Login of the head repository's owner; `None` when the fork is gone.
    pub head_repository_owner: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenIssue {
    pub number: u64,
    pub title: String,
    pub url: String,
    /// `None` when the issue has no description.
    pub body: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ListError {
    /// `gh` is not installed or not signed in.
    NoGithub(String),
    /// The checkout has no remote on a GitHub host, or is not a repository.
    NoRemote(String),
    Other(String),
}

impl fmt::Display for ListError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ListError::NoGithub(m) => write!(f, "no_github: {m}"),
            ListError::NoRemote(m) => write!(f, "no_remote: {m}"),
            ListError::Other(m) => f.write_str(m),
        }
    }
}

impl std::error::Error for ListError {}

/// Classify a failed `gh` run by exit code and stderr (gh 2.x wording).
fn classify(action: &str, code: i32, stderr: &str) -> ListError {
    let msg = stderr.trim().to_string();
    let lower = msg.to_lowercase();
    // Checked before auth: the non-GitHub-remote message also mentions `gh auth login`.
    let no_remote = [
        "no git remotes found",
        "none of the git remotes configured",
        "not a git repository",
    ];
    if no_remote.iter().any(|p| lower.contains(p)) {
        return ListError::NoRemote(msg);
    }
    let no_auth = [
        "gh auth login",
        "not logged in",
        "http 401",
        "bad credentials",
    ];
    if code == 4 || no_auth.iter().any(|p| lower.contains(p)) {
        return ListError::NoGithub(msg);
    }
    if msg.is_empty() {
        ListError::Other(format!("{action} failed"))
    } else {
        ListError::Other(format!("{action} failed: {msg}"))
    }
}

impl<R: Runner> Gh<R> {
    fn list_json(&self, action: &str, kind: &str, fields: &str) -> Result<String, ListError> {
        let mut args: Vec<String> = [
            kind,
            "list",
            "--state",
            "open",
            "--limit",
            &LIST_LIMIT.to_string(),
            "--json",
            fields,
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        if let Addressing::Repo { owner, name } = &self.addressing {
            args.extend(["--repo".to_string(), format!("{owner}/{name}")]);
        }
        let cwd = match &self.addressing {
            Addressing::Cwd(dir) => Some(dir.as_path()),
            Addressing::Repo { .. } => None,
        };
        let out = self
            .runner
            .run(&self.gh_path, &args, cwd)
            .map_err(|e| match e.kind() {
                io::ErrorKind::NotFound => ListError::NoGithub("gh is not installed".into()),
                _ => ListError::Other(format!("couldn't run gh: {e}")),
            })?;
        if out.code != 0 {
            return Err(classify(action, out.code, &out.stderr));
        }
        Ok(out.stdout)
    }

    /// Open PRs, most recently updated first.
    pub fn list_open_prs(&self) -> Result<Vec<OpenPr>, ListError> {
        #[derive(Deserialize)]
        struct Login {
            login: String,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Row {
            number: u64,
            title: String,
            head_ref_name: String,
            base_ref_name: String,
            author: Option<Login>,
            #[serde(default)]
            is_cross_repository: bool,
            head_repository_owner: Option<Login>,
            updated_at: String,
        }
        let out = self.list_json("Listing pull requests", "pr", PR_FIELDS)?;
        let mut rows: Vec<Row> = parse(&out)?;
        sort_newest_first(&mut rows, |r| &r.updated_at);
        let login = |l: Option<Login>| l.map(|l| l.login).filter(|l| !l.is_empty());
        Ok(rows
            .into_iter()
            .map(|r| OpenPr {
                number: r.number,
                title: r.title,
                head_ref_name: r.head_ref_name,
                base_ref_name: r.base_ref_name,
                author: login(r.author),
                is_cross_repository: r.is_cross_repository,
                head_repository_owner: login(r.head_repository_owner),
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Open issues (PRs excluded by `gh`), most recently updated first.
    pub fn list_open_issues(&self) -> Result<Vec<OpenIssue>, ListError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Row {
            number: u64,
            title: String,
            url: String,
            body: Option<String>,
            #[serde(default)]
            updated_at: String,
        }
        let out = self.list_json("Listing issues", "issue", ISSUE_FIELDS)?;
        let mut rows: Vec<Row> = parse(&out)?;
        sort_newest_first(&mut rows, |r| &r.updated_at);
        Ok(rows
            .into_iter()
            .map(|r| OpenIssue {
                number: r.number,
                title: r.title,
                url: r.url,
                body: r.body.filter(|b| !b.trim().is_empty()),
            })
            .collect())
    }
}

fn parse<T: for<'de> Deserialize<'de>>(out: &str) -> Result<Vec<T>, ListError> {
    // `gh` prints nothing (not `[]`) for an empty list on some versions.
    if out.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(out)
        .map_err(|e| ListError::Other(format!("unexpected response from GitHub: {e}")))
}

/// RFC 3339 UTC timestamps from GitHub sort correctly as strings; stable, so
/// equal times keep `gh`'s order.
fn sort_newest_first<T>(rows: &mut [T], updated_at: impl Fn(&T) -> &str) {
    rows.sort_by(|a, b| updated_at(b).cmp(updated_at(a)));
}
