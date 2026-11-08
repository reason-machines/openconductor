use std::collections::BTreeMap;
use std::sync::mpsc;
use std::time::Instant;

use super::*;
use crate::env::ScriptKind;

fn spec(dir: &Path, script: &str) -> LaunchSpec {
    LaunchSpec {
        script: script.into(),
        script_path: launch::script_path(
            &dir.join(".conductor"),
            &dir.join("ws"),
            ScriptKind::Setup,
            "s",
        ),
        cwd: dir.to_path_buf(),
        base_env: BTreeMap::from([("PATH".to_string(), "/usr/bin:/bin".to_string())]),
        overlay: BTreeMap::new(),
        lang: None,
    }
}

fn run(mgr: &SetupManager, id: &str, spec: &LaunchSpec) -> SetupOutcome {
    let (tx, rx) = mpsc::channel();
    assert!(mgr
        .start(id, spec, None, Box::new(move |o| tx.send(o).unwrap()))
        .unwrap());
    rx.recv_timeout(Duration::from_secs(10))
        .expect("setup finished")
}

#[test]
fn success_saves_the_log_and_completes() {
    let tmp = tempfile::tempdir().unwrap();
    let mgr = SetupManager::new(tmp.path().join("logs"));
    assert_eq!(mgr.state("w1"), SetupState::Idle);
    let out = run(
        &mgr,
        "w1",
        &spec(tmp.path(), "echo installing; echo warn >&2"),
    );
    assert_eq!((out.state, out.exit_code), (SetupState::Completed, Some(0)));
    assert_eq!(out.log_path, tmp.path().join("logs/conductor-setup-w1.log"));
    assert_eq!(
        fs::read_to_string(&out.log_path).unwrap(),
        "installing\r\nwarn\r\n"
    );
    assert_eq!(mgr.state("w1"), SetupState::Completed);
    assert_eq!(mgr.log("w1").as_deref(), Some("installing\r\nwarn\r\n"));
}

#[test]
fn non_zero_exit_fails() {
    let tmp = tempfile::tempdir().unwrap();
    let mgr = SetupManager::new(tmp.path());
    let out = run(&mgr, "w1", &spec(tmp.path(), "echo nope; exit 7"));
    assert_eq!((out.state, out.exit_code), (SetupState::Failed, Some(7)));
}

#[test]
fn starting_twice_is_a_no_op_and_cancel_wins() {
    let tmp = tempfile::tempdir().unwrap();
    let mgr = SetupManager::new(tmp.path());
    let s = spec(tmp.path(), "echo begin; sleep 30");
    let (tx, rx) = mpsc::channel();
    assert!(mgr
        .start("w1", &s, None, Box::new(move |o| tx.send(o).unwrap()))
        .unwrap());
    assert!(!mgr
        .start("w1", &s, None, Box::new(|_| panic!("second run")))
        .unwrap());
    let deadline = Instant::now() + Duration::from_secs(5);
    while !mgr.log("w1").unwrap_or_default().contains("begin") {
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(20));
    }
    mgr.cancel("w1");
    let out = rx.recv_timeout(Duration::from_secs(10)).unwrap();
    assert_eq!(out.state, SetupState::Cancelled);
    assert!(out.log.contains("begin"));
    assert_eq!(mgr.state("w1"), SetupState::Cancelled);
    let workspace = tmp.path().join("selected-worktree");
    fs::create_dir(&workspace).unwrap();
    let mut rerun = spec(
        tmp.path(),
        "test -t 0 && test -t 1 && test -t 2 && printf 'fresh:%s\\n' \"$PWD\"",
    );
    rerun.cwd = workspace.clone();
    let out = run(&mgr, "w1", &rerun);
    assert_eq!((out.state, out.exit_code), (SetupState::Completed, Some(0)));
    assert_eq!(out.log, format!("fresh:{}\r\n", workspace.display()));
    assert_eq!(fs::read_to_string(&out.log_path).unwrap(), out.log);
    assert!(!rerun.script_path.exists(), "rerun script is removed");
}

#[test]
fn interrupt_all_waits_for_callbacks_and_stops_process_groups() {
    let tmp = tempfile::tempdir().unwrap();
    let mgr = SetupManager::new(tmp.path().join("logs"));
    let (tx, rx) = mpsc::channel();
    let s = spec(tmp.path(), "sleep 30 & echo child=$!; echo ready; wait");
    mgr.start(
        "w1",
        &s,
        None,
        Box::new(move |outcome| {
            thread::sleep(Duration::from_millis(50));
            tx.send(outcome).unwrap();
        }),
    )
    .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !mgr.log("w1").unwrap_or_default().contains("ready") {
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(10));
    }
    let log = mgr.log("w1").unwrap();
    let child: u32 = log
        .lines()
        .find_map(|line| line.strip_prefix("child="))
        .unwrap()
        .parse()
        .unwrap();
    mgr.interrupt_all();
    let outcome = rx
        .try_recv()
        .expect("callback finished before shutdown returned");
    assert_eq!(
        (outcome.state, outcome.exit_code),
        (SetupState::Failed, Some(1))
    );
    assert!(outcome.log.contains("ready"));
    assert!(outcome.log.contains(INTERRUPTED));
    assert_eq!(fs::read_to_string(&outcome.log_path).unwrap(), outcome.log);
    let status = std::process::Command::new("ps")
        .args(["-o", "stat=", "-p", &child.to_string()])
        .output()
        .unwrap();
    let status = String::from_utf8_lossy(&status.stdout);
    assert!(
        status.trim().is_empty() || status.trim().starts_with('Z'),
        "child still alive: {status}"
    );
    mgr.interrupt_all();
    assert!(rx.try_recv().is_err(), "callback only once");
    assert!(!mgr
        .start("w2", &s, None, Box::new(|_| panic!("closed")))
        .unwrap());
}

#[test]
fn interruption_wins_over_a_zero_exit_and_keeps_completed_work() {
    let tmp = tempfile::tempdir().unwrap();
    let mgr = SetupManager::new(tmp.path().join("logs"));
    let completed = run(&mgr, "completed", &spec(tmp.path(), "echo done"));
    let (tx, rx) = mpsc::channel();
    mgr.start(
        "active",
        &spec(
            tmp.path(),
            "trap 'exit 0' TERM; echo ready; while :; do sleep 0.1; done",
        ),
        None,
        Box::new(move |outcome| tx.send(outcome).unwrap()),
    )
    .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !mgr.log("active").unwrap_or_default().contains("ready") {
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(10));
    }
    mgr.interrupt_all();
    assert_eq!(rx.try_recv().unwrap().state, SetupState::Failed);
    assert_eq!(mgr.outcome("completed"), Some(completed));
}

#[test]
fn spawn_failure_and_interruption_are_failures() {
    let tmp = tempfile::tempdir().unwrap();
    let mgr = SetupManager::new(tmp.path());
    let mut s = spec(tmp.path(), "true");
    s.cwd = tmp.path().join("missing");
    let out = run(&mgr, "w1", &s);
    assert_eq!((out.state, out.exit_code), (SetupState::Failed, None));
    assert!(out.log.contains("Could not start"), "{}", out.log);

    let out = mgr.mark_interrupted("w2");
    assert_eq!((out.state, out.exit_code), (SetupState::Failed, Some(1)));
    assert_eq!(mgr.state("w2"), SetupState::Failed);
}
