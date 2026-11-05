//! Launching one script process.
//!
//! As in the reference app (`evidence/run-scripts/NOTES.md`, "Execution"),
//! the script body is written to
//! `<home>/.conductor/projects/<workspace path, / as -->/<kind>-<id>.sh` and run
//! as `/bin/zsh <file>` on macOS or `/bin/bash <file>` on Linux, from the
//! workspace (or the run script's cwd). The environment is the captured
//! login-shell environment, then terminal variables, then the `CONDUCTOR_*`
//! overlay.
//!
//! Differences on purpose: output is a pipe with stdout and stderr merged,
//! not a PTY, until the terminal module offers PTY sessions; and the process
//! is the leader of its own process group, so stopping it stops everything
//! the script started (bundled skill: keep run-script processes in one group).

use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Read};
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::env::ScriptKind;

/// Transcript bytes kept per process; older output is dropped first.
pub const TRANSCRIPT_LIMIT: usize = 5 * 1024 * 1024;

/// How long to wait for output after the process exits.
const READER_DRAIN: Duration = Duration::from_secs(2);

/// The shell scripts run in.
pub fn script_shell() -> &'static str {
    if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "/bin/bash"
    }
}

/// Where the script file for `workspace` lives under `conductor_dir`
/// (normally `~/.conductor`).
pub fn script_path(conductor_dir: &Path, workspace: &Path, kind: ScriptKind, id: &str) -> PathBuf {
    let slug = workspace
        .to_string_lossy()
        .split('/')
        .collect::<Vec<_>>()
        .join("--");
    let kind = match kind {
        ScriptKind::Setup => "setup",
        ScriptKind::Run => "run",
        ScriptKind::Archive => "archive",
    };
    conductor_dir
        .join("projects")
        .join(slug)
        .join(format!("{kind}-{id}.sh"))
}

/// Everything needed to start a script.
#[derive(Debug, Clone)]
pub struct LaunchSpec {
    pub script: String,
    pub script_path: PathBuf,
    pub cwd: PathBuf,
    /// Captured login-shell environment; empty means inherit ours.
    pub base_env: BTreeMap<String, String>,
    /// `CONDUCTOR_*` and shared variables, applied last.
    pub overlay: BTreeMap<String, String>,
    pub lang: Option<String>,
}

impl LaunchSpec {
    /// The full environment the process starts with.
    pub fn environment(&self) -> BTreeMap<String, String> {
        let mut env = if self.base_env.is_empty() {
            std::env::vars().collect()
        } else {
            self.base_env.clone()
        };
        let shell = script_shell();
        env.insert("TERM".into(), "xterm-256color".into());
        env.insert("COLORTERM".into(), "truecolor".into());
        env.insert("SHELL".into(), shell.into());
        env.insert("PWD".into(), self.cwd.to_string_lossy().into_owned());
        if let Some(lang) = &self.lang {
            env.insert("LANG".into(), lang.clone());
        }
        if shell.ends_with("zsh") {
            env.insert("DISABLE_AUTO_UPDATE".into(), "true".into());
        }
        env.extend(self.overlay.clone());
        env
    }
}

/// Output shared between the reader thread and observers.
#[derive(Debug, Clone, Default)]
pub struct Transcript(Arc<Mutex<Vec<u8>>>);

impl Transcript {
    fn push(&self, bytes: &[u8]) {
        let mut buf = self.0.lock().unwrap_or_else(|e| e.into_inner());
        buf.extend_from_slice(bytes);
        if buf.len() > TRANSCRIPT_LIMIT {
            let excess = buf.len() - TRANSCRIPT_LIMIT;
            buf.drain(..excess);
        }
    }

    pub fn bytes(&self) -> Vec<u8> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.bytes()).into_owned()
    }
}

/// Called with each chunk of output as it arrives.
pub type OutputSink = Arc<dyn Fn(&[u8]) + Send + Sync>;

/// How a process ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Exit {
    pub code: Option<i32>,
    pub signal: Option<i32>,
}

impl Exit {
    pub fn success(&self) -> bool {
        self.code == Some(0)
    }
}

/// A started script, leader of its own process group.
#[derive(Debug)]
pub struct Process {
    child: Child,
    reader: Option<JoinHandle<()>>,
    script_path: PathBuf,
    pub transcript: Transcript,
}

/// Write the script file and start it.
pub fn spawn(spec: &LaunchSpec, sink: Option<OutputSink>) -> io::Result<Process> {
    if let Some(dir) = spec.script_path.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(&spec.script_path, &spec.script)?;
    let (mut reader, writer) = io::pipe()?;
    let spawned = Command::new(script_shell())
        .arg(&spec.script_path)
        .current_dir(&spec.cwd)
        .env_clear()
        .envs(spec.environment())
        .stdin(Stdio::null())
        .stdout(writer.try_clone()?)
        .stderr(writer)
        .process_group(0)
        .spawn();
    let child = match spawned {
        Ok(c) => c,
        Err(e) => {
            let _ = fs::remove_file(&spec.script_path);
            return Err(e);
        }
    };
    let transcript = Transcript::default();
    let t = transcript.clone();
    let reader_thread = thread::spawn(move || {
        let mut buf = [0u8; 8192];
        while let Ok(n @ 1..) = reader.read(&mut buf) {
            t.push(&buf[..n]);
            if let Some(sink) = &sink {
                sink(&buf[..n]);
            }
        }
    });
    Ok(Process {
        child,
        reader: Some(reader_thread),
        script_path: spec.script_path.clone(),
        transcript,
    })
}

impl Process {
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// The exit, if the process has ended.
    pub fn try_wait(&mut self) -> io::Result<Option<Exit>> {
        match self.child.try_wait()? {
            Some(status) => Ok(Some(self.finish(status))),
            None => Ok(None),
        }
    }

    /// Wait for the process and the end of its output.
    pub fn wait(&mut self) -> io::Result<Exit> {
        let status = self.child.wait()?;
        Ok(self.finish(status))
    }

    /// SIGTERM the process group; SIGKILL it if the leader is still alive
    /// after `grace`. Returns the exit.
    pub fn stop(&mut self, grace: Duration) -> io::Result<Exit> {
        if let Some(exit) = self.try_wait()? {
            return Ok(exit);
        }
        self.signal_group(libc::SIGTERM);
        let deadline = Instant::now() + grace;
        while Instant::now() < deadline {
            if let Some(exit) = self.try_wait()? {
                self.signal_group(libc::SIGKILL); // leftovers of the group
                return Ok(exit);
            }
            thread::sleep(Duration::from_millis(20));
        }
        self.signal_group(libc::SIGKILL);
        self.wait()
    }

    fn signal_group(&self, signal: i32) {
        let pgid = self.child.id() as i32;
        if pgid > 1 {
            // SAFETY: kill(2) with a negative pid signals that process group,
            // which this child leads (process_group(0)).
            unsafe {
                libc::kill(-pgid, signal);
            }
        }
    }

    fn finish(&mut self, status: std::process::ExitStatus) -> Exit {
        // A background child of the script can keep the pipe open; give the
        // reader a moment to drain, then leave it to finish on its own.
        if let Some(reader) = self.reader.take() {
            let deadline = Instant::now() + READER_DRAIN;
            while !reader.is_finished() && Instant::now() < deadline {
                thread::sleep(Duration::from_millis(10));
            }
            if reader.is_finished() {
                let _ = reader.join();
            }
        }
        let _ = fs::remove_file(&self.script_path);
        Exit {
            code: status.code(),
            signal: status.signal(),
        }
    }
}

#[cfg(test)]
mod tests;
