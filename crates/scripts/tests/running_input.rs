use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use oc_scripts::env::ScriptKind;
use oc_scripts::launch::{script_path, LaunchSpec};
use oc_scripts::runner::{RunManager, RunRequest, RunState};
use oc_scripts::setup::SetupState;

const READ: &str =
    "stty -echo; printf 'ready\\n'; IFS= read -r -t 10 answer; printf 'received:%s\\n' \"$answer\"";

fn request(dir: &Path, workspace: &str, script: &str) -> RunRequest {
    RunRequest {
        workspace_id: workspace.into(),
        repo_id: "input-repo".into(),
        script_id: script.into(),
        spec: LaunchSpec {
            script: READ.into(),
            script_path: script_path(
                &dir.join(".conductor"),
                &dir.join(workspace),
                ScriptKind::Run,
                script,
            ),
            cwd: dir.to_path_buf(),
            base_env: BTreeMap::from([("PATH".into(), "/usr/bin:/bin".into())]),
            overlay: BTreeMap::new(),
            lang: None,
        },
        concurrent: true,
        sink: None,
        on_started: Arc::new(|_| {}),
        on_finished: Arc::new(|_| {}),
    }
}

fn wait_for(mut check: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !check() {
        assert!(Instant::now() < deadline, "timed out waiting for script");
        thread::sleep(Duration::from_millis(10));
    }
}

fn ready(manager: &RunManager, workspace: &str, script: &str) -> String {
    wait_for(|| {
        manager
            .output(workspace, script)
            .unwrap_or_default()
            .contains("ready")
    });
    manager.statuses(workspace)[0].run_id.clone().unwrap()
}

#[test]
fn live_script_consumes_input_from_its_pty_and_keeps_the_transcript_after_exit() {
    let dir = tempfile::tempdir().unwrap();
    let manager = RunManager::default();
    manager
        .start(request(dir.path(), "a", "dev"), SetupState::Completed)
        .unwrap();
    let run_id = ready(&manager, "a", "dev");
    assert!(manager
        .write("a", "dev", &run_id, "reply-é漢字\n".as_bytes())
        .unwrap());
    wait_for(|| manager.state("a", "dev") == RunState::Stopped);
    assert_eq!(
        manager.output("a", "dev").as_deref(),
        Some("ready\r\nreceived:reply-é漢字\r\n")
    );
    assert!(!manager.write("a", "dev", &run_id, b"late\n").unwrap());
    assert_eq!(
        manager.statuses("a")[0].run_id.as_deref(),
        Some(run_id.as_str())
    );
}

#[test]
fn a_previous_run_id_cannot_write_to_a_replacement_with_the_same_workspace_and_script() {
    let dir = tempfile::tempdir().unwrap();
    let manager = RunManager::default();
    manager
        .start(request(dir.path(), "a", "dev"), SetupState::Completed)
        .unwrap();
    let old_id = ready(&manager, "a", "dev");
    manager
        .start(request(dir.path(), "a", "dev"), SetupState::Completed)
        .unwrap();
    let current_id = ready(&manager, "a", "dev");
    assert_ne!(old_id, current_id);
    assert!(!manager.write("a", "dev", &old_id, b"poison\n").unwrap());
    assert!(!manager
        .write("b", "dev", &current_id, b"wrong workspace\n")
        .unwrap());
    assert!(!manager
        .write("a", "other", &current_id, b"wrong script\n")
        .unwrap());
    assert!(manager
        .write("a", "dev", &current_id, b"current\n")
        .unwrap());
    wait_for(|| manager.state("a", "dev") == RunState::Stopped);
    assert_eq!(
        manager.output("a", "dev").as_deref(),
        Some("ready\r\nreceived:current\r\n")
    );
}

#[test]
fn setup_waiting_and_stopped_runs_cannot_receive_input() {
    let dir = tempfile::tempdir().unwrap();
    let manager = RunManager::default();
    manager
        .start(request(dir.path(), "a", "dev"), SetupState::Running)
        .unwrap();
    assert_eq!(manager.state("a", "dev"), RunState::WaitingForSetup);
    assert!(manager.statuses("a")[0].run_id.is_none());
    assert!(!manager.write("a", "dev", "unstarted", b"early\n").unwrap());
    assert!(manager.setup_finished("a").unwrap());
    let run_id = ready(&manager, "a", "dev");
    assert!(manager.stop("a", Some("dev")));
    assert!(!manager.write("a", "dev", &run_id, b"stopped\n").unwrap());
}

#[test]
fn simultaneous_workspaces_have_distinct_run_ids_and_separate_input() {
    let dir = tempfile::tempdir().unwrap();
    let manager = RunManager::default();
    for workspace in ["a", "b"] {
        manager
            .start(request(dir.path(), workspace, "dev"), SetupState::Completed)
            .unwrap();
    }
    let a = ready(&manager, "a", "dev");
    let b = ready(&manager, "b", "dev");
    assert_ne!(a, b);
    assert!(!manager.write("b", "dev", &a, b"misrouted\n").unwrap());
    assert!(manager.write("a", "dev", &a, b"A\n").unwrap());
    assert!(manager.write("b", "dev", &b, b"B\n").unwrap());
    wait_for(|| {
        manager.state("a", "dev") == RunState::Stopped
            && manager.state("b", "dev") == RunState::Stopped
    });
    assert_eq!(
        manager.output("a", "dev").as_deref(),
        Some("ready\r\nreceived:A\r\n")
    );
    assert_eq!(
        manager.output("b", "dev").as_deref(),
        Some("ready\r\nreceived:B\r\n")
    );
}
