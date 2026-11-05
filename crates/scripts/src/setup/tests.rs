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
        "installing\nwarn\n"
    );
    assert_eq!(mgr.state("w1"), SetupState::Completed);
    assert_eq!(mgr.log("w1").as_deref(), Some("installing\nwarn\n"));
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
