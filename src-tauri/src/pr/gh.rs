//! The `gh` invocations behind PR actions. Commands are run as argv (no
//! shell), either from the repository's directory, letting `gh` resolve the
//! repository from its remote, or against an explicit `owner/name`.

use std::collections::HashMap;
use std::fmt;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MergeMethod {
    Squash,
    Merge,
    Rebase,
}

impl MergeMethod {
    pub fn flag(self) -> &'static str {
        match self {
            Self::Squash => "--squash",
            Self::Merge => "--merge",
            Self::Rebase => "--rebase",
        }
    }
}

/// Which repository a command targets.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Addressing {
    /// Run inside this checkout; `gh` reads the repository from its remote.
    Cwd(PathBuf),
    Repo {
        owner: String,
        name: String,
    },
}

impl Addressing {
    /// Parse `owner/name`; the owner may contain slashes (nested namespaces).
    pub fn repo(full_name: &str) -> Option<Self> {
        let (owner, name) = full_name.rsplit_once('/')?;
        (!owner.is_empty() && !name.is_empty()).then(|| Self::Repo {
            owner: owner.into(),
            name: name.into(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CmdOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Runs a program; swapped for a fake in tests.
pub trait Runner {
    fn run(&self, program: &Path, args: &[String], cwd: Option<&Path>) -> io::Result<CmdOutput>;
}

pub struct ProcessRunner;

impl Runner for ProcessRunner {
    fn run(&self, program: &Path, args: &[String], cwd: Option<&Path>) -> io::Result<CmdOutput> {
        let mut cmd = Command::new(program);
        cmd.args(args);
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }
        let out = cmd.output()?;
        Ok(CmdOutput {
            code: out.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        })
    }
}

#[derive(Debug)]
pub enum GhError {
    /// `gh` exited non-zero; `action` says what we were doing.
    Failed {
        action: &'static str,
        stderr: String,
    },
    /// The repository's allowed merge methods could not be read.
    MergeMethodUnknown,
    Parse(String),
    Io(io::Error),
}

impl fmt::Display for GhError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GhError::Failed { action, stderr } if stderr.trim().is_empty() => {
                write!(f, "{action} failed")
            }
            GhError::Failed { action, stderr } => write!(f, "{action} failed: {}", stderr.trim()),
            GhError::MergeMethodUnknown => write!(
                f,
                "couldn't read which merge methods this repository allows; check your GitHub access and retry"
            ),
            GhError::Parse(e) => write!(f, "unexpected response from GitHub: {e}"),
            GhError::Io(e) => write!(f, "couldn't run gh: {e}"),
        }
    }
}

impl std::error::Error for GhError {}

/// A GraphQL variable passed to `gh api graphql`. Strings go through `-f`
/// so `gh` never reinterprets them (numbers, `true`, `@file`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Var {
    Str(String),
    Int(u64),
    Bool(bool),
}

const MERGE_METHODS_QUERY: &str = "query($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { squashMergeAllowed rebaseMergeAllowed mergeCommitAllowed } }";

pub struct Gh<R: Runner> {
    pub runner: R,
    pub gh_path: PathBuf,
    pub addressing: Addressing,
}

impl<R: Runner> Gh<R> {
    fn cwd(&self) -> Option<&Path> {
        match &self.addressing {
            Addressing::Cwd(dir) => Some(dir),
            Addressing::Repo { .. } => None,
        }
    }

    fn exec(&self, action: &'static str, args: Vec<String>) -> Result<String, GhError> {
        let out = self
            .runner
            .run(&self.gh_path, &args, self.cwd())
            .map_err(GhError::Io)?;
        if out.code != 0 {
            return Err(GhError::Failed {
                action,
                stderr: out.stderr,
            });
        }
        Ok(out.stdout)
    }

    /// Owner and name as GraphQL variables; `{owner}`/`{repo}` are filled in
    /// by `gh` from the checkout when addressing by directory.
    pub fn repo_vars(&self) -> [(String, Var); 2] {
        match &self.addressing {
            Addressing::Cwd(_) => [
                ("owner".into(), Var::Str("{owner}".into())),
                ("repo".into(), Var::Str("{repo}".into())),
            ],
            Addressing::Repo { owner, name } => [
                ("owner".into(), Var::Str(owner.clone())),
                ("repo".into(), Var::Str(name.clone())),
            ],
        }
    }

    pub fn graphql(
        &self,
        action: &'static str,
        query: &str,
        vars: &[(String, Var)],
    ) -> Result<String, GhError> {
        let mut args = vec!["api".to_string(), "graphql".to_string()];
        for (k, v) in vars {
            let (flag, value) = match v {
                // `{owner}`/`{repo}` placeholders are only expanded in typed fields.
                Var::Str(s) if s == "{owner}" || s == "{repo}" => ("-F", s.clone()),
                Var::Str(s) => ("-f", s.clone()),
                Var::Int(n) => ("-F", n.to_string()),
                Var::Bool(b) => ("-F", b.to_string()),
            };
            args.extend([flag.to_string(), format!("{k}={value}")]);
        }
        args.extend(["-f".to_string(), format!("query={query}")]);
        self.exec(action, args)
    }

    /// The first merge method the repository allows, preferring squash,
    /// then rebase, then a merge commit.
    pub fn allowed_merge_method(&self) -> Result<MergeMethod, GhError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Repo {
            squash_merge_allowed: bool,
            rebase_merge_allowed: bool,
            merge_commit_allowed: bool,
        }
        #[derive(Deserialize)]
        struct Data {
            repository: Option<Repo>,
        }
        #[derive(Deserialize)]
        struct Resp {
            data: Option<Data>,
        }
        let vars = self.repo_vars();
        let out = self
            .graphql("reading merge settings", MERGE_METHODS_QUERY, &vars)
            .map_err(|_| GhError::MergeMethodUnknown)?;
        let resp: Resp = serde_json::from_str(&out).map_err(|_| GhError::MergeMethodUnknown)?;
        let repo = resp
            .data
            .and_then(|d| d.repository)
            .ok_or(GhError::MergeMethodUnknown)?;
        [
            (repo.squash_merge_allowed, MergeMethod::Squash),
            (repo.rebase_merge_allowed, MergeMethod::Rebase),
            (repo.merge_commit_allowed, MergeMethod::Merge),
        ]
        .into_iter()
        .find_map(|(allowed, m)| allowed.then_some(m))
        .ok_or(GhError::MergeMethodUnknown)
    }
}

/// PR actions. Each maps to one `gh` call; failures carry `gh`'s stderr.
impl<R: Runner> Gh<R> {
    /// `gh pr <sub> <number> ...`, adding `--repo` for explicit addressing.
    fn pr(
        &self,
        action: &'static str,
        sub: &str,
        number: u64,
        rest: &[&str],
    ) -> Result<(), GhError> {
        let mut args = vec!["pr".to_string(), sub.to_string(), number.to_string()];
        args.extend(rest.iter().map(|s| s.to_string()));
        if let Addressing::Repo { owner, name } = &self.addressing {
            args.extend(["--repo".to_string(), format!("{owner}/{name}")]);
        }
        self.exec(action, args).map(drop)
    }

    pub fn merge(&self, number: u64, method: MergeMethod) -> Result<(), GhError> {
        self.pr("Merging the PR", "merge", number, &[method.flag()])
    }

    pub fn enable_auto_merge(&self, number: u64, method: MergeMethod) -> Result<(), GhError> {
        self.pr(
            "Turning on auto-merge",
            "merge",
            number,
            &[method.flag(), "--auto"],
        )
    }

    pub fn disable_auto_merge(&self, number: u64) -> Result<(), GhError> {
        self.pr(
            "Turning off auto-merge",
            "merge",
            number,
            &["--disable-auto"],
        )
    }

    pub fn mark_ready(&self, number: u64) -> Result<(), GhError> {
        self.pr("Marking the PR ready for review", "ready", number, &[])
    }

    /// Change the title and/or body; `None` leaves a field as is.
    pub fn edit(
        &self,
        number: u64,
        title: Option<&str>,
        body: Option<&str>,
    ) -> Result<(), GhError> {
        let mut rest = Vec::new();
        if let Some(t) = title {
            rest.extend(["--title", t]);
        }
        if let Some(b) = body {
            rest.extend(["--body", b]);
        }
        self.pr("Updating the PR", "edit", number, &rest)
    }

    pub fn retarget(&self, number: u64, base: &str) -> Result<(), GhError> {
        self.pr(
            "Changing the PR's base branch",
            "edit",
            number,
            &["--base", base],
        )
    }

    /// Approve the PR at a specific head commit (REST reviews API), so an
    /// approval never lands on commits the viewer has not seen.
    pub fn approve(&self, number: u64, head_oid: &str) -> Result<(), GhError> {
        let repo = match &self.addressing {
            Addressing::Cwd(_) => "{owner}/{repo}".to_string(),
            Addressing::Repo { owner, name } => format!("{owner}/{name}"),
        };
        let args = vec![
            "api".to_string(),
            format!("repos/{repo}/pulls/{number}/reviews"),
            "-f".to_string(),
            "event=APPROVE".to_string(),
            "-f".to_string(),
            format!("commit_id={head_oid}"),
        ];
        self.exec("Approving the PR", args).map(drop)
    }
}

/// Per-repository cache of the allowed merge method. Failures are not
/// cached, so the next attempt asks GitHub again.
#[derive(Default)]
pub struct MergeMethodCache {
    by_repo: Mutex<HashMap<String, MergeMethod>>,
}

impl MergeMethodCache {
    pub fn get_or_fetch(
        &self,
        repo_id: &str,
        fetch: impl FnOnce() -> Result<MergeMethod, GhError>,
    ) -> Result<MergeMethod, GhError> {
        if let Some(m) = self
            .by_repo
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(repo_id)
        {
            return Ok(*m);
        }
        let m = fetch()?;
        self.by_repo
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(repo_id.to_string(), m);
        Ok(m)
    }

    pub fn forget(&self, repo_id: &str) {
        self.by_repo
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(repo_id);
    }
}
