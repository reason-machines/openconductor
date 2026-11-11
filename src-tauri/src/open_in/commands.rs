//! IPC for the Open button: which apps to offer, and opening a folder in one.

use std::path::Path;
use std::process::Command;

use serde::Serialize;

use super::{available_apps, find, icon, IconType, Roots};

/// One menu row.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenInApp {
    pub id: &'static str,
    pub name: &'static str,
    pub icon_type: IconType,
    /// The app's own icon (`data:image/png;base64,...`); none draws the
    /// folder, code or terminal glyph for `icon_type`.
    pub icon: Option<String>,
}

pub fn list(roots: &Roots) -> Vec<OpenInApp> {
    available_apps(roots)
        .into_iter()
        .map(|a| OpenInApp {
            id: a.id,
            name: a.display_name,
            icon_type: a.icon_type,
            icon: roots.icon_bundle(a).and_then(|b| icon::data_url(&b)),
        })
        .collect()
}

/// JS: `invoke("open_in_apps")`: the apps this Mac has, in menu order.
#[tauri::command]
pub async fn open_in_apps() -> Result<Vec<OpenInApp>, String> {
    tauri::async_runtime::spawn_blocking(|| list(&Roots::current()))
        .await
        .map_err(|e| e.to_string())
}

/// Runs a program; a failure is its stderr, else stdout, else the exit code
/// (Conductor's `wBt`).
fn run(program: &str, args: &[String]) -> Result<(), String> {
    let mut command = Command::new(program);
    command.args(args);
    if program == "wezterm" {
        let path = std::env::var_os("PATH");
        let home = std::env::var_os("HOME");
        command.env(
            "PATH",
            super::wezterm_search_path(path.as_deref(), home.as_deref())?,
        );
    }
    let out = command.output().map_err(|e| format!("{program}: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let text = |b: &[u8]| String::from_utf8_lossy(b).trim().to_string();
    let (err, std_out) = (text(&out.stderr), text(&out.stdout));
    Err(if !err.is_empty() {
        err
    } else if !std_out.is_empty() {
        std_out
    } else {
        format!("exit code {}", out.status.code().unwrap_or(-1))
    })
}

fn alacritty_completion(out: std::process::Output) -> super::AlacrittyExit {
    if out.status.success() {
        return super::AlacrittyExit::Success;
    }
    let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    super::AlacrittyExit::Nonzero(if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("exit code {}", out.status.code().unwrap_or(-1))
    })
}

fn run_alacritty(program: &str, args: &[String]) -> Result<super::AlacrittyExit, String> {
    let mut command = Command::new(program);
    command.args(args);
    if program == "alacritty" {
        let path = std::env::var_os("PATH");
        let home = std::env::var_os("HOME");
        command.env(
            "PATH",
            super::alacritty_search_path(path.as_deref(), home.as_deref())?,
        );
    }
    command
        .output()
        .map(alacritty_completion)
        .map_err(|error| format!("{program}: {error}"))
}

fn run_kaleidoscope_folder(dir: &Path) -> Result<(), String> {
    let probe = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["diff", "--quiet", "HEAD"])
        .output()
        .map_err(|error| format!("git: {error}"))?;
    let mut path = std::env::var_os("PATH").unwrap_or_default();
    path.push(":/Applications/Kaleidoscope.app/Contents/MacOS:");
    path.push(std::env::var_os("HOME").unwrap_or_default());
    path.push("/Applications/Kaleidoscope.app/Contents/MacOS");
    if probe.status.code() == Some(1) {
        let difftool = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args([
                "-c",
                "difftool.ksdiff.cmd=ksdiff --partial-changeset --relative-path \"$MERGED\" -- \"$LOCAL\" \"$REMOTE\"",
                "difftool",
                "--tool=ksdiff",
                "--no-prompt",
                "HEAD",
            ])
            .env("PATH", &path)
            .output()
            .map_err(|error| format!("git: {error}"))?;
        if difftool.status.success() {
            return Ok(());
        }
    }
    let out = Command::new("open")
        .args(["-a", "Kaleidoscope"])
        .arg(dir)
        .env("PATH", &path)
        .output()
        .map_err(|error| format!("open: {error}"))?;
    if out.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    Err(if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("exit code {}", out.status.code().unwrap_or(-1))
    })
}

/// JS: `invoke("open_in_app", { appId, path })`: opens the workspace folder
/// `path` in the app, or one file in it (the All files tree).
#[tauri::command]
pub async fn open_in_app(app_id: String, path: String) -> Result<(), String> {
    let app = find(&app_id).ok_or_else(|| format!("Unknown app: {app_id}"))?;
    let target = Path::new(&path);
    if !target.is_absolute() || !(target.is_dir() || target.is_file()) {
        return Err(format!("Not a folder or file: {path}"));
    }
    let is_file = target.is_file();
    let dir = target.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        if cfg!(target_os = "macos") {
            if app.id == "alacritty" && !is_file {
                super::run_alacritty_folder(&dir, run_alacritty)
            } else if app.id == "kaleidoscope" && !is_file {
                run_kaleidoscope_folder(&dir)
            } else {
                super::run_macos_open(app, &dir, is_file, run)
            }
        } else if app.id == "finder" {
            // Conductor's Linux branch hands the folder to the desktop's file manager.
            let folder = match dir.parent() {
                Some(parent) if is_file => parent,
                _ => dir.as_path(),
            };
            run("xdg-open", &[folder.to_string_lossy().into_owned()])
        } else {
            Err(format!(
                "Opening in {} is only supported on macOS",
                app.display_name
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(all(test, unix))]
mod alacritty_completion_tests {
    use super::alacritty_completion;
    use crate::open_in::AlacrittyExit;
    use std::os::unix::process::ExitStatusExt;
    use std::process::{ExitStatus, Output};

    #[test]
    fn completed_nonzero_preserves_stderr_then_stdout_then_exit_code() {
        for (stderr, stdout, expected) in [
            ("failure\n", "output", "failure\n"),
            ("", "output\n", "output\n"),
            ("", "", "exit code 7"),
        ] {
            let output = Output {
                status: ExitStatus::from_raw(7 << 8),
                stderr: stderr.as_bytes().to_vec(),
                stdout: stdout.as_bytes().to_vec(),
            };
            assert_eq!(
                alacritty_completion(output),
                AlacrittyExit::Nonzero(expected.to_string()),
            );
        }
    }

    #[test]
    fn successful_completion_ignores_diagnostic_output() {
        assert_eq!(
            alacritty_completion(Output {
                status: ExitStatus::from_raw(0),
                stderr: b"warning".to_vec(),
                stdout: b"output".to_vec(),
            }),
            AlacrittyExit::Success,
        );
    }
}
