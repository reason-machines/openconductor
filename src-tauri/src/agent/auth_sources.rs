//! Where an agent's credentials come from, and which one a launch uses.
//!
//! Settings › Agents shows every sign-in OpenConductor can find for Claude
//! Code and Codex, marks the one a chat would use, and offers to import a key
//! that only lives in the user's login shell. Conductor 0.87.6 shows the
//! active one in its status table and strips agent keys from the shell
//! environment it captures (`Tf8` in conductor-runtime; see
//! `evidence/agent-auth/README.md`), so a shell key is never used silently:
//! here too it is listed as a source that can be imported, never as active.
//!
//! Nothing in this module holds a secret value. [`Facts`] records which
//! sources exist (and non-secret details such as a login's expiry); the
//! values themselves are read only where they are handed to a process
//! ([`super::handoff`]) or stored ([`super::byok::connect`]).

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::byok::ProviderConfig;
use super::claude::AnthropicAuth;
use super::env::{vars, AgentKind};
use super::secret::{keys, SecretString};

/// What a credential pays with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Plan {
    /// A Claude or ChatGPT subscription.
    Subscription,
    /// Usage-billed API key.
    ApiKey,
}

/// One place a credential was found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSource {
    /// Stable id; `env:<VAR>` for a login-shell variable.
    pub id: String,
    pub label: String,
    pub plan: Plan,
    /// Where it lives: "macOS Keychain", "~/.codex/auth.json", ...
    pub location: String,
    /// A chat started now uses this source.
    pub active: bool,
    /// [`import_target`] can copy it into OpenConductor's Keychain.
    pub importable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Claude Code's own OAuth login (`claudeAiOauth` in the Keychain item
/// `Claude Code-credentials` or in `~/.claude/.credentials.json`).
#[derive(Clone, PartialEq, Eq)]
pub struct ClaudeOauth {
    pub access_token: SecretString,
    /// Milliseconds since the epoch.
    pub expires_at_ms: Option<i64>,
    pub subscription_type: Option<String>,
}

impl std::fmt::Debug for ClaudeOauth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClaudeOauth")
            .field("access_token", &"<redacted>")
            .field("expires_at_ms", &self.expires_at_ms)
            .field("subscription_type", &self.subscription_type)
            .finish()
    }
}

impl ClaudeOauth {
    /// Parses the credentials JSON Claude Code stores. The refresh token is
    /// never read: a copy without it cannot rotate the user's login.
    pub fn parse(json: &str) -> Option<Self> {
        let v: serde_json::Value = serde_json::from_str(json).ok()?;
        let o = v.get("claudeAiOauth")?;
        let token = o.get("accessToken")?.as_str().filter(|t| !t.is_empty())?;
        Some(ClaudeOauth {
            access_token: SecretString::new(token),
            expires_at_ms: o.get("expiresAt").and_then(serde_json::Value::as_i64),
            subscription_type: o
                .get("subscriptionType")
                .and_then(|s| s.as_str())
                .map(str::to_owned),
        })
    }

    pub fn expired(&self, now_ms: i64) -> bool {
        self.expires_at_ms.is_some_and(|e| e <= now_ms)
    }
}

/// The non-secret shape of Codex's `auth.json`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CodexAuthFile {
    pub path: PathBuf,
    /// `chatgpt` or `apikey` (Codex's `auth_mode`).
    pub mode: Option<String>,
    pub has_api_key: bool,
    pub has_tokens: bool,
}

impl CodexAuthFile {
    pub fn parse(path: &Path, json: &str) -> Option<Self> {
        let v: serde_json::Value = serde_json::from_str(json).ok()?;
        let nonempty = |x: Option<&serde_json::Value>| {
            x.is_some_and(|x| !x.is_null() && x.as_str() != Some(""))
        };
        Some(CodexAuthFile {
            path: path.to_owned(),
            mode: v
                .get("auth_mode")
                .and_then(|m| m.as_str())
                .map(str::to_owned),
            has_api_key: nonempty(v.get("OPENAI_API_KEY")),
            has_tokens: v
                .get("tokens")
                .and_then(|t| t.get("access_token"))
                .is_some_and(|t| t.as_str().is_some_and(|s| !s.is_empty())),
        })
    }

    /// Signed in with ChatGPT (explicit mode, or tokens without a key).
    pub fn is_chatgpt(&self) -> bool {
        match self.mode.as_deref() {
            Some("chatgpt") => self.has_tokens,
            Some(_) => false,
            None => self.has_tokens && !self.has_api_key,
        }
    }

    pub fn is_api_key(&self) -> bool {
        self.has_api_key && !self.is_chatgpt()
    }
}

/// Where Claude Code keeps a login it made.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaudeLoginStore {
    /// macOS login Keychain, item `Claude Code-credentials`.
    Keychain,
    /// `~/.claude/.credentials.json` (Linux, or macOS without a Keychain).
    File,
}

/// What was found on this machine. Built by the caller (the Tauri command
/// reads the disk, the Keychain and the login shell).
#[derive(Debug, Clone, Default)]
pub struct Facts {
    /// Claude Code's own login and where it is kept.
    pub claude_login: Option<(ClaudeLoginStore, Option<ClaudeOauth>)>,
    /// `$CODEX_HOME/auth.json` (default `~/.codex/auth.json`).
    pub codex_auth: Option<CodexAuthFile>,
    /// Credential variables set (non-empty) in the user's login shell.
    pub shell_vars: BTreeSet<String>,
    /// OpenConductor Keychain keys that hold a value.
    pub stored: BTreeSet<&'static str>,
    /// Now, for expiry, in milliseconds since the epoch.
    pub now_ms: i64,
    /// The user's home, to shorten paths for display.
    pub home: Option<PathBuf>,
}

/// Shell variables that carry an agent credential, per agent. Conductor's
/// strip list (`Tf8`) plus `ANTHROPIC_AUTH_TOKEN` from its frontend list (`XBe`).
pub fn credential_vars(agent: AgentKind) -> &'static [&'static str] {
    match agent {
        AgentKind::Claude => &[
            vars::ANTHROPIC_API_KEY,
            vars::CLAUDE_CODE_OAUTH_TOKEN,
            vars::ANTHROPIC_AUTH_TOKEN,
        ],
        AgentKind::Codex => &[vars::OPENAI_API_KEY, vars::CODEX_API_KEY],
        _ => &[],
    }
}

/// The OpenConductor Keychain key and provider an imported shell variable
/// becomes; `None` for a variable that cannot be imported on its own
/// (`ANTHROPIC_AUTH_TOKEN` needs a gateway base URL).
pub fn import_target(agent: AgentKind, var: &str) -> Option<(&'static str, ProviderConfig)> {
    use super::claude::{AnthropicApi, ClaudeLogin};
    use super::codex::OpenAiApi;
    match (agent, var) {
        (AgentKind::Claude, vars::ANTHROPIC_API_KEY) => Some((
            keys::ANTHROPIC_API_KEY,
            ProviderConfig::AnthropicApi(AnthropicApi::default()),
        )),
        (AgentKind::Claude, vars::CLAUDE_CODE_OAUTH_TOKEN) => Some((
            keys::CLAUDE_CODE_OAUTH_TOKEN,
            ProviderConfig::ClaudeLogin(ClaudeLogin {}),
        )),
        (AgentKind::Codex, vars::OPENAI_API_KEY | vars::CODEX_API_KEY) => Some((
            keys::OPENAI_API_KEY,
            ProviderConfig::OpenaiApi(OpenAiApi::default()),
        )),
        _ => None,
    }
}

fn display(path: &Path, home: Option<&Path>) -> String {
    match home.and_then(|h| path.strip_prefix(h).ok()) {
        Some(rest) => format!("~/{}", rest.display()),
        None => path.display().to_string(),
    }
}

fn expiry_detail(oauth: Option<&ClaudeOauth>, now_ms: i64) -> Option<String> {
    let o = oauth?;
    let mut parts = Vec::new();
    if let Some(s) = &o.subscription_type {
        parts.push(format!("{s} plan"));
    }
    if o.expired(now_ms) {
        parts.push("access token expired; run claude once to refresh it".into());
    }
    (!parts.is_empty()).then(|| parts.join(", "))
}

const APP_KEYCHAIN: &str = "OpenConductor Keychain";

fn shell_sources(agent: AgentKind, facts: &Facts) -> Vec<AuthSource> {
    credential_vars(agent)
        .iter()
        .filter(|v| facts.shell_vars.contains(**v))
        .map(|v| AuthSource {
            id: format!("env:{v}"),
            label: (*v).to_owned(),
            plan: if *v == vars::CLAUDE_CODE_OAUTH_TOKEN {
                Plan::Subscription
            } else {
                Plan::ApiKey
            },
            location: "Login shell environment".into(),
            active: false,
            importable: import_target(agent, v).is_some(),
            detail: Some(
                "Not used until imported: chats clear agent keys from the shell environment".into(),
            ),
        })
        .collect()
}

/// Every source found for Claude Code, the active one first.
pub fn claude_sources(provider: &ProviderConfig, facts: &Facts) -> Vec<AuthSource> {
    let stored = |k| facts.stored.contains(k);
    let mut out = Vec::new();
    let (api, token, login) = match provider {
        ProviderConfig::AnthropicApi(a) => (
            a.auth == AnthropicAuth::ApiKey,
            a.auth == AnthropicAuth::AuthToken,
            false,
        ),
        ProviderConfig::ClaudeLogin(_) => (false, false, true),
        _ => (false, false, false),
    };
    let setup_token = stored(keys::CLAUDE_CODE_OAUTH_TOKEN);
    if setup_token {
        out.push(AuthSource {
            id: "claude_setup_token".into(),
            label: "Claude subscription token".into(),
            plan: Plan::Subscription,
            location: APP_KEYCHAIN.into(),
            active: login,
            importable: false,
            detail: Some("From claude setup-token".into()),
        });
    }
    if let Some((store, oauth)) = &facts.claude_login {
        out.push(AuthSource {
            id: "claude_cli_login".into(),
            label: "Claude Code login".into(),
            plan: Plan::Subscription,
            location: match store {
                ClaudeLoginStore::Keychain => "macOS Keychain (Claude Code-credentials)".into(),
                ClaudeLoginStore::File => facts
                    .home
                    .as_deref()
                    .map(|h| display(&h.join(".claude/.credentials.json"), Some(h)))
                    .unwrap_or_else(|| "~/.claude/.credentials.json".into()),
            },
            active: login && !setup_token,
            importable: false,
            detail: expiry_detail(oauth.as_ref(), facts.now_ms),
        });
    }
    if stored(keys::ANTHROPIC_API_KEY) {
        out.push(AuthSource {
            id: "anthropic_api_key".into(),
            label: "Anthropic API key".into(),
            plan: Plan::ApiKey,
            location: APP_KEYCHAIN.into(),
            active: api,
            importable: false,
            detail: None,
        });
    }
    if stored(keys::ANTHROPIC_AUTH_TOKEN) {
        out.push(AuthSource {
            id: "anthropic_auth_token".into(),
            label: "Anthropic auth token".into(),
            plan: Plan::ApiKey,
            location: APP_KEYCHAIN.into(),
            active: token,
            importable: false,
            detail: None,
        });
    }
    out.extend(shell_sources(AgentKind::Claude, facts));
    out.sort_by_key(|s| !s.active);
    out
}

/// Every source found for Codex, the active one first.
pub fn codex_sources(provider: &ProviderConfig, facts: &Facts) -> Vec<AuthSource> {
    let mut out = Vec::new();
    let (api, login) = match provider {
        ProviderConfig::OpenaiApi(_) => (true, false),
        ProviderConfig::CodexLogin(_) => (false, true),
        _ => (false, false),
    };
    if let Some(file) = &facts.codex_auth {
        let location = display(&file.path, facts.home.as_deref());
        if file.is_chatgpt() {
            out.push(AuthSource {
                id: "codex_chatgpt".into(),
                label: "ChatGPT sign-in".into(),
                plan: Plan::Subscription,
                location,
                active: login,
                importable: false,
                detail: None,
            });
        } else if file.is_api_key() {
            out.push(AuthSource {
                id: "codex_auth_api_key".into(),
                label: "Codex API key login".into(),
                plan: Plan::ApiKey,
                location,
                active: login,
                importable: false,
                detail: Some("From codex login --with-api-key".into()),
            });
        }
    }
    if facts.stored.contains(keys::OPENAI_API_KEY) {
        out.push(AuthSource {
            id: "openai_api_key".into(),
            label: "OpenAI API key".into(),
            plan: Plan::ApiKey,
            location: APP_KEYCHAIN.into(),
            active: api,
            importable: false,
            detail: None,
        });
    }
    out.extend(shell_sources(AgentKind::Codex, facts));
    out.sort_by_key(|s| !s.active);
    out
}

pub fn sources(agent: AgentKind, provider: &ProviderConfig, facts: &Facts) -> Vec<AuthSource> {
    match agent {
        AgentKind::Claude => claude_sources(provider, facts),
        AgentKind::Codex => codex_sources(provider, facts),
        _ => Vec::new(),
    }
}

/// What a first launch imports with no prompt: a shell key, but only when
/// no provider is configured and the CLI has no login of its own (a login
/// always wins, as it does for the CLI itself). `ANTHROPIC_API_KEY` /
/// `OPENAI_API_KEY` win over the token variants, matching the order the
/// CLIs document.
pub fn first_run_import(agent: AgentKind, configured: bool, facts: &Facts) -> Option<&'static str> {
    if configured {
        return None;
    }
    let cli_login = match agent {
        AgentKind::Claude => facts.claude_login.is_some(),
        AgentKind::Codex => facts
            .codex_auth
            .as_ref()
            .is_some_and(|f| f.is_chatgpt() || f.is_api_key()),
        _ => return None,
    };
    if cli_login {
        return None;
    }
    let order: &[&'static str] = match agent {
        AgentKind::Claude => &[vars::ANTHROPIC_API_KEY, vars::CLAUDE_CODE_OAUTH_TOKEN],
        _ => &[vars::OPENAI_API_KEY, vars::CODEX_API_KEY],
    };
    order
        .iter()
        .copied()
        .find(|v| facts.shell_vars.contains(*v))
}

/// Normalizes a pasted `claude setup-token` value the way Conductor's
/// frontend does (`I7r`): accepts `export CLAUDE_CODE_OAUTH_TOKEN=...`,
/// quotes, a `Bearer` prefix or an `Authorization:` header, and drops
/// whitespace and line breaks.
pub fn normalize_setup_token(pasted: &str) -> String {
    fn unquote(s: &str) -> &str {
        let s = s.trim();
        for q in ['"', '\'', '`'] {
            if s.len() >= 2 && s.starts_with(q) && s.ends_with(q) {
                return s[1..s.len() - 1].trim();
            }
        }
        s
    }
    fn unbearer(s: &str) -> &str {
        let s = s.trim();
        let lower = s.to_ascii_lowercase();
        let s = if lower.starts_with("authorization") {
            match s.find(':') {
                Some(i) => s[i + 1..].trim(),
                None => s,
            }
        } else {
            s
        };
        if s.len() > 7 && s[..7].eq_ignore_ascii_case("bearer ") {
            s[7..].trim()
        } else {
            s
        }
    }
    let lines: Vec<&str> = pasted
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    let assigned = lines.iter().find_map(|l| {
        let l = l.strip_prefix("export ").unwrap_or(l).trim_start();
        let rest = l.strip_prefix(vars::CLAUDE_CODE_OAUTH_TOKEN)?.trim_start();
        let v = rest.strip_prefix('=')?.trim();
        Some(v.strip_suffix(';').unwrap_or(v))
    });
    let bearer = lines.iter().copied().find(|l| {
        let l = l.to_ascii_lowercase();
        l.starts_with("bearer ") || (l.starts_with("authorization") && l.contains("bearer "))
    });
    let picked = assigned.or(bearer).unwrap_or(pasted);
    unbearer(unquote(unbearer(picked)))
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::claude::{AnthropicApi, ClaudeLogin};
    use super::super::codex::{CodexLogin, OpenAiApi};
    use super::*;

    fn facts() -> Facts {
        Facts {
            now_ms: 1_000_000,
            home: Some(PathBuf::from("/Users/ada")),
            ..Default::default()
        }
    }

    fn oauth(expires: i64) -> ClaudeOauth {
        ClaudeOauth {
            access_token: SecretString::new("sk-ant-oat01-x"),
            expires_at_ms: Some(expires),
            subscription_type: Some("max".into()),
        }
    }

    fn ids(v: &[AuthSource]) -> Vec<(String, bool)> {
        v.iter().map(|s| (s.id.clone(), s.active)).collect()
    }

    #[test]
    fn claude_oauth_parse_never_keeps_the_refresh_token() {
        let json = r#"{"claudeAiOauth":{"accessToken":"sk-ant-oat01-a","refreshToken":"sk-ant-ort01-r","expiresAt":42,"subscriptionType":"max"}}"#;
        let o = ClaudeOauth::parse(json).unwrap();
        assert_eq!(o.access_token.expose(), "sk-ant-oat01-a");
        assert_eq!(o.expires_at_ms, Some(42));
        let shown = format!("{o:?}");
        assert!(
            !shown.contains("oat01") && !shown.contains("ort01"),
            "{shown}"
        );
        assert!(ClaudeOauth::parse(r#"{"claudeAiOauth":{"accessToken":""}}"#).is_none());
        assert!(ClaudeOauth::parse("not json").is_none());
    }

    #[test]
    fn codex_auth_file_modes() {
        let p = Path::new("/h/.codex/auth.json");
        let chat = CodexAuthFile::parse(p, r#"{"auth_mode":"chatgpt","OPENAI_API_KEY":null,"tokens":{"access_token":"a","refresh_token":"r"}}"#).unwrap();
        assert!(chat.is_chatgpt() && !chat.is_api_key());
        let key =
            CodexAuthFile::parse(p, r#"{"auth_mode":"apikey","OPENAI_API_KEY":"sk-x"}"#).unwrap();
        assert!(key.is_api_key() && !key.is_chatgpt());
        let legacy = CodexAuthFile::parse(
            p,
            r#"{"OPENAI_API_KEY":null,"tokens":{"access_token":"a"}}"#,
        )
        .unwrap();
        assert!(legacy.is_chatgpt());
        let empty = CodexAuthFile::parse(p, r#"{"OPENAI_API_KEY":""}"#).unwrap();
        assert!(!empty.is_chatgpt() && !empty.is_api_key());
    }

    #[test]
    fn claude_cli_login_is_active_by_default_and_shell_keys_never_are() {
        let mut f = facts();
        f.claude_login = Some((ClaudeLoginStore::Keychain, Some(oauth(2_000_000))));
        f.shell_vars.insert("ANTHROPIC_API_KEY".into());
        f.shell_vars.insert("OPENAI_API_KEY".into());
        let s = claude_sources(&ProviderConfig::ClaudeLogin(ClaudeLogin {}), &f);
        assert_eq!(
            ids(&s),
            vec![
                ("claude_cli_login".into(), true),
                ("env:ANTHROPIC_API_KEY".into(), false)
            ]
        );
        assert_eq!(s[0].plan, Plan::Subscription);
        assert_eq!(s[0].detail.as_deref(), Some("max plan"));
        assert!(s[1].importable);
    }

    #[test]
    fn a_stored_setup_token_wins_over_the_cli_login() {
        let mut f = facts();
        f.claude_login = Some((ClaudeLoginStore::File, Some(oauth(5))));
        f.stored.insert(keys::CLAUDE_CODE_OAUTH_TOKEN);
        f.stored.insert(keys::ANTHROPIC_API_KEY);
        let s = claude_sources(&ProviderConfig::ClaudeLogin(ClaudeLogin {}), &f);
        assert_eq!(
            ids(&s),
            vec![
                ("claude_setup_token".into(), true),
                ("claude_cli_login".into(), false),
                ("anthropic_api_key".into(), false),
            ]
        );
        assert_eq!(s[1].location, "~/.claude/.credentials.json");
        assert!(s[1].detail.as_deref().unwrap().contains("expired"));
        let api = claude_sources(&ProviderConfig::AnthropicApi(AnthropicApi::default()), &f);
        assert_eq!(api[0].id, "anthropic_api_key");
        assert!(api[0].active);
        assert_eq!(api.iter().filter(|s| s.active).count(), 1);
    }

    #[test]
    fn codex_sources_follow_the_provider() {
        let mut f = facts();
        f.codex_auth = CodexAuthFile::parse(
            Path::new("/Users/ada/.codex/auth.json"),
            r#"{"auth_mode":"chatgpt","tokens":{"access_token":"a"}}"#,
        );
        f.stored.insert(keys::OPENAI_API_KEY);
        f.shell_vars.insert("CODEX_API_KEY".into());
        let login = codex_sources(&ProviderConfig::CodexLogin(CodexLogin {}), &f);
        assert_eq!(
            ids(&login),
            vec![
                ("codex_chatgpt".into(), true),
                ("openai_api_key".into(), false),
                ("env:CODEX_API_KEY".into(), false),
            ]
        );
        assert_eq!(login[0].location, "~/.codex/auth.json");
        let api = codex_sources(&ProviderConfig::OpenaiApi(OpenAiApi::default()), &f);
        assert_eq!(api[0].id, "openai_api_key");
        assert!(api[0].active);
    }

    #[test]
    fn first_run_imports_a_shell_key_only_without_any_other_sign_in() {
        let mut f = facts();
        f.shell_vars.insert("CLAUDE_CODE_OAUTH_TOKEN".into());
        f.shell_vars.insert("ANTHROPIC_API_KEY".into());
        assert_eq!(
            first_run_import(AgentKind::Claude, false, &f),
            Some("ANTHROPIC_API_KEY")
        );
        assert_eq!(first_run_import(AgentKind::Claude, true, &f), None);
        f.claude_login = Some((ClaudeLoginStore::Keychain, None));
        assert_eq!(first_run_import(AgentKind::Claude, false, &f), None);

        let mut c = facts();
        c.shell_vars.insert("CODEX_API_KEY".into());
        assert_eq!(
            first_run_import(AgentKind::Codex, false, &c),
            Some("CODEX_API_KEY")
        );
        c.codex_auth = Some(CodexAuthFile {
            mode: Some("chatgpt".into()),
            has_tokens: true,
            ..Default::default()
        });
        assert_eq!(first_run_import(AgentKind::Codex, false, &c), None);
        assert_eq!(first_run_import(AgentKind::Cursor, false, &c), None);
    }

    #[test]
    fn import_targets() {
        let (key, cfg) = import_target(AgentKind::Claude, "CLAUDE_CODE_OAUTH_TOKEN").unwrap();
        assert_eq!(key, keys::CLAUDE_CODE_OAUTH_TOKEN);
        assert_eq!(cfg, ProviderConfig::ClaudeLogin(ClaudeLogin {}));
        assert_eq!(
            import_target(AgentKind::Codex, "CODEX_API_KEY").unwrap().0,
            keys::OPENAI_API_KEY
        );
        assert!(import_target(AgentKind::Claude, "ANTHROPIC_AUTH_TOKEN").is_none());
        assert!(import_target(AgentKind::Claude, "OPENAI_API_KEY").is_none());
    }

    #[test]
    fn setup_token_paste_forms() {
        for pasted in [
            "sk-ant-oat01-abc",
            "  sk-ant-oat01-abc\n",
            "export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-abc",
            "export CLAUDE_CODE_OAUTH_TOKEN=\"sk-ant-oat01-abc\";",
            "CLAUDE_CODE_OAUTH_TOKEN='sk-ant-oat01-abc'",
            "Bearer sk-ant-oat01-abc",
            "Authorization: Bearer sk-ant-oat01-abc",
            "sk-ant-oat01-\nabc",
            "Your token:\nexport CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-abc\nUse it in CI.",
        ] {
            assert_eq!(
                normalize_setup_token(pasted),
                "sk-ant-oat01-abc",
                "{pasted:?}"
            );
        }
    }
}
