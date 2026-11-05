//! Checks run on a folder before it is added as a project (Home "Open project").
//!
//! Mirrors the reference app's open-project checks (evidence/screens/home.md):
//! the folder must exist, then `.git` and `origin` decide whether the project is
//! added directly or the user is asked to set up git or a GitHub repo first.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

/// What the frontend needs to decide how to add a picked folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInspection {
    /// The path exists and is a directory.
    pub is_dir: bool,
    /// `<path>/.git` exists (a directory, or a file for worktrees and submodules).
    pub has_git: bool,
    /// `git remote get-url origin`, when the folder has an origin remote.
    pub origin: Option<String>,
}

pub fn inspect_folder(path: &Path) -> FolderInspection {
    let is_dir = path.is_dir();
    let has_git = is_dir && path.join(".git").exists();
    let origin = if has_git { origin_url(path) } else { None };
    FolderInspection {
        is_dir,
        has_git,
        origin,
    }
}

fn origin_url(repo: &Path) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["remote", "get-url", "origin"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!url.is_empty()).then_some(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oc-project-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn git(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .status()
            .unwrap()
            .success();
        assert!(ok, "git {args:?} failed");
    }

    #[test]
    fn missing_path_is_not_a_dir() {
        let r = inspect_folder(Path::new("/definitely/not/here/oc"));
        assert_eq!(
            r,
            FolderInspection {
                is_dir: false,
                has_git: false,
                origin: None
            }
        );
    }

    #[test]
    fn plain_folder_has_no_git() {
        let dir = scratch("plain");
        let r = inspect_folder(&dir);
        assert!(r.is_dir && !r.has_git && r.origin.is_none());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn git_repo_without_and_with_origin() {
        let dir = scratch("repo");
        git(&dir, &["init", "-q"]);
        assert_eq!(inspect_folder(&dir).origin, None);
        assert!(inspect_folder(&dir).has_git);
        git(
            &dir,
            &["remote", "add", "origin", "git@github.com:acme/widgets.git"],
        );
        assert_eq!(
            inspect_folder(&dir).origin.as_deref(),
            Some("git@github.com:acme/widgets.git")
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
