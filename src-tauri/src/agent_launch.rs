//! The executable a Claude Code or Codex chat runs, picked as Conductor 0.87.6
//! picks it (evidence/persistence/agent-binaries/README.md):
//!
//! 1. the Settings › Agents executable path when it is not blank;
//! 2. else the bundled copy in `agent-binaries/`, downloaded on first use
//!    (Conductor holds the chat's message while the binary is not `ready`);
//! 3. else, only when that download is unavailable, the CLI on the login
//!    shell's `PATH` (plus the installers' folders, see `find_*_cli`).
//!
//! [`launch`] blocks on the download; [`current`] does not, for status rows
//! and slash-command queries.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::agent::codex_cli::find_codex_cli;
use crate::agent_binaries::{Agent, AgentBinaryStatus, BinaryManager};
use crate::claude_chat::find_claude_cli;
use crate::settings::service::SettingsService;

/// Where a resolved executable comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    /// The Settings › Agents executable path.
    Custom,
    /// `agent-binaries/<agent>/<version>/<exe>`.
    Bundled,
    /// Found on the login shell's `PATH`.
    System,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub path: PathBuf,
    pub source: Source,
}

/// The agent's name in Conductor's copy (`BAo` in its renderApp).
pub fn display_name(agent: Agent) -> &'static str {
    match agent {
        Agent::Claude => "Claude Code",
        Agent::Codex => "Codex",
    }
}

/// The precedence above. `bundled` may block on a download; `system` is
/// asked only when `bundled` fails.
pub fn resolve(
    agent: Agent,
    custom: Option<&str>,
    bundled: impl FnOnce() -> Result<PathBuf, String>,
    system: impl FnOnce() -> Option<PathBuf>,
) -> Result<Resolved, String> {
    if let Some(path) = custom.map(str::trim).filter(|p| !p.is_empty()) {
        return Ok(Resolved {
            path: PathBuf::from(path),
            source: Source::Custom,
        });
    }
    let download_error = match bundled() {
        Ok(path) => {
            return Ok(Resolved {
                path,
                source: Source::Bundled,
            })
        }
        Err(e) => e,
    };
    match system() {
        Some(path) => {
            if !download_error.is_empty() {
                eprintln!(
                    "[binary_manager] {agent} download unavailable ({download_error}); using {path:?}"
                );
            }
            Ok(Resolved {
                path,
                source: Source::System,
            })
        }
        None => Err(format!(
            "Couldn't download {name} ({download_error}), and no {name} was found on PATH. \
             Retry, or set the {name} executable path in Settings › Agents.",
            name = display_name(agent)
        )),
    }
}

/// `PATH` from the user's login shell, read once, falling back to the app's
/// own (an app opened from Finder gets a minimal `PATH`).
pub fn login_shell_path() -> Option<OsString> {
    static PATH: OnceLock<Option<OsString>> = OnceLock::new();
    PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        oc_scripts::shell_env::capture(&shell, None)
            .and_then(|env| env.get("PATH").map(OsString::from))
            .or_else(|| std::env::var_os("PATH"))
    })
    .clone()
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// The agent's CLI on the login shell's `PATH` ("Use system <Agent>").
pub fn system_binary(agent: Agent) -> Option<PathBuf> {
    let path = login_shell_path();
    match agent {
        Agent::Claude => find_claude_cli(path.as_deref(), home().as_deref()),
        Agent::Codex => find_codex_cli(path.as_deref(), home().as_deref()),
    }
}

fn custom_path<R: Runtime>(app: &AppHandle<R>, agent: Agent) -> Option<String> {
    let settings = app.try_state::<SettingsService>()?.get().ok()?;
    match agent {
        Agent::Claude => settings.claude_code_executable_path,
        Agent::Codex => settings.codex_executable_path,
    }
}

fn manager<R: Runtime>(app: &AppHandle<R>) -> Option<BinaryManager> {
    app.try_state::<BinaryManager>().map(|m| m.inner().clone())
}

/// The executable a chat starts, downloading the bundled copy first when
/// needed. Blocks: call it off the async runtime.
pub fn launch<R: Runtime>(app: &AppHandle<R>, agent: Agent) -> Result<PathBuf, String> {
    let manager = manager(app);
    resolve(
        agent,
        custom_path(app, agent).as_deref(),
        || match &manager {
            Some(m) => m.ensure_ready(agent),
            None => Err("the agent binary store is not running".into()),
        },
        || system_binary(agent),
    )
    .map(|r| r.path)
}

/// What a chat would run right now, without downloading: the custom path,
/// else a verified bundled copy, else the system CLI.
pub fn current<R: Runtime>(app: &AppHandle<R>, agent: Agent) -> Option<Resolved> {
    current_with(agent, custom_path(app, agent).as_deref(), manager(app).as_ref())
}

/// [`current`] from its parts, for callers holding the settings and the
/// store rather than the app (`CodexChats::executable`).
pub fn current_with(
    agent: Agent,
    custom: Option<&str>,
    manager: Option<&BinaryManager>,
) -> Option<Resolved> {
    resolve(
        agent,
        custom,
        || {
            manager
                .and_then(|m| m.ready_path(agent))
                .ok_or_else(String::new)
        },
        || system_binary(agent),
    )
    .ok()
}

/// `agent_executable_status` result: what the Settings › Agents Version row
/// shows. `binary` is the bundled copy's download status (Conductor's
/// `AgentBinaryStore` entry), present once the store knows the agent.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutableStatus {
    pub source: Option<Source>,
    pub path: Option<String>,
    pub version: Option<String>,
    pub binary: Option<AgentBinaryStatus>,
}

/// The bundled version from `agent-binaries/<agent>/<version>/<exe>`.
fn bundled_version(path: &Path) -> Option<String> {
    Some(path.parent()?.file_name()?.to_string_lossy().into_owned())
}

/// JS: `invoke("agent_executable_status", { agent: "claude" | "codex" })`.
/// Never downloads; a custom or system CLI is asked for `--version`.
#[tauri::command]
pub async fn agent_executable_status<R: Runtime>(
    app: AppHandle<R>,
    agent: String,
) -> Result<ExecutableStatus, String> {
    let agent = Agent::parse(&agent)?;
    tauri::async_runtime::spawn_blocking(move || {
        let binary = manager(&app).and_then(|m| m.state().into_iter().find(|s| s.agent == agent));
        let resolved = current(&app, agent);
        let version = resolved.as_ref().and_then(|r| match r.source {
            Source::Bundled => bundled_version(&r.path),
            Source::Custom | Source::System => {
                crate::agent_options::run_version(&r.path, Duration::from_secs(10))
                    .ok()
                    .and_then(|out| crate::agent_options::parse_version(&out))
                    .map(|(a, b, c)| format!("{a}.{b}.{c}"))
            }
        });
        ExecutableStatus {
            source: resolved.as_ref().map(|r| r.source),
            path: resolved.map(|r| r.path.display().to_string()),
            version,
            binary,
        }
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn a_custom_path_wins_without_downloading() {
        let downloaded = Cell::new(false);
        let r = resolve(
            Agent::Claude,
            Some("  /opt/claude  "),
            || {
                downloaded.set(true);
                Ok("/b".into())
            },
            || Some("/s".into()),
        )
        .unwrap();
        assert_eq!(
            r,
            Resolved {
                path: "/opt/claude".into(),
                source: Source::Custom
            }
        );
        assert!(!downloaded.get());
    }

    #[test]
    fn the_bundled_copy_comes_before_path() {
        let looked = Cell::new(false);
        let r = resolve(
            Agent::Codex,
            Some(" "),
            || Ok("/store/codex".into()),
            || {
                looked.set(true);
                Some("/usr/local/bin/codex".into())
            },
        )
        .unwrap();
        assert_eq!(r.source, Source::Bundled);
        assert_eq!(r.path, PathBuf::from("/store/codex"));
        assert!(!looked.get(), "PATH is only the fallback");
    }

    #[test]
    fn path_is_the_fallback_when_the_download_is_unavailable() {
        let r = resolve(
            Agent::Codex,
            None,
            || Err("offline".into()),
            || Some("/usr/local/bin/codex".into()),
        )
        .unwrap();
        assert_eq!(
            r,
            Resolved {
                path: "/usr/local/bin/codex".into(),
                source: Source::System
            }
        );
        let err = resolve(Agent::Claude, None, || Err("offline".into()), || None).unwrap_err();
        assert!(
            err.starts_with("Couldn't download Claude Code (offline)"),
            "{err}"
        );
        assert!(err.contains("Settings › Agents"));
    }

    #[test]
    fn bundled_version_is_the_version_folder() {
        assert_eq!(
            bundled_version(Path::new("/d/agent-binaries/claude/2.1.284/claude")).as_deref(),
            Some("2.1.284")
        );
    }
}
