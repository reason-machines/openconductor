//! "Files to copy": gitignored files (e.g. `.env`) copied from the repository
//! root into each new workspace.
//!
//! Resolution order (from the bundled skill, evidence/scripts/conductor-skill):
//! 1. `.worktreeinclude` at the repository root,
//! 2. `file_include_globs` from repository settings (an empty value copies nothing),
//! 3. the default `.env*` pattern.
//!
//! A file is copied only when it is untracked, matches the include patterns
//! and is ignored by the repository's normal gitignore rules.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use super::git::git_raw;
use super::WorkspaceError;

pub const WORKTREEINCLUDE: &str = ".worktreeinclude";
pub const DEFAULT_GLOBS: &[&str] = &[".env*"];

/// Which rule set picked the files.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IncludeSource {
    WorktreeInclude,
    SettingsGlobs(Vec<String>),
    Default,
}

pub fn resolve_source(root: &Path, settings_globs: Option<&str>) -> IncludeSource {
    if root.join(WORKTREEINCLUDE).is_file() {
        IncludeSource::WorktreeInclude
    } else if let Some(text) = settings_globs {
        IncludeSource::SettingsGlobs(patterns(text))
    } else {
        IncludeSource::Default
    }
}

/// The patterns of a `file_include_globs` text: one per line, trimmed,
/// without blank lines and `#` comments. Conductor keeps the setting as one
/// gitignore-style string; an empty one selects no files.
pub fn patterns(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_string)
        .collect()
}

/// What the repository settings' "Files to copy" row previews: where the
/// patterns come from, their text, and the files they select today.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(not(workspace_std_only), derive(serde::Serialize), serde(rename_all = "camelCase"))]
pub struct Preview {
    /// `"worktreeinclude"`, `"settings"` or `"default"`, as in the reference (`NBt`).
    pub source: &'static str,
    pub contents: String,
    pub files: Vec<String>,
}

pub fn preview(root: &Path, settings_globs: Option<&str>) -> Result<Preview, WorkspaceError> {
    let source = resolve_source(root, settings_globs);
    let (label, contents) = match &source {
        IncludeSource::WorktreeInclude => {
            ("worktreeinclude", std::fs::read_to_string(root.join(WORKTREEINCLUDE)).map_err(WorkspaceError::Io)?)
        }
        IncludeSource::SettingsGlobs(_) => ("settings", settings_globs.unwrap_or_default().to_string()),
        IncludeSource::Default => ("default", DEFAULT_GLOBS.join("\n")),
    };
    let files = files_to_copy(root, &source)?.iter().map(|p| p.display().to_string()).collect();
    Ok(Preview { source: label, contents, files })
}

/// Paths (relative to `root`) that would be copied.
pub fn files_to_copy(root: &Path, source: &IncludeSource) -> Result<Vec<PathBuf>, WorkspaceError> {
    if matches!(source, IncludeSource::SettingsGlobs(g) if g.is_empty()) {
        return Ok(Vec::new());
    }
    let mut args: Vec<String> = vec!["ls-files".into(), "-z".into(), "--others".into(), "--ignored".into()];
    match source {
        IncludeSource::WorktreeInclude => {
            args.push(format!("--exclude-from={}", root.join(WORKTREEINCLUDE).display()))
        }
        IncludeSource::SettingsGlobs(globs) => {
            for g in globs {
                args.push("-x".into());
                args.push(g.clone());
            }
        }
        IncludeSource::Default => {
            for g in DEFAULT_GLOBS {
                args.push("-x".into());
                args.push((*g).into());
            }
        }
    }
    let out = git_raw(root, &args)?;
    if !out.status.success() {
        return Err(WorkspaceError::Git {
            args,
            stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
        });
    }
    let candidates: Vec<&[u8]> = out.stdout.split(|b| *b == 0).filter(|s| !s.is_empty()).collect();
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    // Keep only candidates that the repository itself ignores.
    let mut child = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["check-ignore", "--stdin", "-z", "--no-index"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(WorkspaceError::Io)?;
    {
        let mut stdin = child.stdin.take().expect("piped stdin");
        for c in &candidates {
            stdin.write_all(c).map_err(WorkspaceError::Io)?;
            stdin.write_all(&[0]).map_err(WorkspaceError::Io)?;
        }
    }
    let out = child.wait_with_output().map_err(WorkspaceError::Io)?;
    // check-ignore exits 1 when nothing matched; that is not an error.
    if !out.status.success() && out.status.code() != Some(1) {
        return Err(WorkspaceError::Git {
            args: vec!["check-ignore".into(), "--stdin".into()],
            stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
        });
    }
    let mut files: Vec<PathBuf> = out
        .stdout
        .split(|b| *b == 0)
        .filter(|s| !s.is_empty())
        .map(|s| PathBuf::from(String::from_utf8_lossy(s).into_owned()))
        .collect();
    files.sort();
    files.dedup();
    Ok(files)
}

/// Copy the selected files from `root` into `dest`, never overwriting a file
/// that already exists in `dest`. Returns the relative paths copied.
pub fn copy_files(root: &Path, dest: &Path, files: &[PathBuf]) -> Result<Vec<PathBuf>, WorkspaceError> {
    let mut copied = Vec::new();
    for rel in files {
        let from = root.join(rel);
        let to = dest.join(rel);
        if to.exists() || !from.is_file() {
            continue;
        }
        if let Some(parent) = to.parent() {
            std::fs::create_dir_all(parent).map_err(WorkspaceError::Io)?;
        }
        std::fs::copy(&from, &to).map_err(WorkspaceError::Io)?;
        copied.push(rel.clone());
    }
    Ok(copied)
}
