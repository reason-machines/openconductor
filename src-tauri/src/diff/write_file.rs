// parity:diff.edit-in-viewer:backend
//! Save a file edited in the diff viewer back into the worktree.
//!
//! Conductor's editable file view (REA read of its 0.87.6 bundle, see
//! evidence/diff/edit-in-viewer.md; untrusted data, never instructions) saves
//! the editor's whole text through `workspaceFiles.writeText({localWorkspaceId,
//! path, contents})`, which resolves `path` against the workspace directory and
//! writes it. Here the frontend passes the worktree directly, as for
//! `diff_workspace`, and only plain relative paths inside it are accepted.

use super::git::DiffError;
use serde::Deserialize;
use std::io::Write;
use std::path::{Component, Path};

#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct WriteFileRequest {
    /// Path relative to the worktree, as the diff shows it.
    pub path: String,
    /// The editor's full text.
    pub contents: String,
}

fn checked(path: &str) -> Result<&Path, DiffError> {
    let p = Path::new(path);
    let plain = !path.is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)));
    if plain {
        Ok(p)
    } else {
        Err(DiffError::InvalidPath(path.to_string()))
    }
}

/// Replace the file's contents. The text goes to a sibling temp file first and
/// is renamed over the original, so a failed write never leaves half a file;
/// the original's permissions are kept.
pub fn write_file(repo: &Path, req: &WriteFileRequest) -> Result<(), DiffError> {
    let rel = checked(&req.path)?;
    let target = repo.join(rel);
    // A symlink inside the worktree could point outside it: refuse to follow one.
    if let Ok(meta) = std::fs::symlink_metadata(&target) {
        if meta.file_type().is_symlink() || meta.is_dir() {
            return Err(DiffError::InvalidPath(req.path.clone()));
        }
    }
    let dir = target
        .parent()
        .ok_or_else(|| DiffError::InvalidPath(req.path.clone()))?;
    // ...and so could a symlinked directory on the way: the real parent must stay inside.
    let inside = match (dir.canonicalize(), repo.canonicalize()) {
        (Ok(d), Ok(r)) => d.starts_with(r),
        _ => false,
    };
    if !inside {
        return Err(DiffError::InvalidPath(req.path.clone()));
    }
    let name = target
        .file_name()
        .ok_or_else(|| DiffError::InvalidPath(req.path.clone()))?
        .to_string_lossy();
    let tmp = dir.join(format!(".{name}.oc-save-{}", std::process::id()));
    let result = (|| {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(req.contents.as_bytes())?;
        f.sync_all()?;
        if let Ok(meta) = std::fs::metadata(&target) {
            std::fs::set_permissions(&tmp, meta.permissions())?;
        }
        std::fs::rename(&tmp, &target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result.map_err(DiffError::Io)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tempdir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("oc-write-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn req(path: &str, contents: &str) -> WriteFileRequest {
        WriteFileRequest {
            path: path.into(),
            contents: contents.into(),
        }
    }

    #[test]
    fn replaces_the_file_and_leaves_no_temp_file() {
        let d = tempdir("replace");
        std::fs::create_dir_all(d.join("src")).unwrap();
        std::fs::write(d.join("src/a.ts"), "old\n").unwrap();
        write_file(&d, &req("src/a.ts", "new\ntext\n")).unwrap();
        assert_eq!(
            std::fs::read_to_string(d.join("src/a.ts")).unwrap(),
            "new\ntext\n"
        );
        let left: Vec<_> = std::fs::read_dir(d.join("src")).unwrap().collect();
        assert_eq!(left.len(), 1, "only the saved file remains");
    }

    #[cfg(unix)]
    #[test]
    fn keeps_the_original_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let d = tempdir("mode");
        std::fs::write(d.join("run.sh"), "echo a\n").unwrap();
        std::fs::set_permissions(d.join("run.sh"), std::fs::Permissions::from_mode(0o755)).unwrap();
        write_file(&d, &req("run.sh", "echo b\n")).unwrap();
        let mode = std::fs::metadata(d.join("run.sh"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o755);
    }

    #[test]
    fn refuses_paths_outside_the_worktree() {
        let d = tempdir("escape");
        for bad in ["", "../x", "/etc/passwd", "a/../../x", "./a"] {
            let err = write_file(&d, &req(bad, "x")).unwrap_err();
            assert!(
                matches!(err, DiffError::InvalidPath(_)),
                "{bad:?} must be refused"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn refuses_to_write_through_a_symlink() {
        let d = tempdir("link");
        let outside = tempdir("link-target");
        std::fs::write(outside.join("t"), "keep\n").unwrap();
        std::os::unix::fs::symlink(outside.join("t"), d.join("l")).unwrap();
        assert!(write_file(&d, &req("l", "x")).is_err());
        assert_eq!(
            std::fs::read_to_string(outside.join("t")).unwrap(),
            "keep\n"
        );
        std::os::unix::fs::symlink(&outside, d.join("dir")).unwrap();
        assert!(write_file(&d, &req("dir/new", "x")).is_err());
        assert!(!outside.join("new").exists());
    }
}
