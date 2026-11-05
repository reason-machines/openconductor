//! Providers for Claude Code: its own login and the Anthropic API (or an
//! Anthropic-compatible gateway). Cloud backends are in `claude_cloud.rs`. Provider kinds follow `evidence/providers/README.md`;
//! variable names are Claude Code's documented configuration.

use serde::{Deserialize, Serialize};

use super::env::{vars, AgentKind, LaunchEnv};
use super::provider::{
    check_nonempty, check_optional_url, require_secret, Provider, ProviderError,
};
use super::secret::{keys, SecretStore};

/// Model ids to use for Claude Code's opus / sonnet / haiku aliases. Needed
/// when a backend names models differently (Bedrock inference profiles,
/// Vertex or Foundry deployments, gateway model ids).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelOverrides {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sonnet: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub haiku: Option<String>,
}

impl ModelOverrides {
    pub fn is_empty(&self) -> bool {
        self.opus.is_none() && self.sonnet.is_none() && self.haiku.is_none()
    }

    fn entries(&self) -> [(&'static str, &'static str, &Option<String>); 3] {
        [
            (
                "models.opus",
                vars::ANTHROPIC_DEFAULT_OPUS_MODEL,
                &self.opus,
            ),
            (
                "models.sonnet",
                vars::ANTHROPIC_DEFAULT_SONNET_MODEL,
                &self.sonnet,
            ),
            (
                "models.haiku",
                vars::ANTHROPIC_DEFAULT_HAIKU_MODEL,
                &self.haiku,
            ),
        ]
    }

    pub(super) fn check(&self) -> Result<(), ProviderError> {
        for (field, _, value) in self.entries() {
            if let Some(v) = value {
                check_nonempty(field, v)?;
            }
        }
        Ok(())
    }

    pub(super) fn apply(&self, env: &mut LaunchEnv) {
        for (_, var, value) in self.entries() {
            if let Some(v) = value {
                env.set(var, v.clone());
            }
        }
    }
}

macro_rules! claude_provider {
    ($kind:literal) => {
        fn agent(&self) -> AgentKind {
            AgentKind::Claude
        }
        fn kind(&self) -> &'static str {
            $kind
        }
    };
}

/// Claude Code with its own login (a Claude subscription signed in through
/// the CLI). Clears every routing variable so the login is used.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClaudeLogin {}

impl Provider for ClaudeLogin {
    claude_provider!("claude_login");
    fn secret_keys(&self) -> Vec<&'static str> {
        Vec::new()
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        Ok(())
    }
    fn launch_env(&self, _store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        Ok(LaunchEnv::cleared_for(AgentKind::Claude))
    }
}

/// Which Anthropic credential the user brought.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnthropicAuth {
    /// Sent as `x-api-key`.
    #[default]
    ApiKey,
    /// Sent as a bearer token; what gateways and proxies usually expect.
    AuthToken,
}

/// Claude Code against the Anthropic API, or an Anthropic-compatible gateway
/// when `base_url` is set (the reference app's "custom provider").
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AnthropicApi {
    #[serde(default)]
    pub auth: AnthropicAuth,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "ModelOverrides::is_empty")]
    pub models: ModelOverrides,
}

impl AnthropicApi {
    fn secret_key(&self) -> &'static str {
        match self.auth {
            AnthropicAuth::ApiKey => keys::ANTHROPIC_API_KEY,
            AnthropicAuth::AuthToken => keys::ANTHROPIC_AUTH_TOKEN,
        }
    }
}

impl Provider for AnthropicApi {
    claude_provider!("anthropic_api");
    fn secret_keys(&self) -> Vec<&'static str> {
        vec![self.secret_key()]
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        check_optional_url("base_url", &self.base_url)?;
        self.models.check()
    }
    fn launch_env(&self, store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        self.check_options()?;
        let secret = require_secret(store, self.secret_key())?;
        let mut env = LaunchEnv::cleared_for(AgentKind::Claude);
        match self.auth {
            AnthropicAuth::ApiKey => env.set_secret(vars::ANTHROPIC_API_KEY, secret),
            AnthropicAuth::AuthToken => env.set_secret(vars::ANTHROPIC_AUTH_TOKEN, secret),
        }
        if let Some(url) = &self.base_url {
            env.set(vars::ANTHROPIC_BASE_URL, url.clone());
        }
        self.models.apply(&mut env);
        Ok(env)
    }
}

#[cfg(test)]
pub(super) mod testutil {
    use super::super::env::{AgentKind, EnvValue, LaunchEnv};

    pub fn plain<'a>(env: &'a LaunchEnv, name: &str) -> Option<&'a str> {
        match env.get(name)? {
            EnvValue::Plain(v) => Some(v),
            EnvValue::Secret(_) => panic!("{name} should not be secret"),
        }
    }

    pub fn secret<'a>(env: &'a LaunchEnv, name: &str) -> Option<&'a str> {
        match env.get(name)? {
            EnvValue::Secret(v) => Some(v.expose()),
            EnvValue::Plain(_) => panic!("{name} should be secret"),
        }
    }

    pub fn assert_clears_all(env: &LaunchEnv) {
        for var in AgentKind::Claude.routing_vars() {
            assert!(env.is_removed(var) || env.get(var).is_some(), "{var}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::secret::MemorySecretStore;
    use super::testutil::*;
    use super::*;

    #[test]
    fn login_sets_nothing() {
        let env = ClaudeLogin {}
            .launch_env(&MemorySecretStore::new())
            .unwrap();
        assert_eq!(env.set_vars().count(), 0);
        assert_clears_all(&env);
    }

    #[test]
    fn api_key_auth_token_gateway_and_models() {
        let store = MemorySecretStore::with(&[
            (keys::ANTHROPIC_API_KEY, "key-a"),
            (keys::ANTHROPIC_AUTH_TOKEN, "token-b"),
        ]);
        let env = AnthropicApi::default().launch_env(&store).unwrap();
        assert_eq!(secret(&env, vars::ANTHROPIC_API_KEY), Some("key-a"));
        assert!(env.is_removed(vars::ANTHROPIC_AUTH_TOKEN));
        assert!(env.is_removed(vars::ANTHROPIC_BASE_URL));
        assert_clears_all(&env);

        let gateway = AnthropicApi {
            auth: AnthropicAuth::AuthToken,
            base_url: Some("https://llm.internal:8443".into()),
            models: ModelOverrides {
                sonnet: Some("team/sonnet".into()),
                ..Default::default()
            },
        };
        let env = gateway.launch_env(&store).unwrap();
        assert_eq!(secret(&env, vars::ANTHROPIC_AUTH_TOKEN), Some("token-b"));
        assert!(env.is_removed(vars::ANTHROPIC_API_KEY));
        assert_eq!(
            plain(&env, vars::ANTHROPIC_BASE_URL),
            Some("https://llm.internal:8443")
        );
        assert_eq!(
            plain(&env, vars::ANTHROPIC_DEFAULT_SONNET_MODEL),
            Some("team/sonnet")
        );
        assert!(env.is_removed(vars::ANTHROPIC_DEFAULT_OPUS_MODEL));
        assert_eq!(gateway.secret_keys(), vec![keys::ANTHROPIC_AUTH_TOKEN]);

        assert_eq!(
            AnthropicApi::default().validate(&MemorySecretStore::new()),
            Err(ProviderError::MissingSecret {
                key: keys::ANTHROPIC_API_KEY
            })
        );
        let blank_model = AnthropicApi {
            models: ModelOverrides {
                haiku: Some(" ".into()),
                ..Default::default()
            },
            ..Default::default()
        };
        assert!(blank_model.check_options().is_err());
    }
}
