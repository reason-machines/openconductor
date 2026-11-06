//! Bring-your-own-key settings: which provider an agent uses, and the
//! connect / disconnect / status operations behind the providers settings
//! page (`/settings/user/providers` in the reference app, see
//! `evidence/providers/README.md`).
//!
//! [`ProviderConfig`] is what the settings file stores: the provider `kind`
//! and its non-secret options. Secrets go to the [`SecretStore`] only, and
//! nothing here returns a secret value: [`ProviderStatus`] says whether each
//! key is present, never what it is.

use std::fmt;

use serde::{Deserialize, Serialize};

use super::claude::{AnthropicApi, ClaudeLogin};
use super::claude_cloud::{Bedrock, Foundry, Vertex};
use super::codex::{CodexGateway, CodexLogin, CursorApi, OpenAiApi, OpencodeLogin};
use super::env::{AgentKind, LaunchEnv};
use super::provider::{check_secret, Provider, ProviderError};
use super::reason::{ReasonApi, ReasonLogin};
use super::secret::{SecretStore, SecretString};

/// A configured provider, tagged by its [`Provider::kind`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProviderConfig {
    ClaudeLogin(ClaudeLogin),
    AnthropicApi(AnthropicApi),
    Bedrock(Bedrock),
    Vertex(Vertex),
    Foundry(Foundry),
    CodexLogin(CodexLogin),
    OpenaiApi(OpenAiApi),
    CodexGateway(CodexGateway),
    CursorApi(CursorApi),
    OpencodeLogin(OpencodeLogin),
    ReasonLogin(ReasonLogin),
    ReasonApi(ReasonApi),
}

impl ProviderConfig {
    pub fn provider(&self) -> &dyn Provider {
        match self {
            ProviderConfig::ClaudeLogin(p) => p,
            ProviderConfig::AnthropicApi(p) => p,
            ProviderConfig::Bedrock(p) => p,
            ProviderConfig::Vertex(p) => p,
            ProviderConfig::Foundry(p) => p,
            ProviderConfig::CodexLogin(p) => p,
            ProviderConfig::OpenaiApi(p) => p,
            ProviderConfig::CodexGateway(p) => p,
            ProviderConfig::CursorApi(p) => p,
            ProviderConfig::OpencodeLogin(p) => p,
            ProviderConfig::ReasonLogin(p) => p,
            ProviderConfig::ReasonApi(p) => p,
        }
    }

    /// The provider an agent uses when none is configured: the agent CLI's
    /// own login.
    pub fn default_for(agent: AgentKind) -> Self {
        match agent {
            AgentKind::Claude => ProviderConfig::ClaudeLogin(ClaudeLogin {}),
            AgentKind::Codex => ProviderConfig::CodexLogin(CodexLogin {}),
            AgentKind::Cursor => ProviderConfig::CursorApi(CursorApi {}),
            AgentKind::Opencode => ProviderConfig::OpencodeLogin(OpencodeLogin {}),
            AgentKind::Reason => ProviderConfig::ReasonLogin(ReasonLogin::default()),
        }
    }

    /// The environment to launch the agent with.
    pub fn launch_env(&self, store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        self.provider().launch_env(store)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ByokError {
    /// A secret was supplied under a key this provider does not read.
    UnexpectedSecret {
        key: String,
        kind: &'static str,
    },
    Provider(ProviderError),
}

impl fmt::Display for ByokError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ByokError::UnexpectedSecret { key, kind } => {
                write!(f, "{kind} does not use {key}")
            }
            ByokError::Provider(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ByokError {}

impl From<ProviderError> for ByokError {
    fn from(e: ProviderError) -> Self {
        ByokError::Provider(e)
    }
}

/// Whether one secret key is in the store. Never carries the value, only
/// its last four characters (`hint`) for the masked row on Settings › Agents.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SecretStatus {
    pub key: &'static str,
    pub present: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

/// Secrets shorter than this get no hint, so the hint never gives away a
/// large share of a short value.
pub const HINT_MIN_LEN: usize = 16;

/// The last four characters of `value`, or none for a short value.
pub fn secret_hint(value: &SecretString) -> Option<String> {
    let chars: Vec<char> = value.expose().chars().collect();
    (chars.len() >= HINT_MIN_LEN).then(|| chars[chars.len() - 4..].iter().collect())
}

/// What the settings page shows for a provider.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProviderStatus {
    pub kind: &'static str,
    pub agent: AgentKind,
    pub secrets: Vec<SecretStatus>,
    /// Options and secrets are present and well formed. Does not mean the
    /// backend accepts them.
    pub ready: bool,
    /// Why the provider is not ready, safe to display.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub problem: Option<String>,
}

pub fn status(config: &ProviderConfig, store: &dyn SecretStore) -> ProviderStatus {
    let provider = config.provider();
    let secrets = provider
        .secret_keys()
        .into_iter()
        .map(|key| {
            let value = store.get(key).ok().flatten();
            SecretStatus {
                key,
                present: value.is_some(),
                hint: value.as_ref().and_then(secret_hint),
            }
        })
        .collect();
    let problem = provider.validate(store).err().map(|e| e.to_string());
    ProviderStatus {
        kind: provider.kind(),
        agent: provider.agent(),
        secrets,
        ready: problem.is_none(),
        problem,
    }
}

/// Stores `secrets` for `config` and reports its status. Every secret is
/// checked before any is written, so a bad paste leaves the store unchanged.
pub fn connect(
    config: &ProviderConfig,
    secrets: &[(&str, SecretString)],
    store: &dyn SecretStore,
) -> Result<ProviderStatus, ByokError> {
    let provider = config.provider();
    provider.check_options()?;
    let wanted = provider.secret_keys();
    let mut checked = Vec::with_capacity(secrets.len());
    for (key, value) in secrets {
        let key = wanted.iter().copied().find(|k| k == key).ok_or_else(|| {
            ByokError::UnexpectedSecret {
                key: (*key).to_owned(),
                kind: provider.kind(),
            }
        })?;
        check_secret(key, value.expose())?;
        checked.push((key, value));
    }
    for (key, value) in checked {
        store.set(key, value).map_err(ProviderError::from)?;
    }
    Ok(status(config, store))
}

/// Removes every secret `config` reads. The settings entry itself is the
/// caller's to reset (usually to [`ProviderConfig::default_for`]).
pub fn disconnect(config: &ProviderConfig, store: &dyn SecretStore) -> Result<(), ByokError> {
    for key in config.provider().secret_keys() {
        store.delete(key).map_err(ProviderError::from)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::codex::Gateway;
    use super::super::secret::{keys, MemorySecretStore};
    use super::*;

    fn parse(json: &str) -> ProviderConfig {
        serde_json::from_str(json).expect(json)
    }

    #[test]
    fn config_tag_matches_provider_kind_for_every_variant() {
        let all = [
            r#"{"kind":"claude_login"}"#,
            r#"{"kind":"anthropic_api","auth":"auth_token"}"#,
            r#"{"kind":"bedrock","region":"us-east-1"}"#,
            r#"{"kind":"vertex","project_id":"p","region":"us-east5"}"#,
            r#"{"kind":"foundry","endpoint":{"resource":"r"}}"#,
            r#"{"kind":"codex_login"}"#,
            r#"{"kind":"openai_api"}"#,
            r#"{"kind":"codex_gateway","gateway":"open_router"}"#,
            r#"{"kind":"cursor_api"}"#,
            r#"{"kind":"opencode_login"}"#,
            r#"{"kind":"reason_login"}"#,
            r#"{"kind":"reason_login","source":"cli"}"#,
            r#"{"kind":"reason_api"}"#,
        ];
        for json in all {
            let config = parse(json);
            let tag: serde_json::Value = serde_json::to_value(&config).unwrap();
            assert_eq!(tag["kind"], config.provider().kind(), "{json}");
            assert_eq!(parse(&tag.to_string()), config, "round trip {json}");
        }
        assert!(serde_json::from_str::<ProviderConfig>(r#"{"kind":"nope"}"#).is_err());
    }

    #[test]
    fn status_hints_only_the_last_four_characters_of_long_secrets() {
        let config = parse(r#"{"kind":"anthropic_api"}"#);
        let long = "sk-ant-api03-0123456789bAAA";
        let store = MemorySecretStore::with(&[(keys::ANTHROPIC_API_KEY, long)]);
        let secret = &status(&config, &store).secrets[0];
        assert!(secret.present);
        assert_eq!(secret.hint.as_deref(), Some("bAAA"));
        let json = serde_json::to_string(secret).unwrap();
        assert!(!json.contains("0123456789"), "{json}");

        let short = MemorySecretStore::with(&[(keys::ANTHROPIC_API_KEY, "sk-short")]);
        assert_eq!(status(&config, &short).secrets[0].hint, None);
        let none = MemorySecretStore::new();
        let missing = &status(&config, &none).secrets[0];
        assert!(!missing.present && missing.hint.is_none());
    }

    #[test]
    fn default_provider_is_each_agents_own_login() {
        for agent in AgentKind::ALL {
            assert_eq!(ProviderConfig::default_for(agent).provider().agent(), agent);
        }
    }

    #[test]
    fn connect_status_disconnect_round_trip() {
        let store = MemorySecretStore::new();
        let config = ProviderConfig::CodexGateway(CodexGateway {
            gateway: Gateway::OpenRouter,
        });
        let before = status(&config, &store);
        assert!(!before.ready);
        assert!(!before.secrets[0].present);

        let key = SecretString::new("sk-or-v1-abc");
        let after = connect(&config, &[(keys::OPENROUTER_API_KEY, key)], &store).unwrap();
        assert!(after.ready, "{after:?}");
        assert_eq!(after.secrets[0].key, keys::OPENROUTER_API_KEY);
        assert!(after.secrets[0].present);
        assert!(config.launch_env(&store).is_ok());

        disconnect(&config, &store).unwrap();
        assert_eq!(store.get(keys::OPENROUTER_API_KEY).unwrap(), None);
        assert!(!status(&config, &store).ready);
    }

    #[test]
    fn connect_rejects_bad_or_foreign_secrets_without_writing_or_echoing() {
        let store = MemorySecretStore::new();
        let config = parse(r#"{"kind":"anthropic_api"}"#);
        let good = (keys::ANTHROPIC_API_KEY, SecretString::new("sk-ant-good"));

        let foreign = connect(
            &config,
            &[
                good.clone(),
                (keys::OPENAI_API_KEY, SecretString::new("sk-x")),
            ],
            &store,
        )
        .unwrap_err();
        assert!(matches!(foreign, ByokError::UnexpectedSecret { .. }));

        let pasted = SecretString::new("sk-ant-has space");
        let bad = connect(&config, &[(keys::ANTHROPIC_API_KEY, pasted)], &store).unwrap_err();
        assert!(!bad.to_string().contains("has space"), "{bad}");

        assert_eq!(store.get(keys::ANTHROPIC_API_KEY).unwrap(), None);
    }

    #[test]
    fn status_never_serializes_secret_values() {
        let store = MemorySecretStore::with(&[(keys::ANTHROPIC_API_KEY, "sk-ant-secret-value")]);
        let config = parse(r#"{"kind":"anthropic_api"}"#);
        let json = serde_json::to_string(&status(&config, &store)).unwrap();
        assert!(json.contains("\"present\":true"), "{json}");
        assert!(!json.contains("sk-ant-secret-value"), "{json}");
    }
}
