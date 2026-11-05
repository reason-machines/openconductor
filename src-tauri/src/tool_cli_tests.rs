use super::*;
use std::fs;
use std::path::PathBuf;

struct Repo(PathBuf);

impl Repo {
    fn new(tag: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("oc-tool-cli-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let dir = fs::canonicalize(dir).unwrap();
        let repo = Repo(dir);
        repo.git(&["init", "-q"]);
        repo.git(&["config", "user.name", "T"]);
        repo.git(&["config", "user.email", "t@example.invalid"]);
        fs::write(repo.0.join("a.txt"), "one\n").unwrap();
        repo.git(&["add", "."]);
        repo.git(&["commit", "-qm", "init"]);
        repo
    }
    fn git(&self, args: &[&str]) {
        let ok = Command::new("git")
            .arg("-C")
            .arg(&self.0)
            .args(args)
            .status()
            .unwrap();
        assert!(ok.success(), "git {args:?}");
    }
}

impl Drop for Repo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Run a tool and return (exit code, stdout, stderr).
fn tool(cwd: &Path, args: &[&str]) -> (i32, String, String) {
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let (mut out, mut err) = (Vec::new(), Vec::new());
    let code = run(&args, cwd, &mut out, &mut err);
    (
        code,
        String::from_utf8(out).unwrap(),
        String::from_utf8(err).unwrap(),
    )
}

#[test]
fn dispatch_only_takes_the_tool_flag() {
    let argv = |a: &[&str]| a.iter().map(OsString::from).collect::<Vec<_>>();
    assert_eq!(dispatch(argv(&["openconductor"])), None);
    assert_eq!(
        dispatch(argv(&["openconductor", "openconductor://x"])),
        None
    );
}

#[test]
fn save_diff_restore_round_trip() {
    let repo = Repo::new("round-trip");
    assert_eq!(
        tool(&repo.0, &["checkpointer", "save", "--id", "one"]),
        (0, "one\n".into(), "".into())
    );

    fs::write(repo.0.join("a.txt"), "two\n").unwrap();
    fs::write(repo.0.join("new.txt"), "untracked\n").unwrap();
    let (code, out, _) = tool(
        &repo.0,
        &[
            "checkpointer",
            "diff",
            "one",
            "current",
            "--",
            "--name-status",
        ],
    );
    assert_eq!(code, 0);
    assert_eq!(out, "M\ta.txt\nA\tnew.txt\n");

    let (code, out, _) = tool(&repo.0, &["checkpointer", "restore", "one"]);
    assert_eq!((code, out.as_str()), (0, "restored checkpoint: one\n"));
    assert_eq!(fs::read_to_string(repo.0.join("a.txt")).unwrap(), "one\n");
    assert!(!repo.0.join("new.txt").exists());
}

#[test]
fn checkpointer_errors_match_the_reference_script() {
    let repo = Repo::new("errors");
    assert_eq!(tool(&repo.0, &["checkpointer", "save", "--id", "dup"]).0, 0);
    let (code, _, err) = tool(&repo.0, &["checkpointer", "save", "--id", "dup"]);
    assert_eq!(code, 1);
    assert!(
        err.starts_with("checkpointer: checkpoint 'dup' already exists"),
        "{err}"
    );
    assert_eq!(
        tool(&repo.0, &["checkpointer", "save", "--id", "dup", "--force"]).0,
        0
    );

    assert_eq!(
        tool(&repo.0, &["checkpointer", "restore", "nope"]),
        (
            1,
            "".into(),
            "checkpointer: checkpoint not found: nope\n".into()
        )
    );
    assert_eq!(
        tool(&repo.0, &["checkpointer", "diff", "nope", "current"]).2,
        "checkpointer: unknown checkpoint: nope\n"
    );
    assert_eq!(
        tool(&repo.0, &["checkpointer", "diff", "dup", "nope"]).2,
        "checkpointer: unknown checkpoint or 'current' expected: nope\n"
    );
    assert_eq!(
        tool(&repo.0, &["checkpointer", "frobnicate"]).2,
        "checkpointer: unknown command: frobnicate (use --help)\n"
    );
    assert!(tool(&repo.0, &["checkpointer", "--help"])
        .1
        .contains("checkpointer save [--id <id>] [--force]"));

    // Reference exit 103: a subdirectory is not the workspace root.
    fs::create_dir_all(repo.0.join("sub")).unwrap();
    let (code, _, err) = tool(&repo.0.join("sub"), &["checkpointer", "save"]);
    assert_eq!(code, 103);
    assert!(
        err.contains("refusing to operate outside the workspace"),
        "{err}"
    );
}

#[test]
fn save_mid_merge_is_a_silent_101() {
    let repo = Repo::new("busy");
    fs::write(
        repo.0.join(".git/MERGE_HEAD"),
        "0000000000000000000000000000000000000000\n",
    )
    .unwrap();
    assert_eq!(
        tool(&repo.0, &["checkpointer", "save"]),
        (101, "".into(), "".into())
    );
    assert_eq!(
        tool(&repo.0, &["git-busy-check", "."]),
        (0, "busy:merge\n".into(), "".into())
    );
}

#[test]
fn git_busy_check_output_and_exit_codes() {
    let repo = Repo::new("busy-check");
    let root = repo.0.to_string_lossy().into_owned();
    assert_eq!(
        tool(Path::new("/"), &["git-busy-check", &root]),
        (0, "clean\n".into(), "".into())
    );
    assert_eq!(
        tool(Path::new("/"), &["git-busy-check", "/definitely/not/here"]),
        (2, "error: bad path\n".into(), "".into())
    );
    let plain = std::env::temp_dir().join(format!("oc-tool-cli-plain-{}", std::process::id()));
    fs::create_dir_all(&plain).unwrap();
    let (code, out, _) = tool(&plain, &["git-busy-check", "."]);
    let _ = fs::remove_dir_all(&plain);
    // A temp dir can sit inside a git checkout on some machines; only assert
    // the not-a-repo answer when git agrees it is outside one.
    if code == 2 {
        assert_eq!(out, "error: not a git repo\n");
    }
}

#[test]
fn unknown_tool_exits_2() {
    assert_eq!(tool(Path::new("."), &["nope"]).0, 2);
}
