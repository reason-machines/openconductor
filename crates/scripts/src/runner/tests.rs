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
        on_started: Arc::new(|_| {}),
        on_finished: Arc::new(|_| {}),
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
    assert_eq!(m.output("w1", "test").as_deref(), Some("done\r\n"));
    assert_eq!(m.statuses("w1")[0].exit, Some((Some(2), None)));
}

#[test]
fn completion_callback_reads_the_committed_status_and_output() {
    let tmp = tempfile::tempdir().unwrap();
    let m = RunManager::default();
    let (tx, rx) = std::sync::mpsc::channel();
    let observer = m.clone();
    let mut request = req(tmp.path(), "w1", "r", "dev", "echo finished", true);
    request.on_finished = Arc::new(move |status| {
        let current = observer.statuses("w1");
        let output = observer.output("w1", "dev");
        tx.send((status, current, output)).unwrap();
    });
    m.start(request, SetupState::Completed).unwrap();
    let (status, current, output) = rx.recv_timeout(Duration::from_secs(10)).unwrap();
    assert_eq!(status.state, RunState::Stopped);
    assert_eq!(status.exit, Some((Some(0), None)));
    assert_eq!(current, [status]);
    assert_eq!(output.as_deref(), Some("finished\r\n"));
}

#[test]
fn admission_callback_precedes_completion_and_reads_the_committed_running_state() {
    let tmp = tempfile::tempdir().unwrap();
    let m = RunManager::default();
    m.start(
        req(tmp.path(), "w1", "r", "dev", "exit 7", true),
        SetupState::Completed,
    )
    .unwrap();
    wait_for("first exit", || m.state("w1", "dev") == RunState::Stopped);
    assert_eq!(m.statuses("w1")[0].exit, Some((Some(7), None)));

    let (tx, rx) = std::sync::mpsc::channel();
    let started = tx.clone();
    let observer = m.clone();
    let mut request = req(tmp.path(), "w1", "r", "dev", "exit 0", true);
    request.on_started = Arc::new(move |status| {
        let current = observer.statuses("w1");
        started.send((status, current)).unwrap();
    });
    request.on_finished = Arc::new(move |status| tx.send((status, Vec::new())).unwrap());
    m.start(request, SetupState::Completed).unwrap();
    let (admitted, current) = rx.recv_timeout(Duration::from_secs(10)).unwrap();
    assert_eq!(admitted.state, RunState::Running);
    assert_eq!(admitted.exit, None, "a new admission clears the old exit");
    assert_eq!(current, [admitted]);
    let (finished, _) = rx.recv_timeout(Duration::from_secs(10)).unwrap();
    assert_eq!(finished.state, RunState::Stopped);
    assert_eq!(finished.exit, Some((Some(0), None)));
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
fn rerun_of_the_same_script_replaces_the_pty_and_transcript() {
    let tmp = tempfile::tempdir().unwrap();
    let m = RunManager::default();
    m.start(
        req(tmp.path(), "w1", "r", "dev", LONG, true),
        SetupState::Idle,
    )
    .unwrap();
    wait_for("first run", || {
        m.output("w1", "dev").unwrap_or_default().contains("up")
    });
    m.start(
        req(
            tmp.path(),
            "w1",
            "r",
            "dev",
            "test -t 0 && test -t 1 && test -t 2 && echo fresh",
            true,
        ),
        SetupState::Idle,
    )
    .unwrap();
    wait_for("rerun exit", || m.state("w1", "dev") == RunState::Stopped);
    assert_eq!(m.output("w1", "dev").as_deref(), Some("fresh\r\n"));
    assert_eq!(m.statuses("w1")[0].exit, Some((Some(0), None)));
    assert_eq!(m.history("w1"), ["dev"]);
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
fn stop_repository_stops_every_workspace_of_that_repo_only() {
    let tmp = tempfile::tempdir().unwrap();
    let m = RunManager::default();
    m.start(
        req(tmp.path(), "w1", "r", "dev", LONG, true),
        SetupState::Idle,
    )
    .unwrap();
    m.start(
        req(tmp.path(), "w3", "r", "dev", LONG, true),
        SetupState::Running,
    )
    .unwrap();
    m.start(
        req(tmp.path(), "x1", "other", "dev", LONG, true),
        SetupState::Idle,
    )
    .unwrap();
    assert_eq!(m.state("w3", "dev"), RunState::WaitingForSetup);

    assert_eq!(m.stop_repository("r"), ["w1", "w3"]);
    assert_eq!(m.state("w1", "dev"), RunState::Stopped);
    assert_eq!(m.state("w3", "dev"), RunState::Stopped);
    assert!(!m.setup_finished("w3").unwrap(), "the wait is dropped");
    assert_eq!(m.state("x1", "dev"), RunState::Running);
    assert!(m.stop_repository("r").is_empty(), "nothing left to stop");
    m.stop_all();
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

// Seed a completed run so retention can be tested without launching a PTY.
fn completed_run(manager: &RunManager, workspace: &str, script: &str) {
    let key = (workspace.to_string(), script.to_string());
    let mut inner = manager.lock();
    inner.states.insert(key.clone(), RunState::Stopped);
    inner.repos.insert(key.clone(), "r".into());
    inner.run_ids.insert(key.clone(), "previous-run".into());
    inner
        .last_output
        .insert(key.clone(), "previous output\r\n".into());
    inner.last_exit.insert(
        key.clone(),
        Exit {
            code: Some(7),
            signal: None,
        },
    );
    inner.started_at.insert(key, SystemTime::UNIX_EPOCH);
    inner.history.insert(workspace.into(), vec![script.into()]);
}

#[test]
fn retention_new_task_clears_previous_workspace_run_before_setup_wait() {
    let tmp = tempfile::tempdir().unwrap();
    let manager = RunManager::default();
    completed_run(&manager, "w1", "dev");

    manager
        .start(
            req(tmp.path(), "w1", "r", "test", "must not execute", true),
            SetupState::Running,
        )
        .unwrap();

    assert_eq!(
        manager.output("w1", "dev"),
        None,
        "an old task's transcript must not survive a new start"
    );
    let statuses = manager.statuses("w1");
    assert_eq!(statuses.len(), 1);
    assert_eq!(statuses[0].script_id, "test");
    assert_eq!(statuses[0].state, RunState::WaitingForSetup);
    assert!(
        !tmp.path().join(".conductor").exists(),
        "the queued path never launches a script"
    );
}

#[test]
fn retention_same_task_clears_old_transcript_and_exit_before_setup_wait() {
    let tmp = tempfile::tempdir().unwrap();
    let manager = RunManager::default();
    completed_run(&manager, "w1", "dev");

    manager
        .start(
            req(tmp.path(), "w1", "r", "dev", "must not execute", true),
            SetupState::Running,
        )
        .unwrap();

    assert_eq!(
        manager.output("w1", "dev"),
        None,
        "a queued rerun must not expose its previous transcript"
    );
    let status = manager.statuses("w1").remove(0);
    assert_eq!(status.exit, None);
    assert_eq!(status.run_id, None);
    assert_eq!(status.state, RunState::WaitingForSetup);
    assert!(!tmp.path().join(".conductor").exists());
}

#[test]
fn retention_new_start_preserves_selection_history_and_other_workspace() {
    let tmp = tempfile::tempdir().unwrap();
    let manager = RunManager::default();
    completed_run(&manager, "w1", "dev");
    completed_run(&manager, "w2", "dev");
    let other_status = manager.statuses("w2");
    let other_latest = manager.latest("w2");

    manager
        .start(
            req(tmp.path(), "w1", "r", "test", "must not execute", true),
            SetupState::Running,
        )
        .unwrap();

    assert_eq!(manager.history("w1"), ["test", "dev"]);
    assert_eq!(manager.history("w2"), ["dev"]);
    assert_eq!(manager.statuses("w2"), other_status);
    assert_eq!(manager.latest("w2"), other_latest);
    assert!(!tmp.path().join(".conductor").exists());
}

#[test]
fn retention_completed_output_remains_until_another_start() {
    let manager = RunManager::default();
    completed_run(&manager, "w1", "dev");

    assert_eq!(
        manager.output("w1", "dev").as_deref(),
        Some("previous output\r\n")
    );
    assert_eq!(manager.statuses("w1")[0].exit, Some((Some(7), None)));
    assert!(!manager.stop("w1", Some("dev")));
    assert_eq!(
        manager.output("w1", "dev").as_deref(),
        Some("previous output\r\n")
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

#[test]
fn latest_is_the_newest_run_with_its_state_and_output() {
    let tmp = tempfile::tempdir().unwrap();
    let m = RunManager::default();
    assert_eq!(m.latest("w1"), None);
    m.start(
        req(tmp.path(), "w1", "r", "test", "echo old; exit 0", true),
        SetupState::Idle,
    )
    .unwrap();
    wait_for("test exit", || m.state("w1", "test") == RunState::Stopped);
    let first = m.latest("w1").unwrap();
    assert_eq!(first.script_id, "test");
    assert_eq!(first.state, RunState::Stopped);
    assert_eq!(first.output.as_deref(), Some("old\r\n"));

    m.start(
        req(tmp.path(), "w1", "r", "dev", LONG, true),
        SetupState::Idle,
    )
    .unwrap();
    wait_for("dev up", || {
        m.output("w1", "dev").unwrap_or_default().contains("up")
    });
    let live = m.latest("w1").unwrap();
    assert_eq!(live.script_id, "dev");
    assert_eq!(live.state, RunState::Running);
    assert_eq!(live.output.as_deref(), Some("up\r\n"));
    assert!(live.started_at >= first.started_at);
    assert_eq!(m.latest("w2"), None, "other workspaces are not mixed in");
    m.stop_all();
}
