//! What a terminal is started with, what it reports, and how it can fail.
//!
//! [`build_command`] turns a [`SpawnRequest`] into a `portable-pty` command
//! after checking the working directory and size; nothing is started here.

use std::fmt;
use std::path::{Path, PathBuf};

use portable_pty::CommandBuilder;

use super::flow::FlowLimits;
use super::scrollback;

/// Events a terminal emits, in order: one `Ready`, any number of `Data`,
/// one `Exit`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PtyEvent {
    Ready {
        id: String,
        pid: Option<u32>,
    },
    Data {
        id: String,
        data: Vec<u8>,
    },
    Exit {
        id: String,
        exit_code: u32,
        /// Signal name when the process was killed by a signal.
        signal: Option<String>,
    },
}

impl PtyEvent {
    pub fn id(&self) -> &str {
        match self {
            PtyEvent::Ready { id, .. } | PtyEvent::Data { id, .. } | PtyEvent::Exit { id, .. } => {
                id
            }
        }
    }
}

/// Receives terminal events (the Tauri layer emits them to the webview).
/// Called from reader/waiter threads; must not block for long.
pub trait EventSink: Send + Sync + 'static {
    fn emit(&self, event: PtyEvent);
}

impl<F> EventSink for F
where
    F: Fn(PtyEvent) + Send + Sync + 'static,
{
    fn emit(&self, event: PtyEvent) {
        self(event)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Program {
    /// The user's login shell (`$SHELL`, falling back to the passwd entry).
    LoginShell,
    /// An explicit argv; `argv[0]` is looked up on `PATH`.
    Argv(Vec<String>),
}

#[derive(Debug, Clone)]
pub struct SpawnRequest {
    /// Caller-chosen id (for example the tab id). Generated when `None`.
    pub id: Option<String>,
    pub cwd: PathBuf,
    pub program: Program,
    /// Extra environment, applied after the defaults.
    pub env: Vec<(String, String)>,
    pub cols: u16,
    pub rows: u16,
    /// Typed into the terminal right after spawn, followed by Enter
    /// (the "command to auto-run when creating a new terminal tab").
    pub initial_command: Option<String>,
    pub scrollback_limit: usize,
    pub flow: FlowLimits,
}

impl SpawnRequest {
    pub fn shell(cwd: impl Into<PathBuf>) -> Self {
        Self {
            id: None,
            cwd: cwd.into(),
            program: Program::LoginShell,
            env: Vec::new(),
            cols: 80,
            rows: 24,
            initial_command: None,
            scrollback_limit: scrollback::DEFAULT_LIMIT,
            flow: FlowLimits::default(),
        }
    }

    pub fn argv<I, S>(cwd: impl Into<PathBuf>, argv: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            program: Program::Argv(argv.into_iter().map(Into::into).collect()),
            ..Self::shell(cwd)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExitInfo {
    pub exit_code: u32,
    pub signal: Option<String>,
}

#[derive(Debug)]
pub enum TerminalError {
    CwdMissing(PathBuf),
    CwdNotDirectory(PathBuf),
    InvalidSize { cols: u16, rows: u16 },
    EmptyArgv,
    DuplicateId(String),
    NotFound(String),
    NotRunning(String),
    MirrorNotFound(String),
    Spawn(String),
    Io(std::io::Error),
}

impl fmt::Display for TerminalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CwdMissing(p) => write!(f, "working directory does not exist: {}", p.display()),
            Self::CwdNotDirectory(p) => {
                write!(f, "working directory is not a directory: {}", p.display())
            }
            Self::InvalidSize { cols, rows } => write!(f, "invalid terminal size {cols}x{rows}"),
            Self::EmptyArgv => write!(f, "no program to run"),
            Self::DuplicateId(id) => write!(f, "terminal {id} already exists"),
            Self::NotFound(id) => write!(f, "no terminal {id}"),
            Self::NotRunning(id) => write!(f, "terminal {id} has exited"),
            // The reference's wording.
            Self::MirrorNotFound(id) => write!(f, "PTY mirror not found: {id}"),
            Self::Spawn(e) => write!(f, "failed to start terminal: {e}"),
            Self::Io(e) => write!(f, "terminal I/O error: {e}"),
        }
    }
}

impl std::error::Error for TerminalError {}

impl From<std::io::Error> for TerminalError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

pub type Result<T> = std::result::Result<T, TerminalError>;

pub(crate) fn check_size(cols: u16, rows: u16) -> Result<()> {
    if cols == 0 || rows == 0 {
        return Err(TerminalError::InvalidSize { cols, rows });
    }
    Ok(())
}

pub(crate) fn check_cwd(cwd: &Path) -> Result<()> {
    match std::fs::metadata(cwd) {
        Ok(m) if m.is_dir() => Ok(()),
        Ok(_) => Err(TerminalError::CwdNotDirectory(cwd.to_owned())),
        Err(_) => Err(TerminalError::CwdMissing(cwd.to_owned())),
    }
}

/// Validate `req` and build the command it describes.
pub fn build_command(req: &SpawnRequest) -> Result<CommandBuilder> {
    check_cwd(&req.cwd)?;
    check_size(req.cols, req.rows)?;
    let mut cmd = match &req.program {
        Program::LoginShell => CommandBuilder::new_default_prog(),
        Program::Argv(argv) => {
            let (prog, args) = argv.split_first().ok_or(TerminalError::EmptyArgv)?;
            let mut c = CommandBuilder::new(prog);
            c.args(args);
            c
        }
    };
    cmd.cwd(&req.cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    for (k, v) in &req.env {
        cmd.env(k, v);
    }
    Ok(cmd)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    fn tempdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oc-spawn-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn refuses_bad_working_directory_size_and_argv() {
        let dir = tempdir("bad");
        let file = dir.join("file");
        std::fs::write(&file, "x").unwrap();
        let err = |req: SpawnRequest| build_command(&req).err().unwrap();
        assert!(matches!(
            err(SpawnRequest::shell(dir.join("missing"))),
            TerminalError::CwdMissing(_)
        ));
        assert!(matches!(
            err(SpawnRequest::shell(&file)),
            TerminalError::CwdNotDirectory(_)
        ));
        assert!(matches!(
            err(SpawnRequest::argv(&dir, Vec::<String>::new())),
            TerminalError::EmptyArgv
        ));
        let mut zero = SpawnRequest::shell(&dir);
        zero.rows = 0;
        assert!(matches!(
            err(zero),
            TerminalError::InvalidSize { cols: 80, rows: 0 }
        ));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn argv_cwd_and_environment() {
        let dir = tempdir("ok");
        let mut req = SpawnRequest::argv(&dir, ["printf", "%s", "x"]);
        req.env.push(("TERM".into(), "dumb".into()));
        req.env.push(("OC_TEST".into(), "1".into()));
        let cmd = build_command(&req).unwrap();
        assert_eq!(cmd.get_argv(), &["printf", "%s", "x"]);
        assert_eq!(cmd.get_cwd().map(|p| p.as_os_str()), Some(dir.as_os_str()));
        // Request env overrides the defaults.
        assert_eq!(cmd.get_env("TERM"), Some(OsStr::new("dumb")));
        assert_eq!(cmd.get_env("COLORTERM"), Some(OsStr::new("truecolor")));
        assert_eq!(cmd.get_env("OC_TEST"), Some(OsStr::new("1")));
        let shell = build_command(&SpawnRequest::shell(&dir)).unwrap();
        assert!(shell.is_default_prog());
        assert_eq!(shell.get_env("TERM"), Some(OsStr::new("xterm-256color")));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
