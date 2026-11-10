use std::fs;
use std::path::{Path, PathBuf};
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
fn shutdown_interrupts_active_setup() {
    let f = fixture("[scripts]\nsetup = \"echo ready; sleep 30\"\n");
    assert!(f.svc.start_setup(&f.ws).unwrap());
    wait_for("setup output", || {
        f.svc.setup.log("w1").unwrap_or_default().contains("ready")
    });
    f.svc.shutdown();
    let state = f.svc.setup.state("w1");
    f.svc.setup.cancel("w1");
    assert_eq!(state, SetupState::Failed);
    let outcome = f.svc.setup.outcome("w1").unwrap();
    assert!(outcome.log.contains("ready"));
    assert!(outcome.log.contains("interrupted"));
    assert_eq!(fs::read_to_string(&outcome.log_path).unwrap(), outcome.log);
    f.svc.shutdown();
    assert_eq!(
        f.events
            .lock()
            .unwrap()
            .iter()
            .filter(|e| matches!(e, ScriptEvent::SetupFinished(_)))
            .count(),
        1
    );
    assert!(!f.svc.start_setup(&f.ws).unwrap());
}

#[test]
fn shutdown_discards_queued_runs_and_blocks_auto_run() {
    let f = fixture(
        r#"
[scripts]
setup = "echo ready; sleep 30"
auto_run_after_setup = true
[scripts.run.dev]
command = "echo must-not-run"
default = true
"#,
    );
    let calls = spotlight_hook(&f, Some(Ok(())));
    assert!(f.svc.start_setup(&f.ws).unwrap());
    wait_for("setup output", || {
        f.svc.setup.log("w1").unwrap_or_default().contains("ready")
    });
    f.svc.start_run(&f.ws, None).unwrap();
    assert_eq!(f.svc.runs.state("w1", "dev"), RunState::WaitingForSetup);
    f.svc.shutdown();
    assert_eq!(f.svc.runs.state("w1", "dev"), RunState::Stopped);
    assert_eq!(f.svc.runs.output("w1", "dev"), None);
    assert!(calls.lock().unwrap().is_empty());
    assert!(f
        .svc
        .start_run(&f.ws, None)
        .unwrap_err()
        .contains("shutting down"));
}

#[test]
fn shutdown_blocks_auto_run_without_a_setup_script() {
    let f = fixture(AUTO_RUN_DEV);
    let calls = spotlight_hook(&f, Some(Ok(())));
    f.svc.shutdown();
    assert!(!f.svc.start_setup(&f.ws).unwrap());
    assert!(calls.lock().unwrap().is_empty());
    assert_eq!(f.svc.runs.output("w1", "dev"), None);
}

#[test]
fn shutdown_waits_for_in_flight_completion_without_starting_a_queued_run() {
    let mut f = fixture(
        r#"
[scripts]
setup = "echo ready"
auto_run_after_setup = true
[scripts.run.dev]
command = "echo must-not-run"
default = true
"#,
    );
    let (entered_tx, entered_rx) = std::sync::mpsc::channel();
    let release = Arc::new(std::sync::Barrier::new(2));
    let release_callback = release.clone();
    let events = f.svc.events.clone();
    f.svc.events = Arc::new(move |event| {
        if matches!(event, ScriptEvent::SetupFinished(_)) {
            entered_tx.send(()).unwrap();
            release_callback.wait();
        }
        events(event);
    });
    // Queue before completion, independently of the fast setup process.
    let spec = f
        .svc
        .spec(
            &f.ws,
            ScriptKind::Run,
            "echo must-not-run".into(),
            f.ws.workspace_path.clone(),
        )
        .unwrap();
    f.svc
        .runs
        .start(
            RunRequest {
                workspace_id: "w1".into(),
                repo_id: "r1".into(),
                script_id: "dev".into(),
                spec,
                concurrent: true,
                sink: None,
                on_finished: Arc::new(|_| {}),
            },
            SetupState::Running,
        )
        .unwrap();
    f.svc.start_setup(&f.ws).unwrap();
    entered_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    let svc = f.svc.clone();
    let shutdown = thread::spawn(move || svc.shutdown());
    wait_for("shutdown admission closed", || {
        *f.svc.shutting_down.lock().unwrap()
    });
    assert!(
        !shutdown.is_finished(),
        "shutdown must await completion callback"
    );
    release.wait();
    shutdown.join().unwrap();
    assert_eq!(f.svc.runs.state("w1", "dev"), RunState::Stopped);
    assert_eq!(f.svc.runs.output("w1", "dev"), None);
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
fn ordinary_run_exit_emits_its_committed_status_and_keeps_output() {
    let f = fixture("[scripts.run.dev]\ncommand = \"echo finished; exit 7\"\n");
    f.svc.start_run(&f.ws, Some("dev")).unwrap();
    wait_for("run completion event", || {
        f.events
            .lock()
            .unwrap()
            .iter()
            .any(|event| serde_json::to_value(event).unwrap()["type"] == "runFinished")
    });
    let events = f.events.lock().unwrap();
    let finished: Vec<_> = events
        .iter()
        .map(|event| serde_json::to_value(event).unwrap())
        .filter(|event| event["type"] == "runFinished")
        .collect();
    assert_eq!(finished.len(), 1);
    assert_eq!(finished[0]["workspaceId"], "w1");
    assert_eq!(finished[0]["scriptId"], "dev");
    assert_eq!(finished[0]["state"], "stopped");
    assert_eq!(finished[0]["exit"], serde_json::json!([7, null]));
    assert_eq!(f.svc.runs.state("w1", "dev"), RunState::Stopped);
    assert_eq!(
        f.svc.runs.output("w1", "dev").as_deref(),
        Some("finished\r\n")
    );
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
    assert_eq!(out, format!("{}\r\na b\r\n", sub.display()));
    assert!(f.svc.start_run(&f.ws, Some("missing")).is_err());
    assert!(!f.svc.start_setup(&f.ws).unwrap(), "no setup script");
}

#[test]
fn archive_runs_to_completion_with_the_workspace_id() {
    let f = fixture("[scripts]\narchive = \"echo bye $CONDUCTOR_WORKSPACE_ID; exit 4\"\n");
    let (code, out) = f.svc.run_archive(&f.ws).unwrap().unwrap();
    assert_eq!((code, out.as_str()), (Some(4), "bye w1\r\n"));
    let none = fixture("");
    assert_eq!(none.svc.run_archive(&none.ws).unwrap(), None);
    assert!(Path::new(&f.ws.workspace_path).exists());
}

/// Records each workspace the auto-run Spotlight hook was asked about and
/// answers with `answer`.
fn spotlight_hook(
    f: &Fixture,
    answer: Option<Result<(), String>>,
) -> Arc<Mutex<Vec<(String, PathBuf)>>> {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let seen = calls.clone();
    f.svc
        .set_auto_run_spotlight(Arc::new(move |_svc, ws, paths| {
            assert_eq!(paths.repo_root, ws.repo_root);
            assert_eq!(
                paths.workspace.as_deref(),
                Some(ws.workspace_path.as_path())
            );
            seen.lock()
                .unwrap()
                .push((ws.workspace_id.clone(), paths.repo_root.clone()));
            answer.clone()
        }));
    calls
}

const AUTO_RUN_DEV: &str = r#"
[scripts]
auto_run_after_setup = true
[scripts.run.dev]
command = "echo dev"
default = true
"#;

#[test]
fn spotlight_takes_the_auto_runs_place_when_the_hook_starts_it() {
    let f = fixture(AUTO_RUN_DEV);
    let calls = spotlight_hook(&f, Some(Ok(())));
    assert!(!f.svc.start_setup(&f.ws).unwrap(), "no setup script");
    assert_eq!(
        *calls.lock().unwrap(),
        vec![("w1".to_string(), f.ws.repo_root.clone())]
    );
    thread::sleep(Duration::from_millis(200));
    assert_eq!(
        f.svc.runs.output("w1", "dev"),
        None,
        "run script must not start"
    );
    assert_eq!(f.svc.runs.state("w1", "dev"), RunState::Stopped);
}

#[test]
fn a_failed_spotlight_auto_run_does_not_fall_back_to_the_run_script() {
    let f = fixture(AUTO_RUN_DEV);
    let calls = spotlight_hook(&f, Some(Err("root is mid-rebase".into())));
    f.svc.start_setup(&f.ws).unwrap();
    assert_eq!(calls.lock().unwrap().len(), 1);
    thread::sleep(Duration::from_millis(200));
    assert_eq!(f.svc.runs.output("w1", "dev"), None);
}

#[test]
fn the_run_script_auto_runs_when_spotlight_testing_is_off() {
    let f = fixture(AUTO_RUN_DEV);
    let calls = spotlight_hook(&f, None);
    f.svc.start_setup(&f.ws).unwrap();
    wait_for("auto-run output", || {
        f.svc
            .runs
            .output("w1", "dev")
            .unwrap_or_default()
            .contains("dev")
    });
    assert_eq!(calls.lock().unwrap().len(), 1);
}

#[test]
fn spotlight_is_not_asked_without_a_run_script_or_with_auto_run_off() {
    // The reference requires a run script even when Spotlight would start.
    let no_run = fixture("[scripts]\nauto_run_after_setup = true\n");
    let calls = spotlight_hook(&no_run, Some(Ok(())));
    no_run.svc.start_setup(&no_run.ws).unwrap();
    assert!(calls.lock().unwrap().is_empty());

    let off = fixture("[scripts.run.dev]\ncommand = \"echo dev\"\n");
    let calls = spotlight_hook(&off, Some(Ok(())));
    off.svc.start_setup(&off.ws).unwrap();
    assert!(calls.lock().unwrap().is_empty());
}

#[test]
fn a_run_queued_during_setup_starts_instead_of_the_auto_run() {
    let f = fixture(
        r#"
[scripts]
setup = "sleep 0.4"
auto_run_after_setup = true
[scripts.run.dev]
command = "echo dev"
default = true
[scripts.run.lint]
command = "echo lint"
"#,
    );
    let calls = spotlight_hook(&f, None);
    assert!(f.svc.start_setup(&f.ws).unwrap());
    f.svc.start_run(&f.ws, Some("lint")).unwrap();
    assert_eq!(f.svc.runs.state("w1", "lint"), RunState::WaitingForSetup);
    wait_for("queued run output", || {
        f.svc
            .runs
            .output("w1", "lint")
            .unwrap_or_default()
            .contains("lint")
    });
    thread::sleep(Duration::from_millis(200));
    assert_eq!(
        f.svc.runs.output("w1", "dev"),
        None,
        "no auto-run on top of the queued run"
    );
    assert!(calls.lock().unwrap().is_empty());
}

/// A repository with a setup script and a default run script, and no
/// `auto_run_after_setup` of its own: the user toggle decides.
const SETUP_THEN_DEV: &str = r#"
[scripts]
setup = "echo setting up; sleep 0.2"
[scripts.run.dev]
command = "echo dev running"
default = true
"#;

fn run_output_seen(f: &Fixture) -> bool {
    f.svc
        .runs
        .output("w1", "dev")
        .unwrap_or_default()
        .contains("dev running")
}

#[test]
fn the_user_toggle_on_runs_the_run_script_after_setup_completes() {
    let f = fixture(SETUP_THEN_DEV);
    assert!(!f.svc.auto_run_after_setup().unwrap(), "off by default");
    assert!(f.svc.set_auto_run_after_setup(true).unwrap());

    assert!(f.svc.start_setup(&f.ws).unwrap());
    // Nothing runs while setup is still running.
    assert_eq!(f.svc.runs.output("w1", "dev"), None);
    wait_for("auto-run output", || run_output_seen(&f));
    assert_eq!(f.svc.setup.state("w1"), SetupState::Completed);

    // Setup finished before the run script printed anything.
    let events = f.events.lock().unwrap();
    let finished = events
        .iter()
        .position(
            |e| matches!(e, ScriptEvent::SetupFinished(o) if o.state == SetupState::Completed),
        )
        .expect("setup finished");
    let first_run = events
        .iter()
        .position(|e| matches!(e, ScriptEvent::Output { kind: "run", .. }))
        .expect("run output");
    assert!(
        finished < first_run,
        "setup then run: {finished} < {first_run}"
    );
}

#[test]
fn the_user_toggle_off_runs_nothing_after_setup() {
    for set_explicitly in [false, true] {
        let f = fixture(SETUP_THEN_DEV);
        if set_explicitly {
            f.svc.set_auto_run_after_setup(true).unwrap();
            assert!(!f.svc.set_auto_run_after_setup(false).unwrap());
        }
        assert!(f.svc.start_setup(&f.ws).unwrap());
        wait_for("setup completion", || {
            f.svc.setup.state("w1") == SetupState::Completed
        });
        thread::sleep(Duration::from_millis(300));
        assert_eq!(
            f.svc.runs.output("w1", "dev"),
            None,
            "explicit off: {set_explicitly}"
        );
        assert_eq!(f.svc.runs.state("w1", "dev"), RunState::Stopped);
    }
}

#[test]
fn a_failed_setup_does_not_start_the_run_script() {
    let f = fixture(
        r#"
[scripts]
setup = "echo broken; exit 3"
[scripts.run.dev]
command = "echo dev running"
default = true
"#,
    );
    f.svc.set_auto_run_after_setup(true).unwrap();
    assert!(f.svc.start_setup(&f.ws).unwrap());
    wait_for("setup failure", || {
        f.svc.setup.state("w1") == SetupState::Failed
    });
    thread::sleep(Duration::from_millis(300));
    assert_eq!(f.svc.runs.output("w1", "dev"), None);
    assert_eq!(f.svc.runs.state("w1", "dev"), RunState::Stopped);
}

#[test]
fn a_repository_that_turns_auto_run_off_overrides_the_user_toggle() {
    let f = fixture(
        &format!("{SETUP_THEN_DEV}\n")
            .replace("[scripts]\n", "[scripts]\nauto_run_after_setup = false\n"),
    );
    f.svc.set_auto_run_after_setup(true).unwrap();
    assert!(f.svc.start_setup(&f.ws).unwrap());
    wait_for("setup completion", || {
        f.svc.setup.state("w1") == SetupState::Completed
    });
    thread::sleep(Duration::from_millis(300));
    assert_eq!(f.svc.runs.output("w1", "dev"), None);
}

#[test]
fn scripts_get_the_settings_environment_without_overriding_conductor_vars() {
    let f = fixture(
        r#"
environment_variable_files = ["app.env"]
[environment_variables.local]
FROM_TABLE = "table"
CONDUCTOR_PORT = "1"
[scripts]
setup = "echo env=$FROM_FILE/$FROM_TABLE/$CONDUCTOR_PORT"
"#,
    );
    fs::write(
        f.ws.repo_root.join(".conductor/app.env"),
        "FROM_FILE=file\n",
    )
    .unwrap();
    assert!(f.svc.start_setup(&f.ws).unwrap());
    wait_for("setup output", || {
        f.events.lock().unwrap().iter().any(|e| {
            matches!(e, ScriptEvent::Output { kind: "setup", chunk, .. } if chunk.contains("env=file/table/55000"))
        })
    });
}

#[test]
fn the_app_can_supply_the_settings_environment() {
    let f = fixture("[scripts]\nsetup = \"echo hook=$HOOKED\"\n");
    f.svc.set_settings_env(Arc::new(|ws: &WorkspaceRef| {
        BTreeMap::from([("HOOKED".to_string(), ws.workspace_name.clone())])
    }));
    assert!(f.svc.start_setup(&f.ws).unwrap());
    wait_for("setup output", || {
        f.events.lock().unwrap().iter().any(|e| {
            matches!(e, ScriptEvent::Output { kind: "setup", chunk, .. } if chunk.contains("hook=tokyo"))
        })
    });
}
