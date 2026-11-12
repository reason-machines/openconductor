use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use oc_scripts::env::ScriptKind;
use oc_scripts::launch::{script_path, LaunchSpec};
use oc_scripts::runner::{RunManager, RunRequest, RunState};
use oc_scripts::setup::SetupState;

const QUERY: &str = r#"stty -echo; printf 'ready\n'; while IFS= read -r -t 10 line; do printf 'query:%s:' "$line"; stty size; done"#;
const SIGNAL: &str = r#"stty -echo; trap 'printf "winch:"; stty size' WINCH; printf 'ready\n'; while :; do sleep 0.05; done"#;

fn request(dir: &Path, workspace: &str, script: &str, command: &str) -> RunRequest {
    RunRequest {
        workspace_id: workspace.into(),
        repo_id: "resize-repo".into(),
        script_id: script.into(),
        spec: LaunchSpec {
            script: command.into(),
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

struct Fixture {
    manager: RunManager,
    dir: tempfile::TempDir,
}

impl Fixture {
    fn new() -> Self {
        Self {
            manager: RunManager::default(),
            dir: tempfile::tempdir().unwrap(),
        }
    }

    fn start(&self, workspace: &str, command: &str) -> String {
        self.manager
            .start(
                request(self.dir.path(), workspace, "dev", command),
                SetupState::Completed,
            )
            .unwrap();
        wait_for(|| self.output(workspace).contains("ready\r\n"));
        self.manager.statuses(workspace)[0].run_id.clone().unwrap()
    }

    fn output(&self, workspace: &str) -> String {
        self.manager.output(workspace, "dev").unwrap_or_default()
    }

    fn measure(&self, workspace: &str, run_id: &str, label: &str, cols: u16, rows: u16) {
        assert!(self
            .manager
            .write(workspace, "dev", run_id, format!("{label}\n").as_bytes())
            .unwrap());
        let expected = format!("query:{label}:{rows} {cols}\r\n");
        wait_for(|| self.output(workspace).contains(&expected));
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.manager.stop_all();
    }
}

fn wait_for(mut check: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !check() {
        assert!(
            Instant::now() < deadline,
            "timed out waiting for script geometry"
        );
        thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn resize_changes_the_live_pty_size_and_delivers_sigwinch() {
    let fixture = Fixture::new();
    let run_id = fixture.start("a", SIGNAL);
    assert!(fixture.manager.resize("a", "dev", &run_id, 96, 32).unwrap());
    wait_for(|| fixture.output("a").contains("winch:32 96\r\n"));
}

#[test]
fn a_stale_run_id_cannot_resize_a_same_script_replacement() {
    let fixture = Fixture::new();
    let old_id = fixture.start("a", QUERY);
    fixture.measure("a", &old_id, "initial", 80, 24);
    assert!(fixture.manager.resize("a", "dev", &old_id, 96, 32).unwrap());
    fixture.measure("a", &old_id, "resized", 96, 32);
    let current_id = fixture.start("a", QUERY);
    assert_ne!(old_id, current_id);
    assert!(!fixture.manager.resize("a", "dev", &old_id, 96, 32).unwrap());
    assert!(!fixture
        .manager
        .resize("a", "other", &current_id, 96, 32)
        .unwrap());
    assert!(!fixture
        .manager
        .resize("b", "dev", &current_id, 96, 32)
        .unwrap());
    fixture.measure("a", &current_id, "replacement", 80, 24);
    assert!(fixture
        .manager
        .resize("a", "dev", &current_id, 96, 32)
        .unwrap());
    fixture.measure("a", &current_id, "current", 96, 32);
}

#[test]
fn waiting_stopped_and_exited_runs_cannot_receive_geometry() {
    let fixture = Fixture::new();
    fixture
        .manager
        .start(
            request(fixture.dir.path(), "a", "dev", QUERY),
            SetupState::Running,
        )
        .unwrap();
    assert_eq!(fixture.manager.state("a", "dev"), RunState::WaitingForSetup);
    assert!(!fixture
        .manager
        .resize("a", "dev", "unstarted", 96, 32)
        .unwrap());
    assert!(fixture.manager.setup_finished("a").unwrap());
    wait_for(|| fixture.output("a").contains("ready\r\n"));
    let run_id = fixture.manager.statuses("a")[0].run_id.clone().unwrap();
    assert!(fixture.manager.stop("a", Some("dev")));
    assert!(!fixture.manager.resize("a", "dev", &run_id, 96, 32).unwrap());
    fixture
        .manager
        .start(
            request(fixture.dir.path(), "a", "dev", "printf 'exited\\n'"),
            SetupState::Completed,
        )
        .unwrap();
    wait_for(|| fixture.manager.state("a", "dev") == RunState::Stopped);
    let exit_id = fixture.manager.statuses("a")[0].run_id.clone().unwrap();
    assert!(!fixture
        .manager
        .resize("a", "dev", &exit_id, 96, 32)
        .unwrap());
}

#[test]
fn concurrent_workspaces_keep_independent_pty_geometry() {
    let fixture = Fixture::new();
    let a = fixture.start("a", QUERY);
    let b = fixture.start("b", QUERY);
    assert!(!fixture.manager.resize("b", "dev", &a, 96, 32).unwrap());
    assert!(fixture.manager.resize("a", "dev", &a, 96, 32).unwrap());
    fixture.measure("a", &a, "first", 96, 32);
    fixture.measure("b", &b, "untouched", 80, 24);
    assert!(fixture.manager.resize("b", "dev", &b, 120, 40).unwrap());
    fixture.measure("a", &a, "still", 96, 32);
    fixture.measure("b", &b, "second", 120, 40);
}

#[test]
fn zero_geometry_is_rejected_without_changing_the_live_pty() {
    let fixture = Fixture::new();
    let run_id = fixture.start("a", QUERY);
    for (cols, rows) in [(0, 32), (96, 0), (0, 0)] {
        let error = fixture
            .manager
            .resize("a", "dev", &run_id, cols, rows)
            .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
    }
    fixture.measure("a", &run_id, "unchanged", 80, 24);
}
