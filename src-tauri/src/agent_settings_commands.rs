//! IPC behind Settings › Agents and Settings › Default models that the
//! settings file does not cover:
//!
//! - [`cli_login_status`]: whether an agent CLI is installed and signed in,
//!   for the status line under "Authentication" ("CLI not authenticated" or
//!   "Connected" with its info table). Conductor 0.87.6 asks its sidecar for
//!   the CLI's account info (renderApp `jpa`/`Fpa`, `t$i`; evidence/settings/
//!   NOTES.md, "Agents"); OpenConductor has no sidecar, so it reads the same
//!   facts the CLIs keep on disk and runs `--version` / `codex login status`.
//!   Credential values are never read into memory beyond an existence check.
//! - [`favorite_models_list`] / [`favorite_models_replace`]: the Default
//!   models "Loadout", stored like Conductor in `conductor.db`
//!   `favorite_models` for the local organization and user (index `Epe`,
//!   `P2`; queries in `openconductor_db::favorite_models`).

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use openconductor_db::favorite_models;
use openconductor_db::navigation::Scope;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

/// What the Agents page shows for an agent CLI's own login.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliLoginStatus {
    /// The CLI was found (on `PATH` or a usual install directory).
    pub installed: bool,
    /// Its `--version`, first word only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub authenticated: bool,
    /// "Claude account", "ChatGPT login", "API key": Conductor's "Login
    /// method" / "Auth" row.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub organization: Option<String>,
}

/// First executable `name` in `path_var`, then `~/.local/bin`, then the
/// Homebrew prefixes, as `claude_chat::find_claude_cli` searches.
pub fn find_cli(name: &str, path_var: Option<&OsStr>, home: Option<&Path>) -> Option<PathBuf> {
    if name == "claude" {
        return crate::claude_chat::find_claude_cli(path_var, home);
    }
    use std::os::unix::fs::PermissionsExt;
    let mut dirs: Vec<PathBuf> = path_var.map(|p| std::env::split_paths(p).collect()).unwrap_or_default();
    if let Some(home) = home {
        dirs.push(home.join(".local/bin"));
    }
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    dirs.into_iter().filter(|d| d.is_absolute()).map(|d| d.join(name)).find(|p| {
        p.metadata()
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    })
}

/// Runs `exe args`, returning `(exit success, stdout)` or `None` when it
/// could not start or ran past `timeout`.
fn run(exe: &Path, args: &[&str], timeout: Duration) -> Option<(bool, String)> {
    let mut child = Command::new(exe)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut out = String::new();
                if let Some(mut s) = child.stdout.take() {
                    use std::io::Read;
                    let _ = s.read_to_string(&mut out);
                }
                return Some((status.success(), out));
            }
            Ok(None) if started.elapsed() < timeout => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

/// `2.1.284 (Claude Code)` -> `2.1.284`; `codex-cli 0.156.1` -> `0.156.1`.
pub fn parse_version(out: &str) -> Option<String> {
    out.split_whitespace()
        .find(|w| w.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .map(str::to_owned)
}

/// Claude Code's own login, from what it keeps on disk: an OAuth token in the
/// environment, `~/.claude/.credentials.json` (Linux), or the macOS Keychain
/// item `Claude Code-credentials`; the account's email and organization come
/// from `oauthAccount` in `~/.claude.json`.
pub fn claude_login(home: Option<&Path>, token_env: Option<&OsStr>, keychain_has_item: impl FnOnce() -> bool) -> CliLoginStatus {
    let mut status = CliLoginStatus::default();
    let token = token_env.is_some_and(|t| !t.is_empty());
    let file = home.is_some_and(|h| h.join(".claude/.credentials.json").is_file());
    status.authenticated = token || file || keychain_has_item();
    if !status.authenticated {
        return status;
    }
    status.method = Some("Claude account".into());
    let account = home
        .and_then(|h| std::fs::read_to_string(h.join(".claude.json")).ok())
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("oauthAccount").cloned());
    if let Some(a) = account {
        let field = |k: &str| a.get(k).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(str::to_owned);
        status.email = field("emailAddress");
        status.organization = field("organizationName");
    }
    status
}

/// `codex login status` output to (authenticated, method).
pub fn parse_codex_login(success: bool, out: &str) -> (bool, Option<String>) {
    let text = out.to_ascii_lowercase();
    if !success || text.contains("not logged in") {
        return (false, None);
    }
    let method = if text.contains("chatgpt") {
        Some("ChatGPT login")
    } else if text.contains("api key") {
        Some("API key")
    } else {
        None
    };
    (true, method.map(str::to_owned))
}

fn status_for(agent: &str) -> Result<CliLoginStatus, String> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let path = std::env::var_os("PATH");
    let timeout = Duration::from_secs(10);
    match agent {
        "claude" => {
            let exe = find_cli("claude", path.as_deref(), home.as_deref());
            let mut status = claude_login(home.as_deref(), std::env::var_os("CLAUDE_CODE_OAUTH_TOKEN").as_deref(), || {
                cfg!(target_os = "macos")
                    && run(Path::new("/usr/bin/security"), &["find-generic-password", "-s", "Claude Code-credentials"], timeout)
                        .is_some_and(|(ok, _)| ok)
            });
            status.installed = exe.is_some();
            status.version = exe.and_then(|e| run(&e, &["--version"], timeout)).and_then(|(_, out)| parse_version(&out));
            Ok(status)
        }
        "codex" => {
            let Some(exe) = find_cli("codex", path.as_deref(), home.as_deref()) else {
                return Ok(CliLoginStatus::default());
            };
            let mut status = CliLoginStatus { installed: true, ..Default::default() };
            status.version = run(&exe, &["--version"], timeout).and_then(|(_, out)| parse_version(&out));
            if let Some((ok, out)) = run(&exe, &["login", "status"], timeout) {
                (status.authenticated, status.method) = parse_codex_login(ok, &out);
            }
            Ok(status)
        }
        "opencode" => {
            let Some(exe) = find_cli("opencode", path.as_deref(), home.as_deref()) else {
                return Ok(CliLoginStatus::default());
            };
            let version = run(&exe, &["--version"], timeout).and_then(|(_, out)| parse_version(&out));
            Ok(CliLoginStatus { installed: true, version, ..Default::default() })
        }
        other => Err(format!("{other} has no CLI login")),
    }
}

/// JS: `invoke("cli_login_status", { agent: "claude" | "codex" | "opencode" })`;
/// OpenCode reports only whether it is installed and its version.
#[tauri::command]
pub async fn cli_login_status(agent: String) -> Result<CliLoginStatus, String> {
    tauri::async_runtime::spawn_blocking(move || status_for(&agent))
        .await
        .map_err(|e| e.to_string())?
}

/// One loadout entry: its id and its configuration JSON (without the id).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FavoriteDto {
    pub id: String,
    pub configuration: String,
}

/// OpenConductor has no accounts: one local organization and user, as the
/// sidebar sections use.
fn local_scope() -> Scope {
    Scope { hosting_server_url: None, organization_id: "local".into(), user_id: "local".into() }
}

/// JS: `invoke("favorite_models_list")`.
#[tauri::command]
pub async fn favorite_models_list(db: State<'_, Db>) -> Result<Vec<FavoriteDto>, String> {
    let rows = favorite_models::list(&db.0, &local_scope()).await.map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|r| FavoriteDto { id: r.id, configuration: r.configuration }).collect())
}

/// JS: `invoke("favorite_models_replace", { favorites })`: the whole list, in order.
#[tauri::command]
pub async fn favorite_models_replace(db: State<'_, Db>, favorites: Vec<FavoriteDto>) -> Result<(), String> {
    for f in &favorites {
        serde_json::from_str::<serde_json::Value>(&f.configuration).map_err(|e| format!("favorite {}: {e}", f.id))?;
    }
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let rows: Vec<(String, String)> = favorites.into_iter().map(|f| (f.id, f.configuration)).collect();
    favorite_models::replace(&db.0, &local_scope(), &rows, now_ms).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions() {
        assert_eq!(parse_version("2.1.284 (Claude Code)\n").as_deref(), Some("2.1.284"));
        assert_eq!(parse_version("codex-cli 0.156.1").as_deref(), Some("0.156.1"));
        assert_eq!(parse_version("nothing here"), None);
    }

    #[test]
    fn codex_login_output() {
        assert_eq!(parse_codex_login(true, "Logged in using ChatGPT\n"), (true, Some("ChatGPT login".into())));
        assert_eq!(parse_codex_login(true, "Logged in using an API key - sk-***"), (true, Some("API key".into())));
        assert_eq!(parse_codex_login(false, "Not logged in"), (false, None));
        assert_eq!(parse_codex_login(true, "Not logged in"), (false, None));
    }

    #[test]
    fn claude_login_sources() {
        let dir = std::env::temp_dir().join(format!("oc-cli-login-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join(".claude")).unwrap();
        assert!(!claude_login(Some(&dir), None, || false).authenticated);
        assert!(claude_login(Some(&dir), Some(OsStr::new("tok")), || false).authenticated);
        assert!(!claude_login(Some(&dir), Some(OsStr::new("")), || false).authenticated);
        assert!(claude_login(Some(&dir), None, || true).authenticated);
        std::fs::write(dir.join(".claude/.credentials.json"), "{}").unwrap();
        std::fs::write(
            dir.join(".claude.json"),
            r#"{"oauthAccount":{"emailAddress":"ada@example.com","organizationName":"Ada's Org"}}"#,
        )
        .unwrap();
        let s = claude_login(Some(&dir), None, || false);
        assert!(s.authenticated);
        assert_eq!(s.method.as_deref(), Some("Claude account"));
        assert_eq!(s.email.as_deref(), Some("ada@example.com"));
        assert_eq!(s.organization.as_deref(), Some("Ada's Org"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
