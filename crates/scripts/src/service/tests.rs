use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::thread;
use std::time::Instant;

use super::*;
use crate::runner::RunState;

struct Fixture {
    _tmp: tempfile::TempDir,
    svc: ScriptService,
    ws: WorkspaceRef,
    events: Arc<Mutex<Vec<ScriptEvent>>>,
}

fn fixture(settings: &str) -> Fixture {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("repo");
    let ws_path = tmp.path().join("ws");
    fs::create_dir_all(root.join(".conductor")).unwrap();
    fs::create_dir_all(&ws_path).unwrap();
    fs::write(root.join(".conductor/settings.local.toml"), settings).unwrap();
    let events = Arc::new(Mutex::new(Vec::new()));
    let seen = events.clone();
    let svc = ScriptService::new(
        tmp.path().join("home/.conductor"),
        tmp.path().join("logs"),
        Arc::new(move |e| seen.lock().unwrap().push(e)),
    )
    .with_base_env(BTreeMap::from([("PATH".into(), "/usr/bin:/bin".into())]));
    let ws = WorkspaceRef {
        workspace_id: "w1".into(),
        repository_id: "r1".into(),
        repo_root: root,
        workspace_path: ws_path,
        workspace_name: "tokyo".into(),
        default_branch: "main".into(),
        target_branch: None,
    };
    Fixture {
        _tmp: tmp,
        svc,
        ws,
        events,
    }
}

fn wait_for(what: &str, mut f: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !f() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn setup_streams_output_then_auto_runs_the_default_script() {
    let f = fixture(
        r#"
[scripts]
setup = "echo setting up in $CONDUCTOR_WORKSPACE_NAME"
auto_run_after_setup = true
[scripts.run.dev]
command = "echo dev on $CONDUCTOR_PORT"
default = true
"#,
    );
    assert!(f.svc.start_setup(&f.ws).unwrap());
    wait_for("auto-run output", || {
        f.svc
            .runs
            .output("w1", "dev")
            .unwrap_or_default()
            .contains("dev on 55000")
    });
    assert_eq!(f.svc.setup.state("w1"), SetupState::Completed);
    let events = f.events.lock().unwrap();
    assert!(events.iter().any(|e| matches!(e, ScriptEvent::Output { kind: "setup", chunk, .. } if chunk.contains("setting up in tokyo"))));
    assert!(events
        .iter()
        .any(|e| matches!(e, ScriptEvent::SetupFinished(o) if o.state == SetupState::Completed)));
}

#[test]
fn run_uses_cwd_args_and_errors_without_scripts() {
    let f = fixture("[scripts.run.test]\ncommand = \"pwd; echo\"\nargs = [\"a b\"]\noptions = { cwd = \"sub\" }\n");
    fs::create_dir_all(f.ws.workspace_path.join("sub")).unwrap();
    assert_eq!(f.svc.start_run(&f.ws, Some("TEST")).unwrap(), "test");
    wait_for("run exit", || {
        f.svc.runs.state("w1", "test") == RunState::Stopped
    });
    let out = f.svc.runs.output("w1", "test").unwrap();
    let sub = f.ws.workspace_path.join("sub"); // logical $PWD, not the canonical path
    assert_eq!(out, format!("{}\na b\n", sub.display()));
    assert!(f.svc.start_run(&f.ws, Some("missing")).is_err());
    assert!(!f.svc.start_setup(&f.ws).unwrap(), "no setup script");
}

#[test]
fn archive_runs_to_completion_with_the_workspace_id() {
    let f = fixture("[scripts]\narchive = \"echo bye $CONDUCTOR_WORKSPACE_ID; exit 4\"\n");
    let (code, out) = f.svc.run_archive(&f.ws).unwrap().unwrap();
    assert_eq!((code, out.as_str()), (Some(4), "bye w1\n"));
    let none = fixture("");
    assert_eq!(none.svc.run_archive(&none.ws).unwrap(), None);
    assert!(Path::new(&f.ws.workspace_path).exists());
}
