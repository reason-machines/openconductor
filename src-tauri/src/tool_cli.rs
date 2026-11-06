//! `openconductor --tool <name> [args...]`: the native code behind the shell
//! tools the bundle ships in `Contents/Resources/bin/`.
//!
//! Conductor 0.87.6 ships `bin/checkpointer.sh` and `bin/git-busy-check.sh`
//! as bash scripts (`evidence/scripts/MANIFEST.md`), and its frontend and
//! agents run them from `$APPDATA/bin` (`evidence/packaging/bundled-bin.json`).
//! OpenConductor implements both natively (`checkpoint/`), so its
//! `resources/bin-tools/*.sh` are shims that exec this binary in tool mode.
//! `bin/spotlighter.sh` runs [`crate::tool_spotlighter`] the same way.
//! The command line, output and exit codes are the reference scripts', so a
//! caller written for Conductor's tools works unchanged.

use std::ffi::OsString;
use std::io::Write;
use std::path::Path;
use std::process::Command;

use crate::checkpoint::{self, CheckpointError, DiffSide, SaveOptions};

/// First argument that switches the app binary into tool mode.
pub const FLAG: &str = "--tool";

/// Run a tool when `args` (a full argv) is `<exe> --tool <name> ...`, and
/// return its exit code; `None` means start the app normally.
pub fn dispatch(args: impl IntoIterator<Item = OsString>) -> Option<i32> {
    let mut it = args.into_iter().skip(1);
    if it.next()? != FLAG {
        return None;
    }
    let rest: Vec<String> = it.map(|a| a.to_string_lossy().into_owned()).collect();
    let cwd = std::env::current_dir().unwrap_or_else(|_| ".".into());
    // Long-running and writes stdout from its watch thread, so it must not
    // run under the stdout lock taken below.
    if rest.first().map(String::as_str) == Some("spotlighter") {
        return Some(crate::tool_spotlighter::main(&cwd));
    }
    let (mut out, mut err) = (std::io::stdout().lock(), std::io::stderr().lock());
    let code = run(&rest, &cwd, &mut out, &mut err);
    let _ = out.flush();
    Some(code)
}

/// Run tool `args[0]` with the rest of `args`, in `cwd`.
pub fn run(args: &[String], cwd: &Path, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    match args.first().map(String::as_str) {
        Some("checkpointer") => checkpointer(&args[1..], cwd, out, err),
        Some("git-busy-check") => git_busy_check(args.get(1).map(String::as_str), cwd, out),
        other => {
            let _ = writeln!(err, "openconductor: unknown tool: {}", other.unwrap_or(""));
            2
        }
    }
}

const CHECKPOINTER_USAGE: &str = "checkpointer: save/restore/diff Git checkpoints using private refs

Usage:
  checkpointer save [--id <id>] [--force]
  checkpointer restore <id>
  checkpointer diff <id1> <id2|current> [-- <extra git diff args>]

Notes:
- save never touches files on disk or HEAD; it writes Git objects and refs/conductor-checkpoints/<id>.
- restore moves HEAD to the saved commit and makes the working tree and index match the
  snapshot, rewriting only files that differ (re-restoring a matching tree touches nothing).
- restore from checkpoints saved with unborn HEAD (no commits) is unsupported and will fail.
- diff compares the full working-tree snapshots (including untracked, honoring .gitignore).
";

fn checkpointer(args: &[String], cwd: &Path, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let fail = |err: &mut dyn Write, msg: &str| {
        let _ = writeln!(err, "checkpointer: {msg}");
        1
    };
    match args.first().map(String::as_str) {
        Some("save") => {
            let mut opts = SaveOptions::default();
            let mut rest = args[1..].iter();
            while let Some(arg) = rest.next() {
                match arg.as_str() {
                    "-i" | "--id" => opts.id = rest.next().cloned(),
                    "-f" | "--force" => opts.force = true,
                    "-h" | "--help" => {
                        let _ = writeln!(out, "Usage: checkpointer save [--id <id>] [--force]");
                        return 0;
                    }
                    other => return fail(err, &format!("unknown argument to save: {other}")),
                }
            }
            match checkpoint::save(cwd, &opts) {
                Ok(id) => {
                    let _ = writeln!(out, "{id}");
                    0
                }
                Err(e) => report(e, err),
            }
        }
        Some("restore") => {
            let Some(id) = args.get(1).filter(|id| !id.is_empty()) else {
                return fail(err, "Usage: checkpointer restore <id>");
            };
            match checkpoint::restore(cwd, id) {
                Ok(()) => {
                    let _ = writeln!(out, "restored checkpoint: {id}");
                    0
                }
                Err(e) => report(e, err),
            }
        }
        Some("diff") => {
            if args.len() < 3 {
                let _ = writeln!(
                    err,
                    "Usage: checkpointer diff <id1> <id2|current> [-- <extra git diff args>]"
                );
                return 1;
            }
            let (a, b) = (args[1].as_str(), args[2].as_str());
            let right = if b == "current" {
                DiffSide::Current
            } else {
                DiffSide::Checkpoint(b)
            };
            let (root, a_obj, b_obj) = match checkpoint::diff_objects(cwd, a, right) {
                Ok(v) => v,
                Err(CheckpointError::NotFound(id)) if id == a => {
                    return fail(err, &format!("unknown checkpoint: {a}"))
                }
                Err(CheckpointError::NotFound(_)) => {
                    return fail(
                        err,
                        &format!("unknown checkpoint or 'current' expected: {b}"),
                    )
                }
                Err(e) => return report(e, err),
            };
            let mut extra = &args[3..];
            if extra.first().map(String::as_str) == Some("--") {
                extra = &extra[1..];
            }
            let output = Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(["-c", "core.quotePath=false", "diff", &a_obj, &b_obj])
                .args(extra)
                .output();
            match output {
                Ok(o) => {
                    let _ = out.write_all(&o.stdout);
                    let _ = err.write_all(&o.stderr);
                    o.status.code().unwrap_or(1)
                }
                Err(e) => fail(err, &format!("cannot run git: {e}")),
            }
        }
        None | Some("-h" | "--help" | "help") => {
            let _ = write!(out, "{CHECKPOINTER_USAGE}");
            0
        }
        Some(other) => fail(err, &format!("unknown command: {other} (use --help)")),
    }
}

/// Reference exit codes: 101/102 are silent skips, 103 a refusal, else 1.
fn report(e: CheckpointError, err: &mut dyn Write) -> i32 {
    if !e.is_skip() {
        let msg = match &e {
            CheckpointError::NotARepository(_) => "not inside a git working tree".to_string(),
            other => other.to_string(),
        };
        let _ = writeln!(err, "checkpointer: {msg}");
    }
    e.reference_exit_code()
}

/// Reference `git-busy-check.sh <workspace-path>`: prints `clean` or
/// `busy:<kind>` and exits 0; prints an error and exits 2 for a bad path or
/// a directory outside any git repository.
fn git_busy_check(path: Option<&str>, cwd: &Path, out: &mut dyn Write) -> i32 {
    let dir = match path {
        Some(p) if !p.is_empty() => cwd.join(p),
        _ => cwd.to_path_buf(),
    };
    if !dir.is_dir() {
        let _ = writeln!(out, "error: bad path");
        return 2;
    }
    let inside = Command::new("git")
        .arg("-C")
        .arg(&dir)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .is_ok_and(|o| o.status.success() && o.stdout.starts_with(b"true"));
    if !inside {
        let _ = writeln!(out, "error: not a git repo");
        return 2;
    }
    match checkpoint::busy_state(&dir) {
        Ok(state) => {
            let _ = writeln!(out, "{}", state.as_str());
            0
        }
        Err(_) => {
            let _ = writeln!(out, "error: not a git repo");
            2
        }
    }
}

#[cfg(test)]
#[path = "tool_cli_tests.rs"]
mod tests;
