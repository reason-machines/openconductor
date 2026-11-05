//! Conductor's internal-script runner and the worktree-creation messages built
//! on it (REA, decoded `index-BGEQ8YjU.js`; see
//! `evidence/create-workspace/README.md`, "Initialization log").
//!
//! Every internal script is written to `$TMPDIR/conductor-script-<ms>-<rand>.sh`
//! and run as `"<shell>" "<script>" < /dev/null > "$TMPDIR/conductor-<ms>-<rand>.log" 2>&1`,
//! so the log holds everything the script printed. The script file is removed
//! afterwards. When the wrapper itself exits non-zero with output of its own,
//! that output is appended to the log under "--- Additional Output ---".
//! Worktree creation runs `git worktree add` this way, and the log path becomes
//! `workspaces.initialization_log_path`.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// What [`run_internal_script`] returns (Conductor's `{exitCode, stdout,
/// stderr, error, logFilePath}`). `stdout`/`stderr` are the wrapper's own
/// output; the script's output is in the log file.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ScriptRun {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    /// Set when the script could not be written or started.
    pub error: Option<String>,
    /// `None` only when the script never ran.
    pub log_file_path: Option<PathBuf>,
}

/// Shown when `git worktree add` failed but the worktree exists anyway (a
/// failing post-checkout hook); Conductor's wording.
pub const WORKTREE_PARTIAL_FAILURE: &str =
    "Something failed while creating your workspace. Check the logs to see what went wrong.";

/// The shell Conductor runs internal scripts with locally: the user's login
/// shell (`$SHELL`), else `/bin/zsh`, else `/bin/sh`.
pub fn default_shell() -> PathBuf {
    std::env::var_os("SHELL")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute() && p.is_file())
        .or_else(|| Some(PathBuf::from("/bin/zsh")).filter(|p| p.is_file()))
        .unwrap_or_else(|| PathBuf::from("/bin/sh"))
}

/// Conductor's `Zfe`: run `script` in `working_directory` with `set -e`,
/// logging all output to a new file in `tmp_dir`. `env` is added to the
/// script's environment.
pub fn run_internal_script(
    script: &str,
    working_directory: &Path,
    shell: &Path,
    tmp_dir: &Path,
    env: &[(&str, &str)],
) -> ScriptRun {
    let content = format!("set -e\ncd {}\n{script}\n", shell_quote(&working_directory.to_string_lossy()));
    run_logged(&content, shell, tmp_dir, env)
}

/// Conductor's `Jfe`: write `content` to a script file, run it with `shell`
/// with stdin closed and stdout+stderr in the log, then remove the script.
pub fn run_logged(content: &str, shell: &Path, tmp_dir: &Path, env: &[(&str, &str)]) -> ScriptRun {
    let (ms, rand) = (now_ms(), rand36());
    let script = tmp_dir.join(format!("conductor-script-{ms}-{rand}.sh"));
    let log = tmp_dir.join(format!("conductor-{ms}-{rand}.log"));
    if let Err(e) = std::fs::create_dir_all(tmp_dir).and_then(|_| std::fs::write(&script, content)) {
        return ScriptRun {
            exit_code: 1,
            stderr: e.to_string(),
            error: Some(format!("Failed to write script: {e}")),
            ..ScriptRun::default()
        };
    }
    let command = format!(
        "{} {} < /dev/null > {} 2>&1",
        shell_quote(&shell.to_string_lossy()),
        shell_quote(&script.to_string_lossy()),
        shell_quote(&log.to_string_lossy()),
    );
    let mut cmd = Command::new("/bin/sh");
    cmd.arg("-c").arg(&command);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd.output();
    let _ = std::fs::remove_file(&script);
    let out = match out {
        Ok(o) => o,
        Err(e) => {
            return ScriptRun {
                exit_code: 1,
                stderr: e.to_string(),
                error: Some(format!("Failed to execute script: {e}")),
                ..ScriptRun::default()
            }
        }
    };
    // A signal has no exit code; Conductor's shell reports 128 + signal.
    let exit_code = out.status.code().unwrap_or(1);
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
    if exit_code != 0 && (!stdout.is_empty() || !stderr.is_empty()) {
        append(&log, &additional_output(exit_code, &stdout, &stderr));
    }
    ScriptRun { exit_code, stdout, stderr, error: None, log_file_path: Some(log) }
}

/// The block appended to a failed script's log when the wrapper printed
/// something itself.
pub fn additional_output(exit_code: i32, stdout: &str, stderr: &str) -> String {
    format!("\n\n--- Additional Output ---\nExit code: {exit_code}\n\nStdout:\n{stdout}\n\nStderr:\n{stderr}")
}

fn append(log: &Path, text: &str) {
    use std::io::Write;
    // `echo "<text>" >> log` in Conductor, so a newline follows.
    let r = std::fs::OpenOptions::new().create(true).append(true).open(log).and_then(|mut f| writeln!(f, "{text}"));
    if let Err(e) = r {
        eprintln!("init log: could not append to {}: {e}", log.display());
    }
}

/// Conductor's `pre`: the first non-empty of the wrapper's stderr, its stdout,
/// the runner error, then the log file's contents; else `exit code <n>`.
pub fn failure_output(run: &ScriptRun) -> String {
    if !run.stderr.is_empty() {
        return run.stderr.clone();
    }
    if !run.stdout.is_empty() {
        return run.stdout.clone();
    }
    if let Some(e) = run.error.as_deref().filter(|e| !e.is_empty()) {
        return e.to_string();
    }
    if let Some(text) = run.log_file_path.as_deref().and_then(|p| std::fs::read_to_string(p).ok()) {
        let text = text.trim_end();
        if !text.is_empty() {
            return text.to_string();
        }
    }
    format!("exit code {}", run.exit_code)
}

/// Conductor's `hre`: the error for a `git worktree add` that left no
/// worktree. Git refusing `a/b` because branch `a` exists gets its own text.
pub fn worktree_failure_message(output: &str) -> String {
    if let Some((wanted, existing)) = output.split('\n').find_map(cannot_lock_ref) {
        if wanted.starts_with(&format!("{existing}/")) {
            return format!(
                "Git won't let us create branch \"{wanted}\" because \"{existing}\" already exists. \
                 Rename or delete \"{existing}\", or change your git prefix in settings."
            );
        }
    }
    format!("Failed to create worktree: {output}")
}

/// `fatal: cannot lock ref 'refs/heads/<a>': 'refs/heads/<b>' exists; cannot create 'refs/heads/<a>'`
/// as a whole line -> `(a, b)`.
fn cannot_lock_ref(line: &str) -> Option<(&str, &str)> {
    let line = line.strip_suffix('\r').unwrap_or(line);
    let rest = line.strip_prefix("fatal: cannot lock ref 'refs/heads/")?;
    let (wanted, rest) = rest.split_once("': 'refs/heads/")?;
    let (existing, rest) = rest.split_once("' exists; cannot create 'refs/heads/")?;
    let again = rest.strip_suffix('\'')?;
    let plain = |s: &str| !s.is_empty() && !s.contains('\'');
    (plain(wanted) && plain(existing) && again == wanted).then_some((wanted, existing))
}

/// Conductor's `Lj`: join two optional messages with a space.
pub fn join_messages(a: Option<String>, b: Option<String>) -> Option<String> {
    match (a, b) {
        (Some(a), Some(b)) => Some(format!("{a} {b}")),
        (a, None) => a,
        (None, b) => b,
    }
}

/// Single-quote `s` for a POSIX shell (Conductor's `ao`).
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

/// Six base-36 characters, like Conductor's `Math.random().toString(36).substring(7)`.
fn rand36() -> String {
    let mut h = RandomState::new().build_hasher();
    h.write_u128(now_ms());
    h.write_u32(std::process::id());
    let mut n = h.finish();
    (0..6)
        .map(|_| {
            let d = (n % 36) as u32;
            n /= 36;
            std::char::from_digit(d, 36).unwrap_or('0')
        })
        .collect()
}
