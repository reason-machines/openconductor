use std::path::{Path, PathBuf};
use std::process::Command;

use super::git_state::{
    is_github_url, parse_status_v2, pick_remote, read_git_state, upstream_sync, StatusV2,
};
use super::header::UpstreamSync;

#[test]
fn status_v2_reads_upstream_ahead_behind_and_dirt() {
    let s = parse_status_v2(
        "# branch.oid abc\n# branch.head feat\n# branch.upstream origin/feat\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 a b src/x.rs\n",
    );
    assert_eq!(
        s,
        StatusV2 {
            upstream: Some("origin/feat".into()),
            ahead_behind: Some((2, 1)),
            dirty: true
        }
    );
    let clean = parse_status_v2("# branch.oid abc\n# branch.head feat\n");
    assert_eq!(clean, StatusV2::default());
    assert!(parse_status_v2("? new.txt\n").dirty);
}

#[test]
fn upstream_sync_marks_gone_branches_and_divergence() {
    assert_eq!(upstream_sync(&StatusV2::default()), None);
    let gone = StatusV2 {
        upstream: Some("origin/feat".into()),
        ..Default::default()
    };
    assert_eq!(upstream_sync(&gone), Some(UpstreamSync::default()));
    let both = StatusV2 {
        upstream: Some("origin/feat".into()),
        ahead_behind: Some((1, 3)),
        dirty: false,
    };
    assert_eq!(
        upstream_sync(&both),
        Some(UpstreamSync {
            branch_exists: true,
            diverged: true,
            ahead: 1,
            behind: 3
        })
    );
}

#[test]
fn remote_follows_upstream_then_origin_then_first() {
    let remotes = vec!["fork".to_string(), "origin".into(), "team/x".into()];
    assert_eq!(
        pick_remote(&remotes, Some("team/x/feat")).as_deref(),
        Some("team/x")
    );
    assert_eq!(
        pick_remote(&remotes, Some("fork/feat")).as_deref(),
        Some("fork")
    );
    assert_eq!(pick_remote(&remotes, None).as_deref(), Some("origin"));
    assert_eq!(
        pick_remote(&["up".to_string()], None).as_deref(),
        Some("up")
    );
    assert_eq!(pick_remote(&[], Some("origin/feat")), None);
}

#[test]
fn github_urls_are_recognised() {
    for url in [
        "https://github.com/o/r.git",
        "git@github.com:o/r.git",
        "ssh://git@github.com/o/r",
        "HTTPS://GitHub.com/o/r\n",
    ] {
        assert!(is_github_url(url), "{url}");
    }
    for url in [
        "https://gitlab.com/o/r",
        "git@github.company.com:o/r",
        "/tmp/bare.git",
    ] {
        assert!(!is_github_url(url), "{url}");
    }
}

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}: {out:?}");
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("oc-pr-git-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn commit(dir: &Path, file: &str) {
    std::fs::write(dir.join(file), file).unwrap();
    git(dir, &["add", file]);
    git(
        dir,
        &[
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            file,
        ],
    );
}

#[test]
fn reads_a_real_checkout_against_its_remote() {
    let root = scratch("real");
    let bare = root.join("remote.git");
    let ws = root.join("ws");
    git(&root, &["init", "-q", "--bare", "-b", "main", "remote.git"]);
    git(&root, &["clone", "-q", bare.to_str().unwrap(), "ws"]);
    git(&ws, &["checkout", "-q", "-b", "main"]);
    commit(&ws, "a");
    git(&ws, &["push", "-q", "-u", "origin", "main"]);

    // On the target branch with nothing new: no changes, in sync.
    let s = read_git_state(&ws, "main").unwrap();
    assert!(!s.has_changes && !s.has_uncommitted && s.has_remote);
    assert!(!s.can_create_pr, "a local bare remote is not GitHub");
    assert_eq!(s.remote.as_deref(), Some("origin"));
    assert_eq!(
        s.upstream,
        Some(UpstreamSync {
            branch_exists: true,
            ..Default::default()
        })
    );

    // A feature branch with one commit, not pushed: changes, no upstream.
    git(&ws, &["checkout", "-q", "-b", "feat"]);
    commit(&ws, "b");
    let s = read_git_state(&ws, "main").unwrap();
    assert!(s.has_changes && !s.has_uncommitted);
    assert_eq!(s.upstream, None);

    // Pushed with upstream, then one more local commit and a dirty file.
    git(&ws, &["push", "-q", "-u", "origin", "feat"]);
    commit(&ws, "c");
    std::fs::write(ws.join("a"), "edited").unwrap();
    let s = read_git_state(&ws, "main").unwrap();
    assert!(s.has_uncommitted && s.has_changes);
    assert_eq!(
        s.upstream,
        Some(UpstreamSync {
            branch_exists: true,
            diverged: false,
            ahead: 1,
            behind: 0
        })
    );

    git(
        &ws,
        &[
            "remote",
            "set-url",
            "origin",
            "https://github.com/acme/web.git",
        ],
    );
    assert!(read_git_state(&ws, "main").unwrap().can_create_pr);
    assert!(read_git_state(&root.join("nope"), "main").is_err());
    let _ = std::fs::remove_dir_all(&root);
}
