use super::*;
use std::fs;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// Captured stdout.
#[derive(Clone, Default)]
struct Capture(Arc<Mutex<Vec<u8>>>);

impl Write for Capture {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Capture {
    fn text(&self) -> String {
        String::from_utf8_lossy(&self.0.lock().unwrap()).into_owned()
    }
}

struct Dir(PathBuf);

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn tmp_dir() -> Dir {
    static N: AtomicU64 = AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "oc-tool-spotlighter-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    Dir(fs::canonicalize(dir).unwrap())
}

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "T")
        .env("GIT_AUTHOR_EMAIL", "t@example.invalid")
        .env("GIT_COMMITTER_NAME", "T")
        .env("GIT_COMMITTER_EMAIL", "t@example.invalid")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn wait_for(capture: &Capture, needle: &str, count: usize) {
    let deadline = Instant::now() + Duration::from_secs(20);
    while capture.text().matches(needle).count() < count {
        assert!(
            Instant::now() < deadline,
            "waited for {count}x {needle:?}; output:\n{}",
            capture.text()
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn missing_root_env_exits_1_with_the_scripts_message() {
    let logs = tmp_dir();
    let out = Capture::default();
    let code = run(None, &logs.0, &logs.0, 7, Box::new(out.clone()), || {
        panic!("must not wait")
    });
    assert_eq!(code, 1);
    let log_path = logs.0.join("conductor-spotlight-7.log");
    assert_eq!(
        out.text(),
        format!(
            "Spotlight logging to: {}\nspotlighter.sh: CONDUCTOR_ROOT_PATH: Environment variable CONDUCTOR_ROOT_PATH must be set\n",
            log_path.display()
        )
    );
    // The "logging to" line is printed before output is copied to the log.
    assert_eq!(
        fs::read_to_string(log_path).unwrap(),
        "spotlighter.sh: CONDUCTOR_ROOT_PATH: Environment variable CONDUCTOR_ROOT_PATH must be set\n"
    );
}

#[test]
fn root_that_is_not_a_directory_exits_1() {
    let logs = tmp_dir();
    let missing = logs.0.join("nope");
    let out = Capture::default();
    let code = run(
        Some(missing.clone().into_os_string()),
        &logs.0,
        &logs.0,
        8,
        Box::new(out.clone()),
        || panic!("must not wait"),
    );
    assert_eq!(code, 1);
    assert!(out.text().ends_with(&format!(
        "Error: CONDUCTOR_ROOT_PATH does not exist or is not a directory: {}\n",
        missing.display()
    )));
}

#[test]
fn syncs_the_workspace_into_the_root_until_stopped() {
    let base = tmp_dir();
    let (root, ws) = (base.0.join("root"), base.0.join("ws"));
    fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "-q", "-b", "main"]);
    fs::write(root.join("app.txt"), "v1\n").unwrap();
    git(&root, &["add", "."]);
    git(&root, &["commit", "-qm", "init"]);
    git(
        &root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "feature",
            ws.to_str().unwrap(),
        ],
    );
    fs::write(ws.join("app.txt"), "from ws\n").unwrap();

    let out = Capture::default();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (root_env, ws2, logs, cap) = (
        root.clone().into_os_string(),
        ws.clone(),
        base.0.clone(),
        out.clone(),
    );
    let tool = std::thread::spawn(move || {
        run(Some(root_env), &ws2, &logs, 9, Box::new(cap), move || {
            let _ = stop_rx.recv();
        })
    });

    // Synced once at start.
    wait_for(&out, "Restored checkpoint", 1);
    assert_eq!(
        fs::read_to_string(root.join("app.txt")).unwrap(),
        "from ws\n"
    );
    // And again after a change.
    fs::write(ws.join("new.txt"), "added\n").unwrap();
    wait_for(&out, "Restored checkpoint", 2);
    assert_eq!(fs::read_to_string(root.join("new.txt")).unwrap(), "added\n");

    stop_tx.send(()).unwrap();
    assert_eq!(tool.join().unwrap(), 0);

    let text = out.text();
    let id = text
        .lines()
        .find_map(|l| l.strip_prefix("Saved checkpoint: "))
        .unwrap()
        .to_string();
    assert!(
        id.starts_with("cp-spotlight-") && id.ends_with("-9"),
        "{id}"
    );
    assert!(text.contains(&format!(
        "\nStarting sync...\nSaved checkpoint: {id}\nRestored checkpoint {id} in {}\n",
        root.display()
    )));
    let log = fs::read_to_string(base.0.join("conductor-spotlight-9.log")).unwrap();
    assert!(!log.contains("Spotlight logging to"));
    assert_eq!(log.matches("Restored checkpoint").count(), 2);

    // Stopped: later changes are not synced.
    fs::write(ws.join("app.txt"), "after stop\n").unwrap();
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(
        fs::read_to_string(root.join("app.txt")).unwrap(),
        "from ws\n"
    );
}

#[test]
fn skip_and_failure_lines_use_the_scripts_wording() {
    let root = Path::new("/r");
    let lines = |e| event_lines(&e, "cp-spotlight-1-2", root);
    assert_eq!(
        lines(SyncEvent::Finished(SyncOutcome::SkippedBusy)),
        ["Skipping sync: merge/rebase in progress"]
    );
    assert_eq!(
        lines(SyncEvent::Finished(SyncOutcome::SkippedSaveFailed(
            "boom\n".into()
        ))),
        ["boom", "Skipping sync: checkpoint save failed"]
    );
    assert_eq!(
        lines(SyncEvent::Finished(SyncOutcome::RestoreFailed(
            "dirty".into()
        ))),
        [
            "Saved checkpoint: cp-spotlight-1-2",
            "dirty",
            "Warning: checkpoint restore failed in /r"
        ]
    );
}
