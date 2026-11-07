//! One browser-pairing attempt shared by every sign-in surface.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use super::account::{parse_login, parse_status, Account, LoginPrompt};
use super::cli::LaunchConfig;

pub const LOGIN_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BrowserPrompt {
    pub url: String,
    pub code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LoginState {
    Idle,
    Starting {
        attempt_id: String,
    },
    Waiting {
        attempt_id: String,
        prompt: BrowserPrompt,
    },
    Connected {
        account: Account,
    },
    Cancelled,
    TimedOut,
    Failed {
        message: String,
    },
}

#[derive(Clone)]
pub struct LoginOptions {
    pub startup_timeout: Duration,
    pub status_timeout: Duration,
    pub timeout: Duration,
    pub poll_interval: Duration,
    /// Only the isolated test harness can opt in. Production accepts Reason HTTPS links.
    pub allow_loopback: bool,
}

impl Default for LoginOptions {
    fn default() -> Self {
        Self {
            startup_timeout: LOGIN_TIMEOUT,
            status_timeout: Duration::from_secs(20),
            timeout: Duration::from_secs(10 * 60),
            poll_interval: Duration::from_secs(1),
            allow_loopback: false,
        }
    }
}

struct Attempt {
    id: String,
    cancelled: Arc<AtomicBool>,
}

struct Inner {
    next: u64,
    state: LoginState,
    attempt: Option<Attempt>,
}

pub struct LoginService {
    inner: Arc<Mutex<Inner>>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    options: LoginOptions,
}

impl Default for LoginService {
    fn default() -> Self {
        Self::with_options(LoginOptions::default())
    }
}

impl LoginService {
    pub fn with_options(options: LoginOptions) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                next: 0,
                state: LoginState::Idle,
                attempt: None,
            })),
            worker: Mutex::new(None),
            options,
        }
    }

    pub fn snapshot(&self) -> LoginState {
        self.inner.lock().unwrap().state.clone()
    }

    pub fn refresh(&self, launch: &LaunchConfig, dir: &Path) -> Result<LoginState, String> {
        let (generation, previous) = {
            let inner = self.inner.lock().unwrap();
            if !matches!(inner.state, LoginState::Idle | LoginState::Connected { .. }) {
                return Ok(inner.state.clone());
            }
            (inner.next, inner.state.clone())
        };
        let account = account(
            launch,
            dir,
            &AtomicBool::new(false),
            self.options.status_timeout,
        );
        let mut inner = self.inner.lock().unwrap();
        if inner.next != generation || inner.state != previous {
            return Ok(inner.state.clone());
        }
        let Some(account) = account else {
            return Err("Couldn't check Reason sign-in. Try refreshing.".into());
        };
        inner.state = if account.signed_in() {
            LoginState::Connected { account }
        } else if account.error.is_some() {
            failed("Your Reason sign-in couldn't be verified. Try again.")
        } else {
            LoginState::Idle
        };
        Ok(inner.state.clone())
    }

    pub fn start(&self, launch: LaunchConfig, dir: PathBuf) -> LoginState {
        let mut worker = self.worker.lock().unwrap();
        let inner = self.inner.lock().unwrap();
        if inner.attempt.is_some() {
            return inner.state.clone();
        }
        drop(inner);
        if let Some(previous) = worker.take() {
            let _ = previous.join();
        }
        let mut inner = self.inner.lock().unwrap();
        inner.next += 1;
        let id = inner.next.to_string();
        let cancelled = Arc::new(AtomicBool::new(false));
        inner.state = LoginState::Starting {
            attempt_id: id.clone(),
        };
        inner.attempt = Some(Attempt {
            id: id.clone(),
            cancelled: cancelled.clone(),
        });
        let state = inner.state.clone();
        let shared = self.inner.clone();
        let options = self.options.clone();
        *worker = Some(thread::spawn(move || {
            let result = pairing(&launch, &dir, &cancelled, &options, |prompt| {
                let mut inner = shared.lock().unwrap();
                if owns(&inner, &id) {
                    inner.state = LoginState::Waiting {
                        attempt_id: id.clone(),
                        prompt,
                    };
                }
            });
            let mut inner = shared.lock().unwrap();
            if owns(&inner, &id) {
                inner.state = result;
                inner.attempt = None;
            }
        }));
        state
    }

    pub fn cancel(&self, attempt_id: &str) -> LoginState {
        let mut inner = self.inner.lock().unwrap();
        if owns(&inner, attempt_id) {
            if let Some(attempt) = inner.attempt.take() {
                attempt.cancelled.store(true, Ordering::SeqCst);
            }
            inner.state = LoginState::Cancelled;
        }
        inner.state.clone()
    }

    pub fn reset(&self) {
        let mut worker = self.worker.lock().unwrap();
        {
            let mut inner = self.inner.lock().unwrap();
            if let Some(attempt) = inner.attempt.take() {
                attempt.cancelled.store(true, Ordering::SeqCst);
            }
            inner.next += 1;
            inner.state = LoginState::Idle;
        }
        if let Some(worker) = worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for LoginService {
    fn drop(&mut self) {
        self.reset();
    }
}

fn owns(inner: &Inner, id: &str) -> bool {
    inner
        .attempt
        .as_ref()
        .is_some_and(|attempt| attempt.id == id)
}

fn failed(message: &str) -> LoginState {
    LoginState::Failed {
        message: message.into(),
    }
}

fn account(
    launch: &LaunchConfig,
    dir: &Path,
    cancelled: &AtomicBool,
    timeout: Duration,
) -> Option<Account> {
    let out = run(launch, dir, &["status", "--json"], cancelled, timeout).ok()?;
    parse_status(&String::from_utf8_lossy(&out.stdout))
}

fn pairing(
    launch: &LaunchConfig,
    dir: &Path,
    cancelled: &AtomicBool,
    options: &LoginOptions,
    waiting: impl FnOnce(BrowserPrompt),
) -> LoginState {
    let deadline = Instant::now() + options.timeout;
    let Some(initial) = account(launch, dir, cancelled, options.status_timeout) else {
        return if cancelled.load(Ordering::SeqCst) {
            LoginState::Cancelled
        } else {
            failed("Couldn't read your Reason account. Check your connection and try again.")
        };
    };
    if initial.signed_in() {
        return LoginState::Connected { account: initial };
    }
    let prompt = match login_prompt(launch, dir, cancelled, options.startup_timeout) {
        Ok(prompt) => prompt,
        Err(RunError::Cancelled) => return LoginState::Cancelled,
        Err(RunError::TimedOut) => return failed("Couldn't start sign-in before the connection timed out. Try again."),
        Err(RunError::Failed) => return failed("Couldn't start sign-in. Check your connection and the Reason executable in Settings, then try again."),
    };
    let Some(url) = prompt.url else {
        return match account(launch, dir, cancelled, options.status_timeout) {
            Some(account) if account.signed_in() => LoginState::Connected { account },
            _ => failed("Reason didn't return a sign-in link. Try again."),
        };
    };
    if !pairing_url(&url, options.allow_loopback) {
        return failed(
            "Reason returned an unsupported sign-in link. Check the Reason executable in Settings.",
        );
    }
    waiting(BrowserPrompt {
        url,
        code: prompt.code,
    });
    while Instant::now() < deadline {
        if cancelled.load(Ordering::SeqCst) {
            return LoginState::Cancelled;
        }
        match account(
            launch,
            dir,
            cancelled,
            options
                .status_timeout
                .min(deadline.saturating_duration_since(Instant::now())),
        ) {
            Some(account) if account.signed_in() => return LoginState::Connected { account },
            Some(account) if account.error.is_some() => {
                return failed(
                    "Reason couldn't finish signing in. Check your connection and try again.",
                )
            }
            _ => {}
        }
        let until = Instant::now() + options.poll_interval;
        while Instant::now() < until && Instant::now() < deadline {
            if cancelled.load(Ordering::SeqCst) {
                return LoginState::Cancelled;
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
    LoginState::TimedOut
}

fn pairing_url(url: &str, allow_loopback: bool) -> bool {
    if url.starts_with("https://reasonmachines.com/cli/connect?")
        || url.starts_with("https://staging.reasonmachines.com/cli/connect?")
    {
        return !url.chars().any(char::is_whitespace);
    }
    if !allow_loopback {
        return false;
    }
    ["http://127.0.0.1:", "http://localhost:"]
        .iter()
        .any(|prefix| {
            url.strip_prefix(prefix).is_some_and(|rest| {
                rest.split_once('/').is_some_and(|(port, path)| {
                    !port.is_empty()
                        && port.chars().all(|c| c.is_ascii_digit())
                        && path.starts_with("cli/connect?")
                        && !url.chars().any(char::is_whitespace)
                })
            })
        })
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum RunError {
    Cancelled,
    TimedOut,
    Failed,
}

pub(super) fn login_prompt(
    launch: &LaunchConfig,
    dir: &Path,
    cancelled: &AtomicBool,
    timeout: Duration,
) -> Result<LoginPrompt, RunError> {
    let out = run(launch, dir, &["login"], cancelled, timeout)?;
    if !out.status.success() {
        return Err(RunError::Failed);
    }
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    Ok(parse_login(&text))
}

fn run(
    launch: &LaunchConfig,
    dir: &Path,
    args: &[&str],
    cancelled: &AtomicBool,
    timeout: Duration,
) -> Result<Output, RunError> {
    if cancelled.load(Ordering::SeqCst) {
        return Err(RunError::Cancelled);
    }
    let mut command = launch.base_command(dir);
    command
        .args(launch.workspace_args())
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|_| RunError::Failed)?;
    let stdout = child.stdout.take().ok_or(RunError::Failed)?;
    let stderr = child.stderr.take().ok_or(RunError::Failed)?;
    let read = |mut pipe: Box<dyn Read + Send>| {
        thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            bytes
        })
    };
    let out = read(Box::new(stdout));
    let err = read(Box::new(stderr));
    let deadline = Instant::now() + timeout;
    loop {
        if cancelled.load(Ordering::SeqCst) || Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(if cancelled.load(Ordering::SeqCst) {
                RunError::Cancelled
            } else {
                RunError::TimedOut
            });
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                return Ok(Output {
                    status,
                    stdout: out.join().unwrap_or_default(),
                    stderr: err.join().unwrap_or_default(),
                })
            }
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(RunError::Failed);
            }
        }
    }
}
