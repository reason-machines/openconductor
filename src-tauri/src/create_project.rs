//! Home "Create project" (Quick start): make the project folder from a
//! template and publish it as a private GitHub repo. Registering the project and creating its first
//! workspace stay in the frontend, as in the reference app
//! (evidence/screens/create-project.md).

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;

use oc_scripts::config::shell_quote;
use serde::{Deserialize, Serialize};

use crate::github_repo::{CreateRequest, GitHub};

/// Prepended to `PATH` for create-next-app, as the reference app does.
pub const EXTRA_PATH: [&str; 6] = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    "$HOME/.local/bin",
    "/opt/local/bin",
    "/usr/local/git/bin",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Template {
    Empty,
    Nextjs,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub parent_dir: String,
    /// Folder and GitHub repo name, already slugged by the dialog.
    pub slug: String,
    pub template: Template,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    pub path: String,
    pub github_url: String,
    pub origin_remote_url: String,
    /// `git rev-parse --abbrev-ref HEAD`, else `main`.
    pub default_branch: String,
}

/// What the dialog shows while creating: a new step text, or an output line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "text", rename_all = "lowercase")]
pub enum Progress {
    Step(String),
    Line(String),
}

/// Programs, injectable for tests.
pub struct Creator {
    pub github: GitHub,
    pub npx: String,
}

impl Default for Creator {
    fn default() -> Self {
        Creator {
            github: GitHub::default(),
            npx: "npx".into(),
        }
    }
}

impl Creator {
    /// Validate, scaffold, then create the private repo. A folder this call
    /// created is deleted again if anything fails before the repo exists.
    pub fn create(&self, req: &Request, emit: &mut dyn FnMut(Progress)) -> Result<Created, String> {
        let slug = req.slug.trim();
        let parent_text = req.parent_dir.trim();
        if slug.is_empty() {
            return Err("Enter a project name".into());
        }
        if parent_text.is_empty() {
            return Err("Select a directory".into());
        }
        let parent = Path::new(parent_text);
        if !parent.exists() && fs::create_dir_all(parent).is_err() {
            return Err("Couldn't create selected directory".into());
        }
        let target = parent.join(slug);
        if target.exists() {
            return Err(format!(
                "Directory \"{slug}\" already exists in {parent_text}"
            ));
        }
        let mut created_dir = false;
        let published = self
            .scaffold(req.template, parent, slug, &mut created_dir, emit)
            .and_then(|()| {
                emit(Progress::Step("Creating GitHub repo...".into()));
                self.github.create(&CreateRequest {
                    owner: String::new(),
                    repo_path: target.display().to_string(),
                    repository_name: slug.to_string(),
                    existing_origin_url: None,
                })
            });
        let published = published.inspect_err(|_| {
            if created_dir {
                let _ = fs::remove_dir_all(&target);
            }
        })?;
        let branch = sh("git rev-parse --abbrev-ref HEAD", &target)
            .ok()
            .filter(|o| o.ok && !o.stdout.is_empty())
            .map(|o| o.stdout)
            .unwrap_or_else(|| "main".into());
        Ok(Created {
            path: target.display().to_string(),
            github_url: published.github_url,
            origin_remote_url: published.origin_remote_url,
            default_branch: branch,
        })
    }

    fn scaffold(
        &self,
        template: Template,
        parent: &Path,
        slug: &str,
        created_dir: &mut bool,
        emit: &mut dyn FnMut(Progress),
    ) -> Result<(), String> {
        let target = parent.join(slug);
        match template {
            Template::Empty => {
                emit(Progress::Step("Creating project directory...".into()));
                fs::create_dir_all(&target).map_err(|e| e.to_string())?;
                *created_dir = true;
                emit(Progress::Step("Initializing Git repository...".into()));
                let init = sh("git init", &target)?;
                if !init.ok {
                    return Err(format!("Failed to initialize Git: {}", init.detail()));
                }
                let commit = sh(
                    "touch .gitkeep && git add . && git commit -m 'Initial commit'",
                    &target,
                )?;
                if !commit.ok {
                    return Err(format!(
                        "Failed to create initial commit: {}",
                        commit.detail()
                    ));
                }
            }
            Template::Nextjs => {
                emit(Progress::Step("Creating Next.js project...".into()));
                let command = format!(
                    "export PATH=\"{}:$PATH\" && {} --yes create-next-app@latest {} --yes --typescript --tailwind --eslint --app --src-dir --import-alias \"@/*\" --use-pnpm",
                    EXTRA_PATH.join(":"),
                    shell_quote(&self.npx),
                    shell_quote(slug),
                );
                let (ok, last) = stream(&command, parent, emit)?;
                let exists = target.exists();
                *created_dir = exists;
                if !ok {
                    return Err(last.unwrap_or_else(|| "Failed to create Next.js project".into()));
                }
                if !exists {
                    return Err("create-next-app completed but directory was not created".into());
                }
                emit(Progress::Step("Setting up environment...".into()));
                fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(target.join(".env.local"))
                    .map_err(|e| format!("Failed to set up environment: {e}"))?;
            }
        }
        Ok(())
    }
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

fn shell() -> &'static str {
    if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "bash"
    }
}

fn shell_command(script: &str, cwd: &Path) -> Command {
    let mut cmd = Command::new(shell());
    cmd.arg("-c")
        .arg(script)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .env("GIT_TERMINAL_PROMPT", "0");
    cmd
}

fn sh(script: &str, cwd: &Path) -> Result<Out, String> {
    let out = shell_command(script, cwd)
        .output()
        .map_err(|e| format!("{}: {e}", shell()))?;
    Ok(Out {
        ok: out.status.success(),
        stdout: String::from_utf8_lossy(&out.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
    })
}

/// Run `script`, sending each stdout and stderr line as it arrives. Returns
/// whether it exited 0 and its last non-empty line.
fn stream(
    script: &str,
    cwd: &Path,
    emit: &mut dyn FnMut(Progress),
) -> Result<(bool, Option<String>), String> {
    let mut child = shell_command(script, cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{}: {e}", shell()))?;
    let (tx, rx) = mpsc::channel::<String>();
    let readers: Vec<_> = [
        child
            .stdout
            .take()
            .map(|r| Box::new(r) as Box<dyn std::io::Read + Send>),
        child
            .stderr
            .take()
            .map(|r| Box::new(r) as Box<dyn std::io::Read + Send>),
    ]
    .into_iter()
    .flatten()
    .map(|pipe| {
        let tx = tx.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                let _ = tx.send(line);
            }
        })
    })
    .collect();
    drop(tx);
    let mut last = None;
    for line in rx {
        if !line.trim().is_empty() {
            last = Some(line.trim().to_string());
        }
        emit(Progress::Line(line));
    }
    for reader in readers {
        let _ = reader.join();
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    Ok((status.success(), last))
}

#[cfg(all(test, unix))]
#[path = "create_project_tests.rs"]
mod tests;
