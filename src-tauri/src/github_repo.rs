//! GitHub repo setup behind Home "Open project" (the "Create a private GitHub
//! repo?" dialog): list the owners a repo can be created under and check that a
//! repo name is free. Shells out to the `gh` CLI, as the reference app does
//! (evidence/screens/github-repo-dialog.md).

use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OwnerKind {
    User,
    Org,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Owner {
    pub login: String,
    pub kind: OwnerKind,
}

/// The signed-in user first, then their organizations. Failing to list orgs
/// is not fatal: the user can still pick their personal account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Owners {
    pub owners: Vec<Owner>,
    pub orgs_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Availability {
    Available,
    Taken,
}

struct Out {
    ok: bool,
    stdout: String,
    stderr: String,
}

impl Out {
    fn detail(&self) -> &str {
        if self.stderr.is_empty() {
            &self.stdout
        } else {
            &self.stderr
        }
    }
}

fn run(program: &str, args: &[&str], cwd: &Path) -> Result<Out, String> {
    let out = Command::new(program)
        .args(args)
        .current_dir(cwd)
        // A background app must never wait on a credential or confirmation prompt.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GH_PROMPT_DISABLED", "1")
        .output()
        .map_err(|e| format!("{program}: {e}"))?;
    Ok(Out {
        ok: out.status.success(),
        stdout: String::from_utf8_lossy(&out.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
    })
}

fn or_default(detail: &str, fallback: &str) -> String {
    if detail.is_empty() {
        fallback.to_string()
    } else {
        detail.to_string()
    }
}

/// `gh repo view` succeeding means the name is taken; a not-found error means
/// it is free; anything else (auth, network) is an error.
pub fn classify_view(ok: bool, stdout: &str, stderr: &str) -> Result<Availability, String> {
    if ok {
        return Ok(Availability::Taken);
    }
    let text = format!("{stdout}\n{stderr}").to_lowercase();
    let not_found = ["not found", "http 404", "could not resolve to a repository"];
    if not_found.iter().any(|p| text.contains(p)) {
        return Ok(Availability::Available);
    }
    let detail = if stderr.is_empty() { stdout } else { stderr };
    Err(or_default(
        detail,
        "Failed to check GitHub repository availability",
    ))
}

/// `gh` operations, with the program path injectable for tests.
pub struct GitHub {
    pub gh: String,
}

impl Default for GitHub {
    fn default() -> Self {
        GitHub { gh: "gh".into() }
    }
}

impl GitHub {
    fn gh(&self, args: &[&str], cwd: &Path) -> Result<Out, String> {
        run(&self.gh, args, cwd)
    }

    pub fn owners(&self) -> Result<Owners, String> {
        let home = std::env::temp_dir();
        let user = self.gh(&["api", "user", "--jq", ".login"], &home)?;
        if !user.ok || user.stdout.is_empty() {
            return Err(or_default(user.detail(), "Failed to load GitHub user"));
        }
        let mut owners = vec![Owner {
            login: user.stdout,
            kind: OwnerKind::User,
        }];
        let orgs = self.gh(
            &["api", "user/orgs", "--paginate", "--jq", ".[].login"],
            &home,
        )?;
        if !orgs.ok {
            let err = or_default(orgs.detail(), "Failed to load GitHub organizations");
            return Ok(Owners {
                owners,
                orgs_error: Some(err),
            });
        }
        owners.extend(
            orgs.stdout
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .map(|l| Owner {
                    login: l.to_string(),
                    kind: OwnerKind::Org,
                }),
        );
        Ok(Owners {
            owners,
            orgs_error: None,
        })
    }

    /// Run outside any checkout so `gh` never resolves the name against the cwd's repo.
    pub fn availability(&self, owner: &str, name: &str) -> Result<Availability, String> {
        let full = format!("{owner}/{name}");
        let out = self.gh(
            &["repo", "view", &full, "--json", "name", "-q", ".name"],
            &std::env::temp_dir(),
        )?;
        classify_view(out.ok, &out.stdout, &out.stderr)
    }
}

#[cfg(all(test, unix))]
#[path = "github_repo_tests.rs"]
mod tests;
