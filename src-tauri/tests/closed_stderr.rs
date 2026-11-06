//! The app must start when its stderr is a closed pipe.
//!
//! An agent that launches the app in the background with stderr on its own
//! command pipe closes that pipe when the command returns. Every later write
//! then fails with EPIPE (Rust ignores SIGPIPE), and `std::eprintln!` panics
//! on a failed write. The setup hook's first log line
//! (`[bundled-bin] installed ...`) panicked inside `applicationDidFinishLaunching`
//! and macOS aborted the app before its window opened.
//!
//! This is an integration test so the library is built as it ships (not
//! `cfg(test)`). It reruns its own binary as a child whose stderr is a pipe
//! with no reader, and the child runs the real startup step.

use std::path::PathBuf;
use std::process::{Command, Stdio};

const CHILD_ENV: &str = "OC_CLOSED_STDERR_CHILD";
const TEST_NAME: &str = "startup_logging_survives_a_closed_stderr";

#[test]
fn startup_logging_survives_a_closed_stderr() {
    if let Some(dir) = std::env::var_os(CHILD_ENV) {
        let dir = PathBuf::from(dir);
        // A fresh data dir: the exe link is new, so this logs a line.
        openconductor_lib::bundled_bin::install_at_startup(
            &dir.join("resources"),
            &dir.join("data"),
        );
        return;
    }

    let dir = std::env::temp_dir().join(format!("oc-closed-stderr-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let (reader, writer) = std::io::pipe().unwrap();
    drop(reader);
    let status = Command::new(std::env::current_exe().unwrap())
        .args([TEST_NAME, "--exact", "--nocapture", "--test-threads=1"])
        .env(CHILD_ENV, &dir)
        .stdout(Stdio::null())
        .stderr(writer)
        .status()
        .unwrap();
    std::fs::remove_dir_all(&dir).unwrap();
    assert!(
        status.success(),
        "startup logging killed the process when stderr was closed: {status}"
    );
}
