use std::collections::BTreeMap;
use std::path::Path;
use std::time::Instant;

use super::*;
use crate::env::ScriptKind;

fn req(dir: &Path, ws: &str, repo: &str, id: &str, script: &str, concurrent: bool) -> RunRequest {
    RunRequest {
        workspace_id: ws.into(),
        repo_id: repo.into(),
        script_id: id.into(),
        spec: LaunchSpec {
            script: script.into(),
            script_path: launch::script_path(
                &dir.join(".conductor"),
                &dir.join(ws),
                ScriptKind::Run,
                id,
            ),
            cwd: dir.to_path_buf(),
            base_env: BTreeMap::from([("PATH".to_string(), "/usr/bin:/bin".to_string())]),
            overlay: BTreeMap::new(),
            lang: None,
        },
        concurrent,
        sink: None,
    }
}

fn wait_for(what: &str, mut f: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !f() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        thread::sleep(Duration::from_millis(20));
    }
}

const LONG: &str = "echo up; sleep 30";

#[test]
fn runs_to_exit_and_keeps_output() {
    let tmp = tempfile::tempdir().unwrap();
    let m = RunManager::default();
    m.start(
        req(tmp.path(), "w1", "r", "test", "echo done; exit 2", true),
        SetupState::Completed,
    )
    .unwrap();
    wait_for("exit", || m.state("w1", "test") == RunState::Stopped);
    assert_eq!(m.output("w1", "test").as_deref(), Some("done\n"));
    assert_eq!(m.statuses("w1")[0].exit, Some((Some(2), None)));
}

#[test]
fn starting_a_script_stops_the_workspaces_other_run() {
    let tmp = tempfile::tempdir().unwrap();
    let m = RunManager::default();
    m.start(
        req(tmp.path(), "w1", "r", "dev", LONG, true),
        SetupState::Idle,
    )
    .unwrap();
    wait_for("dev up", || {
        m.output("w1", "dev").unwrap_or_default().contains("up")
    });
    m.start(
        req(tmp.path(), "w1", "r", "test", LONG, true),
        SetupState::Idle,
    )
    .unwrap();
    assert_eq!(m.state("w1", "dev"), RunState::Stopped);
    assert_eq!(m.state("w1", "test"), RunState::Running);
    assert_eq!(m.history("w1"), ["test", "dev"]);
    assert!(m.stop("w1", Some("test")));
    assert!(!m.stop("w1", Some("test")), "nothing left to stop");
}

#[test]
fn nonconcurrent_stops_other_workspaces_of_the_same_repo_only() {
    let tmp = tempfile::tempdir().unwrap();
    let m = RunManager::default();
    m.start(
        req(tmp.path(), "w1", "r", "dev", LONG, true),
        SetupState::Idle,
    )
    .unwrap();
    m.start(
        req(tmp.path(), "x1", "other", "dev", LONG, true),
        SetupState::Idle,
    )
    .unwrap();
    m.start(
        req(tmp.path(), "w2", "r", "dev", LONG, false),
        SetupState::Idle,
    )
    .unwrap();
    assert_eq!(m.state("w1", "dev"), RunState::Stopped);
    assert_eq!(m.state("x1", "dev"), RunState::Running);
    assert_eq!(m.state("w2", "dev"), RunState::Running);
    m.stop_all();
    assert_eq!(m.state("x1", "dev"), RunState::Stopped);
}

#[test]
fn waits_for_setup_then_starts() {
    let tmp = tempfile::tempdir().unwrap();
    let m = RunManager::default();
    m.start(
        req(tmp.path(), "w1", "r", "dev", "echo ran", true),
        SetupState::Running,
    )
    .unwrap();
    assert_eq!(m.state("w1", "dev"), RunState::WaitingForSetup);
    assert!(m.setup_finished("w1").unwrap());
    wait_for("run", || {
        m.output("w1", "dev").unwrap_or_default().contains("ran")
    });
    assert!(!m.setup_finished("w1").unwrap());

    m.start(
        req(tmp.path(), "w2", "r", "dev", "echo never", true),
        SetupState::Running,
    )
    .unwrap();
    assert!(m.stop("w2", None));
    assert_eq!(m.state("w2", "dev"), RunState::Stopped);
    assert!(
        !m.setup_finished("w2").unwrap(),
        "a stopped wait does not start later"
    );
}

#[test]
fn auto_run_rule() {
    use SetupState::*;
    assert!(should_auto_run(true, true, true, Completed));
    assert!(should_auto_run(true, true, false, Idle));
    assert!(!should_auto_run(true, true, true, Idle));
    assert!(!should_auto_run(true, true, true, Failed));
    assert!(!should_auto_run(false, true, true, Completed));
    assert!(!should_auto_run(true, false, true, Completed));
}
