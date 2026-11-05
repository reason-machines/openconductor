//! `openconductor --tool spotlighter`: the native code behind the bundle's
//! `bin/spotlighter.sh`.
//!
//! Conductor 0.87.6 ships `bin/spotlighter.sh` (`evidence/scripts/bin/`), a
//! bash script run in a workspace with `CONDUCTOR_ROOT_PATH` set to the
//! repository root. It logs to `/tmp/conductor-spotlight-<pid>.log` as well
//! as stdout, then runs `watchexec` on the workspace; each run saves the
//! workspace as checkpoint `cp-spotlight-<epoch>-<pid>` and restores it in
//! the root. The app saves and restores the root's own state around it.
//!
//! This tool runs that loop with [`crate::spotlight::watch`], which does
//! what the script's `watchexec` options do (sync at start, one sync at a
//! time, `.gitignore`, `*.tmp.*` and `.context/**` ignored), and prints the
//! script's lines. It stops on SIGINT, SIGTERM or SIGHUP, after a sync in
//! progress finishes, and exits 0.
//!
//! Differences from the script: `CONDUCTOR_INT_CHECKPOINTER_PATH` and
//! `CONDUCTOR_INT_WATCHEXEC_PATH` are not needed (the checkpointer and the
//! watcher are built in) and are ignored when set, and the triggering paths
//! (`WATCHEXEC_*_PATH`) are not printed.

use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::spotlight::watch::{watch, SyncEvent};
use crate::spotlight::{session_checkpoint_id, SyncOutcome};

/// Environment variable naming the repository root to sync into.
pub const ROOT_ENV: &str = "CONDUCTOR_ROOT_PATH";

/// Run the tool for the current process: stdout, `/tmp`, and the process
/// signals. `cwd` is the workspace.
pub fn main(cwd: &Path) -> i32 {
    // Block the stop signals before any thread starts, so every thread
    // inherits the mask and only `wait_for_stop_signal` receives them.
    let signals = StopSignals::block();
    let code = run(
        std::env::var_os(ROOT_ENV),
        cwd,
        Path::new("/tmp"),
        std::process::id(),
        Box::new(io::stdout()),
        || signals.wait(),
    );
    let _ = io::stdout().flush();
    code
}

/// The tool, with its inputs passed in. Returns once `wait_for_stop` returns
/// (exit 0), or at once with exit 1 when it cannot start.
pub fn run(
    root: Option<OsString>,
    workspace: &Path,
    log_dir: &Path,
    pid: u32,
    mut stdout: Box<dyn Write + Send>,
    wait_for_stop: impl FnOnce(),
) -> i32 {
    let log_path = log_dir.join(format!("conductor-spotlight-{pid}.log"));
    // Printed before the script sends its output to the log as well.
    let _ = writeln!(stdout, "Spotlight logging to: {}", log_path.display());
    let log = OpenOptions::new().create(true).append(true).open(&log_path);
    let out = Tee::new(stdout, log.ok());

    let root = match root.filter(|r| !r.is_empty()) {
        Some(r) => PathBuf::from(r),
        None => {
            out.line(&format!(
                "spotlighter.sh: {ROOT_ENV}: Environment variable {ROOT_ENV} must be set"
            ));
            return 1;
        }
    };
    if !root.is_dir() {
        out.line(&format!(
            "Error: {ROOT_ENV} does not exist or is not a directory: {}",
            root.display()
        ));
        return 1;
    }

    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let id = session_checkpoint_id(epoch, pid);
    let (loop_out, loop_root, loop_id) = (out.clone(), root.clone(), id.clone());
    let watcher = watch(workspace, &root, &id, move |event| {
        for line in event_lines(&event, &loop_id, &loop_root) {
            loop_out.line(&line);
        }
    });
    let watcher = match watcher {
        Ok(w) => w,
        Err(e) => {
            out.line(&format!("Error: cannot watch {}: {e}", workspace.display()));
            return 1;
        }
    };
    wait_for_stop();
    // Dropping the watcher waits for a sync in progress.
    drop(watcher);
    0
}

/// The script's output for one step of the loop.
pub fn event_lines(event: &SyncEvent, id: &str, root: &Path) -> Vec<String> {
    let root = root.display();
    let detail = |m: &str| -> Vec<String> {
        m.lines()
            .filter(|l| !l.trim().is_empty())
            .map(str::to_owned)
            .collect()
    };
    match event {
        SyncEvent::Syncing => vec![String::new(), "Starting sync...".into()],
        SyncEvent::Finished(SyncOutcome::Synced) => vec![
            format!("Saved checkpoint: {id}"),
            format!("Restored checkpoint {id} in {root}"),
        ],
        SyncEvent::Finished(SyncOutcome::SkippedBusy) => {
            vec!["Skipping sync: merge/rebase in progress".into()]
        }
        SyncEvent::Finished(SyncOutcome::SkippedSaveFailed(m)) => {
            let mut lines = detail(m);
            lines.push("Skipping sync: checkpoint save failed".into());
            lines
        }
        SyncEvent::Finished(SyncOutcome::RestoreFailed(m)) => {
            let mut lines = vec![format!("Saved checkpoint: {id}")];
            lines.extend(detail(m));
            lines.push(format!("Warning: checkpoint restore failed in {root}"));
            lines
        }
    }
}

/// Stdout and, when it opened, the log file.
type Sinks = (Box<dyn Write + Send>, Option<File>);

/// Writes each line to every sink.
#[derive(Clone)]
struct Tee(Arc<Mutex<Sinks>>);

impl Tee {
    fn new(stdout: Box<dyn Write + Send>, log: Option<File>) -> Self {
        Tee(Arc::new(Mutex::new((stdout, log))))
    }

    fn line(&self, line: &str) {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let (stdout, log) = &mut *guard;
        let _ = writeln!(stdout, "{line}");
        let _ = stdout.flush();
        if let Some(log) = log {
            let _ = writeln!(log, "{line}");
        }
    }
}

/// SIGINT, SIGTERM and SIGHUP, blocked so they can be waited for.
struct StopSignals {
    #[cfg(unix)]
    set: libc::sigset_t,
}

impl StopSignals {
    #[cfg(unix)]
    fn block() -> Self {
        // SAFETY: the set is initialised by sigemptyset before use, and the
        // calls only change this thread's signal mask.
        unsafe {
            let mut set: libc::sigset_t = std::mem::zeroed();
            libc::sigemptyset(&mut set);
            for sig in [libc::SIGINT, libc::SIGTERM, libc::SIGHUP] {
                libc::sigaddset(&mut set, sig);
            }
            libc::pthread_sigmask(libc::SIG_BLOCK, &set, std::ptr::null_mut());
            StopSignals { set }
        }
    }

    #[cfg(unix)]
    fn wait(&self) {
        let mut sig = 0;
        // SAFETY: `set` was initialised in `block`; sigwait writes `sig`.
        unsafe {
            libc::sigwait(&self.set, &mut sig);
        }
    }

    #[cfg(not(unix))]
    fn block() -> Self {
        StopSignals {}
    }

    #[cfg(not(unix))]
    fn wait(&self) {
        loop {
            std::thread::park();
        }
    }
}

#[cfg(test)]
#[path = "tool_spotlighter_tests.rs"]
mod tests;
