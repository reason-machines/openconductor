//! Backend of the per-agent options on Settings › Agents (Conductor 0.87.6
//! `renderApp-D_fmY7hW.js`: `mGt` executable-path row, `Nzi` config-file
//! card, `gpa` ACP agent status line; evidence/settings/agent-options.md).
//!
//! * [`agent_system_binary`] - the agent CLI found on the system, for the
//!   executable-path row's placeholder and "Use system <agent>" button
//!   (Conductor runs `which <binary>` in the user's shell).
//! * [`agent_config_file`] / [`open_agent_config`] - `~/.claude/settings.json`
//!   and `~/.codex/config.toml`, opened in the default app, falling back to
//!   their folder when the file does not exist yet (Conductor's
//!   `directoryFallbackPath`).
//! * [`acp_agent_status`] - whether OpenCode runs, its version, and whether
//!   it is older than Conductor's `minimumVersion` 1.16.2.

use std::ffi::OsStr;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::agent::AgentKind;
use crate::settings::service::SettingsService;

/// The agents with options on Settings › Agents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OptionAgent {
    Claude,
    Codex,
    Opencode,
}

impl OptionAgent {
    pub fn binary(self) -> &'static str {
        match self {
            OptionAgent::Claude => "claude",
            OptionAgent::Codex => "codex",
            OptionAgent::Opencode => "opencode",
        }
    }

    fn kind(self) -> AgentKind {
        match self {
            OptionAgent::Claude => AgentKind::Claude,
            OptionAgent::Codex => AgentKind::Codex,
            OptionAgent::Opencode => AgentKind::Opencode,
        }
    }

    /// Folders the agent's own installer uses, under the home folder.
    fn home_dirs(self) -> &'static [&'static str] {
        match self {
            OptionAgent::Claude => &[".local/bin", ".claude/local"],
            OptionAgent::Codex => &[".local/bin"],
            OptionAgent::Opencode => &[".opencode/bin", ".local/bin"],
        }
    }
}

fn is_executable(p: &Path) -> bool {
    p.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

/// The first executable `agent` binary on `path_var`, then in its
/// installer's folders under `home`, then Homebrew and `/usr/local/bin`.
/// An app opened from Finder has a bare `PATH`, hence the extra folders.
/// Relative `PATH` entries are skipped.
pub fn find_system_binary(
    agent: OptionAgent,
    path_var: Option<&OsStr>,
    home: Option<&Path>,
) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = path_var
        .map(|p| std::env::split_paths(p).collect())
        .unwrap_or_default();
    if let Some(home) = home {
        dirs.extend(agent.home_dirs().iter().map(|d| home.join(d)));
    }
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    dirs.into_iter()
        .filter(|d| d.is_absolute())
        .map(|d| d.join(agent.binary()))
        .find(|p| is_executable(p))
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn system_binary(agent: OptionAgent) -> Option<PathBuf> {
    find_system_binary(
        agent,
        std::env::var_os("PATH").as_deref(),
        home().as_deref(),
    )
}

/// JS: `invoke("agent_system_binary", { agent })`: the absolute path of the
/// agent CLI on this system, or null.
#[tauri::command]
pub fn agent_system_binary(agent: OptionAgent) -> Option<String> {
    system_binary(agent).map(|p| p.display().to_string())
}

/// A config file shown as a card under the agent's options.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFile {
    pub file_path: String,
    pub directory_path: String,
}

/// `~/.claude/settings.json` or `~/.codex/config.toml` under `home`
/// (Conductor's `kpa` / `Tpa`); OpenCode has no card.
pub fn config_file(agent: OptionAgent, home: &Path) -> Option<ConfigFile> {
    let (dir, file) = match agent {
        OptionAgent::Claude => (".claude", "settings.json"),
        OptionAgent::Codex => (".codex", "config.toml"),
        OptionAgent::Opencode => return None,
    };
    let dir = home.join(dir);
    Some(ConfigFile {
        file_path: dir.join(file).display().to_string(),
        directory_path: dir.display().to_string(),
    })
}

/// JS: `invoke("agent_config_file", { agent })`.
#[tauri::command]
pub fn agent_config_file(agent: OptionAgent) -> Option<ConfigFile> {
    config_file(agent, &home()?)
}

/// What "Open in" opens: the file when it exists, else its folder when that
/// exists, else nothing.
pub fn open_target(file: &ConfigFile) -> Option<PathBuf> {
    [&file.file_path, &file.directory_path]
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

/// JS: `invoke("open_agent_config", { agent })`: opens the agent's config
/// file (or its folder) in the default app.
#[tauri::command]
pub fn open_agent_config(app: AppHandle, agent: OptionAgent) -> Result<(), String> {
    let file = agent_config_file(agent).ok_or("This agent has no config file.")?;
    let target =
        open_target(&file).ok_or_else(|| format!("{} does not exist yet.", file.directory_path))?;
    app.opener()
        .open_path(target.display().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Conductor's OpenCode `minimumVersion`: older versions "can return empty
/// ACP turns".
pub const OPENCODE_MINIMUM_VERSION: (u64, u64, u64) = (1, 16, 2);

/// Install state of an ACP agent, the fields Conductor's status line reads
/// (`isInstalled`, `version`, `isOutdated`, `error`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpAgentStatus {
    pub is_installed: bool,
    pub version: Option<String>,
    pub is_outdated: bool,
    pub error: Option<String>,
    /// The executable that was checked, for "Open in Finder".
    pub executable: Option<String>,
}

/// The first `major.minor.patch` in `text` (`opencode --version` prints
/// `2.0.5`, other tools prefix a name).
pub fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    text.split(|c: char| !(c.is_ascii_digit() || c == '.'))
        .filter_map(|tok| {
            let mut parts = tok.split('.').map(|p| p.parse::<u64>().ok());
            let v = (parts.next()??, parts.next()??, parts.next()??);
            Some(v)
        })
        .next()
}

/// Status from a `--version` run: `Ok(stdout)` or `Err(reason)`.
pub fn status_from_run(executable: Option<&Path>, run: Result<String, String>) -> AcpAgentStatus {
    let executable = executable.map(|p| p.display().to_string());
    match run {
        Ok(out) => {
            let parsed = parse_version(&out);
            AcpAgentStatus {
                is_installed: true,
                version: parsed.map(|(a, b, c)| format!("{a}.{b}.{c}")),
                is_outdated: parsed.is_some_and(|v| v < OPENCODE_MINIMUM_VERSION),
                error: None,
                executable,
            }
        }
        Err(reason) => AcpAgentStatus {
            is_installed: executable.is_some(),
            version: None,
            is_outdated: false,
            error: executable.as_ref().map(|_| reason),
            executable,
        },
    }
}

/// `<exe> --version`, killed after `timeout`.
fn run_version(exe: &Path, timeout: Duration) -> Result<String, String> {
    let mut child = Command::new(exe)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(_) => break,
            None if start.elapsed() > timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("`--version` did not finish".into());
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// JS: `invoke("acp_agent_status", { agent: "opencode" })`. Checks the
/// executable OpenConductor would launch: `opencode_executable_path` when
/// set, else the system binary.
#[tauri::command]
pub async fn acp_agent_status(
    settings: State<'_, SettingsService>,
    agent: OptionAgent,
) -> Result<AcpAgentStatus, String> {
    if agent != OptionAgent::Opencode {
        return Err("Only OpenCode is an ACP agent.".into());
    }
    let configured = settings
        .get()
        .ok()
        .map(|s| s.executable(agent.kind()))
        .filter(|p| p.is_absolute());
    let exe = configured.or_else(|| system_binary(agent));
    tauri::async_runtime::spawn_blocking(move || {
        let run = match &exe {
            Some(p) => run_version(p, Duration::from_secs(10)),
            None => Err("not found".into()),
        };
        status_from_run(exe.as_deref(), run)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A fresh folder under the system temp dir, removed on drop.
    struct Tmp(PathBuf);
    impl Tmp {
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn tempdir() -> Tmp {
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let p = std::env::temp_dir().join(format!(
            "oc-agent-options-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        Tmp(p)
    }

    fn exe(dir: &Path, name: &str) -> PathBuf {
        fs::create_dir_all(dir).unwrap();
        let p = dir.join(name);
        crate::test_exe::write_executable(&p, "#!/bin/sh\necho 2.0.5\n", 0o755);
        p
    }

    #[test]
    fn finds_the_binary_on_path_then_in_installer_folders() {
        let tmp = tempdir();
        let on_path = exe(&tmp.path().join("bin"), "codex");
        let path_var = std::env::join_paths([tmp.path().join("bin")]).unwrap();
        assert_eq!(
            find_system_binary(OptionAgent::Codex, Some(&path_var), None),
            Some(on_path)
        );
        let home = tmp.path().join("home");
        let installed = exe(&home.join(".opencode/bin"), "opencode");
        assert_eq!(
            find_system_binary(
                OptionAgent::Opencode,
                Some(OsStr::new("relative")),
                Some(&home)
            ),
            Some(installed)
        );
        // A non-executable file does not count.
        fs::create_dir_all(home.join(".local/bin")).unwrap();
        fs::write(home.join(".local/bin/claude"), "").unwrap();
        let found = find_system_binary(OptionAgent::Claude, None, Some(&home));
        assert_ne!(found, Some(home.join(".local/bin/claude")));
    }

    #[test]
    fn config_files_are_conductors_paths() {
        let home = Path::new("/Users/ada");
        assert_eq!(
            config_file(OptionAgent::Claude, home),
            Some(ConfigFile {
                file_path: "/Users/ada/.claude/settings.json".into(),
                directory_path: "/Users/ada/.claude".into(),
            })
        );
        assert_eq!(
            config_file(OptionAgent::Codex, home).unwrap().file_path,
            "/Users/ada/.codex/config.toml"
        );
        assert_eq!(config_file(OptionAgent::Opencode, home), None);
    }

    #[test]
    fn open_target_falls_back_to_the_folder() {
        let tmp = tempdir();
        let file = config_file(OptionAgent::Codex, tmp.path()).unwrap();
        assert_eq!(open_target(&file), None);
        fs::create_dir_all(&file.directory_path).unwrap();
        assert_eq!(
            open_target(&file),
            Some(PathBuf::from(&file.directory_path))
        );
        fs::write(&file.file_path, "").unwrap();
        assert_eq!(open_target(&file), Some(PathBuf::from(&file.file_path)));
    }

    #[test]
    fn versions_parse_and_compare_with_the_minimum() {
        assert_eq!(parse_version("2.0.5\n"), Some((2, 0, 5)));
        assert_eq!(parse_version("opencode v1.16.10"), Some((1, 16, 10)));
        assert_eq!(parse_version("no version"), None);
        let ok = status_from_run(Some(Path::new("/x/opencode")), Ok("1.16.2".into()));
        assert!(ok.is_installed && !ok.is_outdated);
        assert_eq!(ok.version.as_deref(), Some("1.16.2"));
        let old = status_from_run(Some(Path::new("/x/opencode")), Ok("1.9.0".into()));
        assert!(old.is_outdated);
        let missing = status_from_run(None, Err("not found".into()));
        assert!(!missing.is_installed && missing.error.is_none());
        let broken = status_from_run(Some(Path::new("/x/opencode")), Err("boom".into()));
        assert!(broken.is_installed && broken.error.as_deref() == Some("boom"));
    }

    #[test]
    fn a_real_version_run_reads_stdout() {
        let tmp = tempdir();
        let p = exe(tmp.path(), "opencode");
        assert_eq!(
            run_version(&p, Duration::from_secs(5)).unwrap().trim(),
            "2.0.5"
        );
    }

    #[test]
    fn agents_parse_from_ipc_names() {
        let a: OptionAgent = serde_json::from_str(r#""opencode""#).unwrap();
        assert_eq!(a, OptionAgent::Opencode);
        assert!(serde_json::from_str::<OptionAgent>(r#""cursor""#).is_err());
    }
}
