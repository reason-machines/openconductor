//! GitHub repo setup behind Home "Open project" (the "Create a private GitHub
//! repo?" dialog): list owners, check a repo name is free, and publish a local
//! folder as a new private repo. Uses `git` and the `gh` CLI, as the reference
//! app does (evidence/screens/github-repo-dialog.md).

use serde::{Deserialize, Serialize};
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRequest {
    pub owner: String,
    pub repo_path: String,
    pub repository_name: String,
    /// Set when the folder has a non-GitHub `origin`, which is renamed to `upstream`.
    pub existing_origin_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    pub github_url: String,
    pub origin_remote_url: String,
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

/// Replace git's SSH host-key failures with what to run to fix them.
pub fn ssh_hint(detail: &str) -> String {
    if detail.contains("REMOTE HOST IDENTIFICATION HAS CHANGED") {
        "SSH host key verification failed. Run 'ssh-keygen -R github.com' in your terminal, then try again.".into()
    } else if detail.contains("Host key verification failed") {
        "SSH host key verification failed. Try running 'ssh -T git@github.com' to add GitHub to your known hosts.".into()
    } else {
        detail.to_string()
    }
}

/// One "Recent repos" row of the clone dialog: the fields of GitHub's
/// `GET /user/repos` entry the dialog uses, in the API's own shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecentRepo {
    pub id: u64,
    pub full_name: String,
    pub description: Option<String>,
    pub clone_url: String,
    pub ssh_url: String,
    pub owner: RepoOwner,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepoOwner {
    pub avatar_url: String,
}

/// The 8 most recently pushed repos the user owns, collaborates on or can
/// reach through an org, as the reference app requests them.
pub const RECENT_REPOS_PATH: &str =
    "user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc&per_page=8";

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

    /// See [`RECENT_REPOS_PATH`]. A failed request is "GitHub API error: <gh's message>".
    pub fn recent_repos(&self) -> Result<Vec<RecentRepo>, String> {
        let out = self.gh(&["api", RECENT_REPOS_PATH], &std::env::temp_dir())?;
        if !out.ok {
            return Err(format!(
                "GitHub API error: {}",
                or_default(out.detail(), "request failed")
            ));
        }
        serde_json::from_str(&out.stdout).map_err(|e| format!("GitHub API error: {e}"))
    }

    /// `gh config get git_protocol`: `ssh` only when gh says so, else `https`
    /// (gh's own default), including when gh is missing or fails.
    pub fn git_protocol(&self) -> &'static str {
        match self.gh(&["config", "get", "git_protocol"], &std::env::temp_dir()) {
            Ok(out) if out.ok && out.stdout == "ssh" => "ssh",
            _ => "https",
        }
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

    /// `git init` if needed, move a non-GitHub origin to `upstream`, make an
    /// initial commit if there is none, then create the private repo as
    /// `origin` and push. A moved origin is restored if publishing fails.
    pub fn create(&self, req: &CreateRequest) -> Result<Created, String> {
        let dir = Path::new(&req.repo_path);
        if !dir.join(".git").exists() {
            let init = run("git", &["init"], dir)?;
            if !init.ok {
                return Err(format!(
                    "Failed to initialize git repository: {}",
                    init.detail()
                ));
            }
        }
        let moved = req.existing_origin_url.is_some();
        if moved {
            if run("git", &["remote", "get-url", "upstream"], dir)?.ok {
                return Err("Can't move the existing 'origin' remote aside because an 'upstream' remote already exists. Rename or remove the existing 'upstream' remote and try again.".into());
            }
            let rename = run("git", &["remote", "rename", "origin", "upstream"], dir)?;
            if !rename.ok {
                return Err(format!(
                    "Failed to move the existing origin remote aside: {}",
                    rename.detail()
                ));
            }
        }
        let result = self.publish(dir, req);
        if result.is_err() && moved {
            let _ = run("git", &["remote", "rename", "upstream", "origin"], dir);
        }
        result
    }

    fn publish(&self, dir: &Path, req: &CreateRequest) -> Result<Created, String> {
        ensure_initial_commit(dir)?;
        let full = if req.owner.is_empty() {
            req.repository_name.clone()
        } else {
            format!("{}/{}", req.owner, req.repository_name)
        };
        let description = format!("A repository for {}", req.repository_name);
        let args = [
            "repo",
            "create",
            &full,
            "--description",
            &description,
            "--private",
            "--source=.",
            "--remote=origin",
        ];
        let created = self.gh(&args, dir)?;
        if !created.ok {
            return Err(format!(
                "Failed to create GitHub repository: {}",
                ssh_hint(created.detail())
            ));
        }
        let helper = format!(
            "credential.https://github.com.helper=!\"{}\" auth git-credential",
            self.gh
        );
        let push = run("git", &["-c", &helper, "push", "-u", "origin", "HEAD"], dir)?;
        if !push.ok {
            return Err(format!(
                "Failed to push the new repository to GitHub: {}",
                ssh_hint(push.detail())
            ));
        }
        let origin = run("git", &["remote", "get-url", "origin"], dir)?;
        if !origin.ok || origin.stdout.is_empty() {
            return Err(format!("Failed to read origin URL: {}", origin.detail()));
        }
        let url = self.gh(&["repo", "view", &full, "--json", "url", "-q", ".url"], dir)?;
        if !url.ok || url.stdout.is_empty() {
            return Err(format!(
                "Failed to read GitHub repository URL: {}",
                url.detail()
            ));
        }
        Ok(Created {
            github_url: url.stdout,
            origin_remote_url: origin.stdout,
        })
    }
}

/// A repo with no commits gets one ("Initial commit"); an empty folder gets a
/// `.gitkeep` first so there is something to commit and push.
fn ensure_initial_commit(dir: &Path) -> Result<(), String> {
    if run("git", &["rev-parse", "--verify", "HEAD"], dir)?.ok {
        return Ok(());
    }
    let status = run("git", &["status", "--porcelain"], dir)?;
    if !status.ok {
        return Err(format!(
            "Failed to inspect repository status: {}",
            status.detail()
        ));
    }
    if status.stdout.is_empty() {
        std::fs::write(dir.join(".gitkeep"), b"")
            .map_err(|e| format!("Failed to prepare initial commit: {e}"))?;
    }
    let add = run("git", &["add", "."], dir)?;
    let commit = if add.ok {
        run("git", &["commit", "-m", "Initial commit"], dir)?
    } else {
        add
    };
    if !commit.ok {
        return Err(format!(
            "Failed to create initial commit: {}",
            commit.detail()
        ));
    }
    Ok(())
}

#[cfg(all(test, unix))]
#[path = "github_repo_tests.rs"]
mod tests;
