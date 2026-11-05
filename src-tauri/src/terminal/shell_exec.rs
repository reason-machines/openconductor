//! One-shot shell commands: `execute_shell_command`,
//! `execute_shell_command_cancellable` and `cancel_shell_command`.
//!
//! The reference runs these on a blocking task (its handler symbols are
//! `tokio` `BlockingTask` closures); argument and result shapes were not
//! recovered, so [`ShellRequest`] and [`ShellOutput`] are ours. A command
//! runs as `/bin/sh -c <command>` in its own process group with stdin
//! closed; cancelling sends SIGTERM to the group, then SIGKILL after
//! [`CANCEL_GRACE`].

use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::spawn::{check_cwd, Result, TerminalError};

/// Kept per stream; later output is drained and dropped.
pub const OUTPUT_LIMIT: usize = 8 * 1024 * 1024;
/// Time between SIGTERM and SIGKILL when a command is cancelled.
pub const CANCEL_GRACE: Duration = Duration::from_millis(2000);
/// How long to keep reading after the shell exits, for output still in the
/// pipes. A background job holding them open is not waited for.
const DRAIN_GRACE: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellRequest {
    pub command: String,
    #[serde(default)]
    pub cwd: Option<PathBuf>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellOutput {
    pub stdout: String,
    pub stderr: String,
    /// None when a signal ended the shell.
    pub exit_code: Option<i32>,
    pub signal: Option<i32>,
    pub cancelled: bool,
    /// Some output went past [`OUTPUT_LIMIT`] and was dropped.
    pub truncated: bool,
}

struct Running {
    pgid: i32,
    cancelled: Arc<AtomicBool>,
}

/// Commands that can still be cancelled, by caller-chosen id.
#[derive(Default)]
pub struct ShellRunner {
    running: Arc<Mutex<HashMap<String, Running>>>,
}

impl ShellRunner {
    pub fn run(&self, req: &ShellRequest) -> Result<ShellOutput> {
        execute(req, |_| Ok(()), &AtomicBool::new(false))
    }

    /// Like [`run`](Self::run), but [`cancel`](Self::cancel) with `id` stops it.
    pub fn run_cancellable(&self, id: &str, req: &ShellRequest) -> Result<ShellOutput> {
        let cancelled = Arc::new(AtomicBool::new(false));
        let out = execute(
            req,
            |pgid| {
                let mut map = self.running.lock().unwrap();
                if map.contains_key(id) {
                    return Err(TerminalError::DuplicateId(id.to_owned()));
                }
                map.insert(
                    id.to_owned(),
                    Running {
                        pgid,
                        cancelled: cancelled.clone(),
                    },
                );
                Ok(())
            },
            &cancelled,
        );
        if !matches!(out, Err(TerminalError::DuplicateId(_))) {
            self.running.lock().unwrap().remove(id);
        }
        out
    }

    /// Send every running command SIGTERM (the app is quitting).
    pub fn cancel_all(&self) {
        let ids: Vec<String> = self.running.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.cancel(&id);
        }
    }

    /// Stop command `id`; false when no such command is running.
    pub fn cancel(&self, id: &str) -> bool {
        let Some(pgid) = self.running.lock().unwrap().get(id).map(|r| {
            r.cancelled.store(true, Ordering::SeqCst);
            r.pgid
        }) else {
            return false;
        };
        signal_group(pgid, Signal::Term);
        let running = self.running.clone();
        let id = id.to_owned();
        let _ = thread::Builder::new()
            .name("shell-cancel".into())
            .spawn(move || {
                thread::sleep(CANCEL_GRACE);
                // Only if the same command is still running (ids may be reused).
                if running
                    .lock()
                    .unwrap()
                    .get(&id)
                    .is_some_and(|r| r.pgid == pgid)
                {
                    signal_group(pgid, Signal::Kill);
                }
            });
        true
    }
}

fn execute(
    req: &ShellRequest,
    register: impl FnOnce(i32) -> Result<()>,
    cancelled: &AtomicBool,
) -> Result<ShellOutput> {
    if let Some(cwd) = &req.cwd {
        check_cwd(cwd)?;
    }
    let mut cmd = Command::new("/bin/sh");
    cmd.arg("-c").arg(&req.command).envs(&req.env);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = &req.cwd {
        cmd.current_dir(cwd);
    }
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut cmd, 0);
    let mut child = cmd
        .spawn()
        .map_err(|e| TerminalError::Spawn(e.to_string()))?;
    if let Err(e) = register(child.id() as i32) {
        signal_group(child.id() as i32, Signal::Kill);
        let _ = child.wait();
        return Err(e);
    }
    let stdout = collect(child.stdout.take());
    let stderr = collect(child.stderr.take());
    let status = child.wait()?;
    let (stdout, out_cut) = stdout.finish();
    let (stderr, err_cut) = stderr.finish();
    #[cfg(unix)]
    let signal = std::os::unix::process::ExitStatusExt::signal(&status);
    #[cfg(not(unix))]
    let signal = None;
    Ok(ShellOutput {
        stdout,
        stderr,
        exit_code: status.code(),
        signal,
        cancelled: cancelled.load(Ordering::SeqCst),
        truncated: out_cut || err_cut,
    })
}

struct Collector {
    buf: Arc<Mutex<(Vec<u8>, bool)>>,
    done: mpsc::Receiver<()>,
}

impl Collector {
    fn finish(self) -> (String, bool) {
        let _ = self.done.recv_timeout(DRAIN_GRACE);
        let guard = self.buf.lock().unwrap();
        (String::from_utf8_lossy(&guard.0).into_owned(), guard.1)
    }
}

fn collect(stream: Option<impl Read + Send + 'static>) -> Collector {
    let buf = Arc::new(Mutex::new((Vec::new(), false)));
    let (tx, done) = mpsc::channel();
    if let Some(mut stream) = stream {
        let buf = buf.clone();
        let _ = thread::Builder::new()
            .name("shell-output".into())
            .spawn(move || {
                let mut chunk = [0u8; 16 * 1024];
                while let Ok(n @ 1..) = stream.read(&mut chunk) {
                    let mut b = buf.lock().unwrap();
                    let room = OUTPUT_LIMIT - b.0.len();
                    b.0.extend_from_slice(&chunk[..n.min(room)]);
                    b.1 |= n > room;
                }
                let _ = tx.send(());
            });
    }
    Collector { buf, done }
}

enum Signal {
    Term,
    Kill,
}

#[cfg(unix)]
fn signal_group(pgid: i32, sig: Signal) {
    let sig = match sig {
        Signal::Term => libc::SIGTERM,
        Signal::Kill => libc::SIGKILL,
    };
    unsafe {
        libc::killpg(pgid as libc::pid_t, sig);
    }
}

#[cfg(not(unix))]
fn signal_group(_pgid: i32, _sig: Signal) {}
