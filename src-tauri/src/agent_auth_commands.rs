//! IPC behind Settings › Agents' "Sign-ins found" list and the first-run
//! import (`crate::agent::auth_sources`):
//!
//! - [`agent_auth_sources`]: every sign-in found for Claude Code or Codex
//!   and which one a chat uses now.
//! - [`agent_auth_import`]: copies a key that only lives in the user's
//!   login shell into OpenConductor's Keychain and switches the agent to it,
//!   so the user never pastes it again.
//! - [`first_run_import`]: at startup, for an agent with no provider in
//!   settings and no CLI login, imports a shell key with no prompt. It runs
//!   once per data directory (marker file `agent-auth-first-run`).
//!
//! The login shell is probed for variable *names*; a value is read only by
//! [`agent_auth_import`] / [`first_run_import`] and goes straight to the
//! Keychain. Nothing here logs or returns a value.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, State};

use crate::agent::auth_sources::{self, AuthSource, ClaudeLoginStore, CodexAuthFile, Facts};
use crate::agent::byok::ProviderStatus;
use crate::agent::handoff;
use crate::agent::AgentKind;
use crate::settings::service::{SecretInput, SettingsService};

const DELIM: &str = "_OPENCONDUCTOR_AUTH_PROBE_";
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const MARKER: &str = "agent-auth-first-run";

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn parse_agent(agent: &str) -> Result<AgentKind, String> {
    match agent {
        "claude" => Ok(AgentKind::Claude),
        "codex" => Ok(AgentKind::Codex),
        other => Err(format!("{other} has no sign-in sources")),
    }
}

/// Runs `script` in the user's login shell (as `shell_env` does) and returns
/// what it printed between two delimiters.
fn login_shell(script: &str) -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let (exe, flags): (&str, &[&str]) = match oc_scripts::shell_env::login_flags(&shell) {
        Some(_) if !shell.ends_with("fish") => (&shell, &["-ilc"]),
        _ => ("/bin/zsh", &["-lc"]),
    };
    let wrapped = format!("printf '%s' '{DELIM}'; {script}; printf '%s' '{DELIM}'; exit");
    let mut child = Command::new(exe)
        .args(flags)
        .arg(wrapped)
        .env("DISABLE_AUTO_UPDATE", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + PROBE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let mut out = String::new();
    use std::io::Read;
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    let mut parts = out.split(DELIM);
    parts.next()?;
    let body = parts.next()?;
    parts.next()?;
    Some(body.to_owned())
}

/// Names of agent credential variables set (non-empty) in the login shell
/// or in this process's own environment.
fn shell_vars(agent: AgentKind) -> BTreeSet<String> {
    let names = auth_sources::credential_vars(agent);
    let mut found: BTreeSet<String> = names
        .iter()
        .filter(|n| std::env::var_os(n).is_some_and(|v| !v.is_empty()))
        .map(|n| (*n).to_owned())
        .collect();
    let script = names
        .iter()
        .map(|n| format!("[ -n \"${{{n}:-}}\" ] && printf '%s\\n' {n}"))
        .collect::<Vec<_>>()
        .join("; ");
    if let Some(out) = login_shell(&format!("{script}; :")) {
        found.extend(
            out.lines()
                .map(str::trim)
                .filter(|l| names.contains(l))
                .map(str::to_owned),
        );
    }
    found
}

/// One credential variable's value: this process's environment first, then
/// the login shell's.
fn shell_value(var: &str) -> Option<String> {
    if let Some(v) = std::env::var(var).ok().filter(|v| !v.is_empty()) {
        return Some(v);
    }
    login_shell(&format!("printf '%s' \"${{{var}:-}}\"")).filter(|v| !v.is_empty())
}

/// Whether Claude Code has a login of its own (existence only).
fn claude_login(
    home: Option<&Path>,
) -> Option<(ClaudeLoginStore, Option<auth_sources::ClaudeOauth>)> {
    if cfg!(target_os = "macos") {
        let user = std::env::var("USER").unwrap_or_default();
        let found = Command::new("/usr/bin/security")
            .args([
                "find-generic-password",
                "-a",
                &user,
                "-s",
                "Claude Code-credentials",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success());
        if found {
            return Some((ClaudeLoginStore::Keychain, None));
        }
    }
    let text = std::fs::read_to_string(home?.join(".claude/.credentials.json")).ok()?;
    Some((
        ClaudeLoginStore::File,
        auth_sources::ClaudeOauth::parse(&text),
    ))
}

fn codex_auth(home: Option<&Path>) -> Option<CodexAuthFile> {
    let path = handoff::codex_home(home)?.join("auth.json");
    let text = std::fs::read_to_string(&path).ok()?;
    CodexAuthFile::parse(&path, &text)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn facts(agent: AgentKind, settings: &SettingsService) -> Facts {
    let home = home();
    Facts {
        claude_login: (agent == AgentKind::Claude)
            .then(|| claude_login(home.as_deref()))
            .flatten(),
        codex_auth: (agent == AgentKind::Codex)
            .then(|| codex_auth(home.as_deref()))
            .flatten(),
        shell_vars: shell_vars(agent),
        stored: settings.stored_keys(),
        now_ms: now_ms(),
        home,
    }
}

fn sources_for(agent: AgentKind, settings: &SettingsService) -> Result<Vec<AuthSource>, String> {
    let provider = settings
        .get()
        .map_err(|e| e.to_string())?
        .provider_for(agent);
    Ok(auth_sources::sources(
        agent,
        &provider,
        &facts(agent, settings),
    ))
}

/// JS: `invoke("agent_auth_sources", { agent: "claude" | "codex" })`.
#[tauri::command]
pub async fn agent_auth_sources(app: AppHandle, agent: String) -> Result<Vec<AuthSource>, String> {
    let agent = parse_agent(&agent)?;
    tauri::async_runtime::spawn_blocking(move || {
        sources_for(agent, &app.state::<SettingsService>())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn import(
    settings: &SettingsService,
    agent: AgentKind,
    var: &str,
) -> Result<ProviderStatus, String> {
    let (key, config) = auth_sources::import_target(agent, var)
        .ok_or_else(|| format!("{var} cannot be imported"))?;
    let value = shell_value(var).ok_or_else(|| format!("{var} is not set in your login shell"))?;
    let value = if key == crate::agent::secret::keys::CLAUDE_CODE_OAUTH_TOKEN {
        auth_sources::normalize_setup_token(&value)
    } else {
        value.trim().to_owned()
    };
    settings
        .connect(
            agent,
            config,
            vec![SecretInput {
                key: key.to_owned(),
                value,
            }],
        )
        .map_err(|e| e.to_string())
}

/// JS: `invoke("agent_auth_import", { agent, sourceId: "env:ANTHROPIC_API_KEY" })`.
#[tauri::command]
pub async fn agent_auth_import(
    settings: State<'_, SettingsService>,
    agent: String,
    source_id: String,
) -> Result<ProviderStatus, String> {
    let agent = parse_agent(&agent)?;
    let var = source_id
        .strip_prefix("env:")
        .ok_or("only login-shell keys can be imported")?;
    import(&settings, agent, var)
}

/// Startup: imports a login-shell key for each agent that has no provider
/// and no CLI login, once per data directory. Runs on its own thread; a
/// failure only logs the agent and the reason, never a value.
pub fn first_run_import(app: &AppHandle, data_dir: &Path) {
    let marker = data_dir.join(MARKER);
    if marker.exists() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let settings = app.state::<SettingsService>();
        let Ok(current) = settings.get() else { return };
        for agent in [AgentKind::Claude, AgentKind::Codex] {
            let configured = current.providers.get(agent).is_some()
                || current.provider_for(agent) != crate::agent::ProviderConfig::default_for(agent);
            let f = facts(agent, &settings);
            if let Some(var) = auth_sources::first_run_import(agent, configured, &f) {
                match import(&settings, agent, var) {
                    Ok(_) => {
                        eprintln!("agent auth: imported {agent} key from {var} in the login shell")
                    }
                    Err(e) => eprintln!("agent auth: {agent} first-run import skipped: {e}"),
                }
            }
        }
        let _ = std::fs::write(&marker, b"done\n");
    });
}

/// What [`e2e_agent_handoff`] observed. Never carries a credential.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffCheck {
    pub agent: AgentKind,
    pub target: String,
    /// What was handed over ("Anthropic API key or auth token", ...).
    pub source: String,
    pub env_names: Vec<String>,
    pub files: Vec<String>,
    pub exit_code: Option<i32>,
    /// The agent's reply (Claude Code's `result`, Codex's last message), cut to 400 characters.
    pub reply: String,
    /// Claude Code's `is_error`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
    /// No handed-over value appears in the target's stdout or stderr.
    pub no_secret_in_output: bool,
    /// The private directory is gone after the agent exited.
    pub handoff_dir_removed: bool,
    pub ms: u128,
}

fn handoff_run(
    settings: &SettingsService,
    agent: AgentKind,
    target: &str,
    prompt: &str,
) -> Result<HandoffCheck, String> {
    let remote =
        handoff::Remote::parse(target).ok_or("target must be ssh:<host> or exec:<argv>")?;
    let config = settings
        .get()
        .map_err(|e| e.to_string())?
        .provider_for(agent);
    let home = home();
    let claude = || handoff::read_claude_login(home.as_deref());
    let logins = handoff::LocalLogins {
        claude: &claude,
        codex_home: handoff::codex_home(home.as_deref()),
        now_ms: now_ms(),
    };
    let h = handoff::Handoff::build(&config, settings.secret_store(), &logins)
        .map_err(|e| e.to_string())?;
    let started = Instant::now();
    let installed = remote.install(&h).map_err(|e| e.to_string())?;
    let (program, args): (&str, Vec<String>) = match agent {
        AgentKind::Claude => (
            "claude",
            vec![
                "-p".into(),
                prompt.into(),
                "--output-format".into(),
                "json".into(),
            ],
        ),
        _ => (
            "codex",
            vec!["exec".into(), "--skip-git-repo-check".into(), prompt.into()],
        ),
    };
    let out = remote
        .command(&installed, None, program, &args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
    let secrets: Vec<&str> = h
        .env
        .iter()
        .filter(|(_, v)| v.is_secret())
        .map(|(_, v)| v.expose())
        .chain(h.files.iter().map(|(_, c)| c.expose()))
        .filter(|v| v.len() >= 8)
        .collect();
    let no_secret_in_output = secrets
        .iter()
        .all(|s| !stdout.contains(s) && !stderr.contains(s));
    let (reply, is_error) = match agent {
        AgentKind::Claude => match serde_json::from_str::<serde_json::Value>(stdout.trim()) {
            Ok(v) => (
                v.get("result")
                    .and_then(|r| r.as_str())
                    .unwrap_or_default()
                    .to_owned(),
                v.get("is_error").and_then(|e| e.as_bool()),
            ),
            Err(_) => (
                stdout
                    .lines()
                    .chain(stderr.lines())
                    .last()
                    .unwrap_or("")
                    .to_owned(),
                None,
            ),
        },
        _ => (stdout.trim().lines().last().unwrap_or("").to_owned(), None),
    };
    let gone = remote
        .sh(
            r#"test -e "$1" && echo present || echo gone"#,
            std::slice::from_ref(&installed.dir),
        )
        .stdin(Stdio::null())
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "gone")
        .unwrap_or(false);
    Ok(HandoffCheck {
        agent,
        target: target.to_owned(),
        source: h.source.clone(),
        env_names: h.env.iter().map(|(k, _)| k.clone()).collect(),
        files: h.files.iter().map(|(p, _)| p.clone()).collect(),
        exit_code: out.status.code(),
        reply: if no_secret_in_output {
            reply.chars().take(400).collect()
        } else {
            "<withheld>".into()
        },
        is_error,
        no_secret_in_output,
        handoff_dir_removed: gone,
        ms: started.elapsed().as_millis(),
    })
}

/// JS: `invoke("e2e_agent_handoff", { agent, target, prompt })`. Debug builds
/// started with `OC_E2E_OUT` only: hands the agent's active credential to
/// `target` (`ssh:<host>` or `exec:<argv>`, such as `exec:docker exec -i box`)
/// and runs one prompt there with the CLI.
#[tauri::command]
pub async fn e2e_agent_handoff(
    app: AppHandle,
    agent: String,
    target: String,
    prompt: String,
) -> Result<HandoffCheck, String> {
    if !crate::e2e::enabled() {
        return Err("not available".into());
    }
    let agent = parse_agent(&agent)?;
    tauri::async_runtime::spawn_blocking(move || {
        handoff_run(&app.state::<SettingsService>(), agent, &target, &prompt)
    })
    .await
    .map_err(|e| e.to_string())?
}
