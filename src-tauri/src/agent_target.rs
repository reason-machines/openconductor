//! A workspace whose Claude Code and Codex chats run on another machine
//! (a Reason cloud computer or a VM).
//!
//! Settings hold where (`[agent_targets."<workspace folder>"]`, see
//! [`crate::settings::AgentTarget`]); every launch builds a fresh
//! [`Handoff`] from the provider selected in Settings › Agents, so the chat
//! there runs signed in with no sign-in step, as Conductor 0.87.6's cloud
//! workspaces fetch the credential per spawn. How the credential travels is
//! in [`crate::agent::handoff`].

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::agent::handoff::{self, Handoff, LocalLogins, TargetLaunch, Transport};
use crate::agent::{AgentKind, SecretStore};
use crate::settings::{AgentTarget, Settings};

/// The target configured for the workspace at `cwd`, if any.
pub fn lookup<'a>(settings: &'a Settings, cwd: &Path) -> Option<&'a AgentTarget> {
    if settings.agent_targets.is_empty() {
        return None;
    }
    let key = cwd.to_string_lossy();
    settings.agent_targets.get(key.as_ref()).or_else(|| {
        let canon = std::fs::canonicalize(cwd).ok()?;
        settings.agent_targets.get(canon.to_string_lossy().as_ref())
    })
}

/// How to reach `target`. Only the debug builds' stand-in for now: the
/// channel to a Reason cloud computer is pending (see
/// [`crate::agent::handoff::Transport`]).
pub fn transport(target: &AgentTarget) -> Result<Transport, String> {
    #[cfg(debug_assertions)]
    if let Some(prefix) = target.exec.as_ref().filter(|p| !p.is_empty()) {
        return Ok(Transport::Exec {
            prefix: prefix.clone(),
        });
    }
    let _ = target;
    Err(
        "Running this workspace's agent on another machine is not available in this build yet"
            .into(),
    )
}

/// The target launch for a chat of `agent` in `cwd`, with the credential
/// built now, or `None` when the workspace runs its agent on this Mac.
pub fn target_launch(
    settings: &Settings,
    store: &dyn SecretStore,
    agent: AgentKind,
    cwd: &Path,
) -> Result<Option<TargetLaunch>, String> {
    if agent == AgentKind::Reason {
        return Ok(None);
    }
    let Some(target) = lookup(settings, cwd) else {
        return Ok(None);
    };
    let transport = transport(target)?;
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let claude = || handoff::read_claude_login(home.as_deref());
    let codex = || handoff::read_codex_auth(home.as_deref());
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default();
    let logins = LocalLogins {
        claude: &claude,
        codex_auth: &codex,
        now_ms,
    };
    let handoff =
        Handoff::build(&settings.provider_for(agent), store, &logins).map_err(|e| e.to_string())?;
    // Fingerprints only (16 hex of SHA-256), never values.
    let prints: Vec<String> = handoff
        .fingerprints()
        .iter()
        .map(|(k, f)| format!("{k}:{f}"))
        .collect();
    eprintln!(
        "agent target: {agent} chat in {} runs in {} with {} [{}]",
        cwd.display(),
        target.dir,
        handoff.source,
        prints.join(" ")
    );
    let program = match agent {
        AgentKind::Claude => target.claude.clone(),
        _ => target.codex.clone(),
    }
    .filter(|p| !p.trim().is_empty())
    .unwrap_or_else(|| agent.as_str().to_owned());
    Ok(Some(TargetLaunch {
        transport,
        dir: target.dir.clone(),
        program,
        handoff,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::claude::AnthropicApi;
    use crate::agent::secret::keys;
    use crate::agent::{MemorySecretStore, ProviderConfig};

    fn settings(toml_text: &str) -> Settings {
        toml::from_str(toml_text).unwrap()
    }

    #[test]
    fn no_target_runs_on_this_mac() {
        let s = Settings::default();
        let store = MemorySecretStore::new();
        assert_eq!(
            target_launch(&s, &store, AgentKind::Claude, Path::new("/ws")).unwrap(),
            None
        );
    }

    #[test]
    fn a_target_hands_over_the_selected_key_per_launch() {
        let mut s = settings(
            r#"
[agent_targets."/ws/repo"]
exec = ["env", "-i"]
dir = "/home/runner/ws"
claude = "/opt/bin/claude"
"#,
        );
        s.providers.set(
            AgentKind::Claude,
            Some(ProviderConfig::AnthropicApi(AnthropicApi::default())),
        );
        let store = MemorySecretStore::with(&[(keys::ANTHROPIC_API_KEY, "sk-ant-api03-target")]);
        let t = target_launch(&s, &store, AgentKind::Claude, Path::new("/ws/repo"))
            .unwrap()
            .unwrap();
        assert_eq!(t.dir, "/home/runner/ws");
        assert_eq!(t.program, "/opt/bin/claude");
        assert_eq!(
            t.transport,
            Transport::Exec {
                prefix: vec!["env".into(), "-i".into()]
            }
        );
        assert_eq!(t.handoff.source, "Anthropic API key");
        assert!(!format!("{t:?}").contains("sk-ant-api03-target"));
        // Codex defaults to `codex` there; Reason chats never use a target.
        assert_eq!(
            target_launch(&s, &store, AgentKind::Reason, Path::new("/ws/repo")).unwrap(),
            None
        );
        // A missing key is reported, not launched without one.
        let empty = MemorySecretStore::new();
        assert!(target_launch(&s, &empty, AgentKind::Claude, Path::new("/ws/repo")).is_err());
    }

    #[test]
    fn a_target_without_a_transport_is_refused() {
        let s = settings(
            r#"
[agent_targets."/ws"]
dir = "/w"
"#,
        );
        let e = transport(&s.agent_targets["/ws"]).unwrap_err();
        assert!(e.contains("not available"), "{e}");
    }
}
