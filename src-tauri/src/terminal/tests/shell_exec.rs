use super::tempdir;
use crate::terminal::shell_exec::{ShellRequest, ShellRunner, CANCEL_GRACE, OUTPUT_LIMIT};
use crate::terminal::TerminalError;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

fn req(command: &str) -> ShellRequest {
    ShellRequest {
        command: command.into(),
        ..Default::default()
    }
}

/// Start `command` as cancellable `id` on a thread; wait until it runs.
fn start(
    runner: &Arc<ShellRunner>,
    id: &'static str,
    command: &str,
) -> thread::JoinHandle<crate::terminal::Result<crate::terminal::shell_exec::ShellOutput>> {
    let (r, c) = (runner.clone(), req(command));
    let handle = thread::spawn(move || r.run_cancellable(id, &c));
    // Give the shell time to start and set its traps before a cancel.
    thread::sleep(Duration::from_millis(300));
    handle
}

#[test]
fn captures_stdout_stderr_and_exit_code() {
    let out = ShellRunner::default()
        .run(&req("echo out; echo err >&2; exit 3"))
        .unwrap();
    assert_eq!(
        (out.stdout.as_str(), out.stderr.as_str()),
        ("out\n", "err\n")
    );
    assert_eq!(
        (out.exit_code, out.signal, out.cancelled, out.truncated),
        (Some(3), None, false, false)
    );
}

#[test]
fn runs_in_cwd_with_extra_env() {
    let dir = tempdir("shell-cwd");
    let mut r = req("pwd -P; printf %s \"$OC_TEST\"");
    r.cwd = Some(dir.clone());
    r.env.insert("OC_TEST".into(), "hello".into());
    let out = ShellRunner::default().run(&r).unwrap();
    let real = std::fs::canonicalize(&dir).unwrap();
    assert_eq!(out.stdout, format!("{}\nhello", real.display()));
}

#[test]
fn refuses_a_missing_working_directory() {
    let mut r = req("true");
    r.cwd = Some(tempdir("shell-gone").join("missing"));
    assert!(matches!(
        ShellRunner::default().run(&r),
        Err(TerminalError::CwdMissing(_))
    ));
}

#[test]
fn cancel_stops_the_command_with_sigterm() {
    let runner = Arc::new(ShellRunner::default());
    let handle = start(&runner, "term", "sleep 30");
    let t = Instant::now();
    assert!(runner.cancel("term"));
    let out = handle.join().unwrap().unwrap();
    assert!(out.cancelled);
    assert_eq!(out.signal, Some(libc::SIGTERM));
    assert!(t.elapsed() < CANCEL_GRACE, "took {:?}", t.elapsed());
    assert!(
        !runner.cancel("term"),
        "a finished command is no longer cancellable"
    );
}

#[test]
fn cancel_escalates_to_sigkill_for_the_whole_group() {
    let runner = Arc::new(ShellRunner::default());
    // The shell and its child both ignore SIGTERM.
    let handle = start(
        &runner,
        "stubborn",
        "trap '' TERM; sh -c \"trap '' TERM; sleep 30\"",
    );
    let t = Instant::now();
    assert!(runner.cancel("stubborn"));
    let out = handle.join().unwrap().unwrap();
    assert!(out.cancelled);
    assert_eq!(out.signal, Some(libc::SIGKILL));
    assert!(
        t.elapsed() >= CANCEL_GRACE && t.elapsed() < Duration::from_secs(10),
        "took {:?}",
        t.elapsed()
    );
}

#[test]
fn ids_are_unique_while_running_and_unknown_ids_are_not_cancelled() {
    let runner = Arc::new(ShellRunner::default());
    let handle = start(&runner, "dup", "sleep 30");
    assert!(matches!(
        runner.run_cancellable("dup", &req("true")),
        Err(TerminalError::DuplicateId(_))
    ));
    assert!(!runner.cancel("nope"));
    assert!(
        runner.cancel("dup"),
        "the duplicate attempt must not unregister the running command"
    );
    assert!(handle.join().unwrap().unwrap().cancelled);
}

#[test]
fn a_background_job_holding_the_pipes_does_not_block_the_result() {
    let t = Instant::now();
    let out = ShellRunner::default()
        .run(&req("sleep 5 & echo hi"))
        .unwrap();
    assert_eq!((out.stdout.as_str(), out.exit_code), ("hi\n", Some(0)));
    assert!(
        t.elapsed() < Duration::from_secs(3),
        "took {:?}",
        t.elapsed()
    );
}

#[test]
fn output_past_the_limit_is_dropped_and_flagged() {
    let cmd = format!("head -c {} /dev/zero", OUTPUT_LIMIT + 1000);
    let out = ShellRunner::default().run(&req(&cmd)).unwrap();
    assert_eq!(
        (out.stdout.len(), out.truncated, out.exit_code),
        (OUTPUT_LIMIT, true, Some(0))
    );
}
