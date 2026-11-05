//! Throwaway git repositories for workspace tests.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) struct TempDir(PathBuf);

impl TempDir {
    pub(crate) fn new(tag: &str) -> Self {
        static N: AtomicU64 = AtomicU64::new(0);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let p = std::env::temp_dir().join(format!(
            "ws-test-{tag}-{}-{nanos}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&p).unwrap();
        TempDir(fs::canonicalize(&p).unwrap())
    }
    pub(crate) fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Run git in `dir` with a fixed identity, asserting success; trimmed stdout.
pub(crate) fn g(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

pub(crate) fn write(dir: &Path, rel: &str, contents: &str) {
    let p = dir.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, contents).unwrap();
}

/// A repo with one commit on `main`.
pub(crate) fn init_repo(dir: &Path) {
    g(dir, &["init", "-q", "-b", "main"]);
    write(dir, "README.md", "hello\n");
    g(dir, &["add", "."]);
    g(dir, &["commit", "-q", "-m", "init"]);
}

/// A bare "origin" with `main` and `feature`, and a clone of it in `clone/`
/// (which records `refs/remotes/origin/HEAD`). Returns (origin, clone).
pub(crate) fn origin_and_clone(tmp: &TempDir) -> (PathBuf, PathBuf) {
    let seed = tmp.path().join("seed");
    fs::create_dir_all(&seed).unwrap();
    init_repo(&seed);
    g(&seed, &["checkout", "-q", "-b", "feature"]);
    write(&seed, "feature.txt", "f\n");
    g(&seed, &["add", "."]);
    g(&seed, &["commit", "-q", "-m", "feature"]);
    g(&seed, &["checkout", "-q", "main"]);
    let origin = tmp.path().join("origin.git");
    g(
        tmp.path(),
        &[
            "clone",
            "-q",
            "--bare",
            seed.to_str().unwrap(),
            origin.to_str().unwrap(),
        ],
    );
    let clone = tmp.path().join("clone");
    g(
        tmp.path(),
        &[
            "clone",
            "-q",
            origin.to_str().unwrap(),
            clone.to_str().unwrap(),
        ],
    );
    (origin, clone)
}
