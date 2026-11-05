//! Providers for Codex, Cursor's agent CLI and OpenCode. Provider kinds
//! follow `evidence/providers/README.md`; variable names are each CLI's
//! documented configuration.

use serde::{Deserialize, Serialize};

use super::env::{vars, AgentKind, LaunchEnv};
use super::provider::{
    check_nonempty, check_optional_url, require_secret, Provider, ProviderError,
};
use super::secret::{keys, SecretStore, SecretString};

/// Codex with its own login (`codex login`, including a ChatGPT plan).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CodexLogin {}

impl Provider for CodexLogin {
    fn agent(&self) -> AgentKind {
        AgentKind::Codex
    }
    fn kind(&self) -> &'static str {
        "codex_login"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        Vec::new()
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        Ok(())
    }
    fn launch_env(&self, _store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        Ok(LaunchEnv::cleared_for(AgentKind::Codex))
    }
}

/// Sets the key under both names Codex reads: `codex exec` and the app
/// server prefer CODEX_API_KEY, older releases read OPENAI_API_KEY.
fn set_codex_key(env: &mut LaunchEnv, key: SecretString) {
    env.set_secret(vars::CODEX_API_KEY, key.clone());
    env.set_secret(vars::OPENAI_API_KEY, key);
}

/// Codex with an OpenAI API key, optionally through an OpenAI-compatible
/// endpoint (`base_url`) and scoped to an organization or project.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OpenAiApi {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub organization: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
}

impl Provider for OpenAiApi {
    fn agent(&self) -> AgentKind {
        AgentKind::Codex
    }
    fn kind(&self) -> &'static str {
        "openai_api"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        vec![keys::OPENAI_API_KEY]
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        check_optional_url("base_url", &self.base_url)?;
        if let Some(org) = &self.organization {
            check_nonempty("organization", org)?;
        }
        if let Some(project) = &self.project {
            check_nonempty("project", project)?;
        }
        Ok(())
    }
    fn launch_env(&self, store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        self.check_options()?;
        let mut env = LaunchEnv::cleared_for(AgentKind::Codex);
        set_codex_key(&mut env, require_secret(store, keys::OPENAI_API_KEY)?);
        if let Some(url) = &self.base_url {
            env.set(vars::OPENAI_BASE_URL, url.clone());
        }
        if let Some(org) = &self.organization {
            env.set(vars::OPENAI_ORGANIZATION, org.clone());
        }
        if let Some(project) = &self.project {
            env.set(vars::OPENAI_PROJECT, project.clone());
        }
        Ok(env)
    }
}

/// Hosted OpenAI-compatible gateways with a fixed endpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Gateway {
    OpenRouter,
    VercelAiGateway,
}

impl Gateway {
    pub fn base_url(self) -> &'static str {
        match self {
            Gateway::OpenRouter => "https://openrouter.ai/api/v1",
            Gateway::VercelAiGateway => "https://ai-gateway.vercel.sh/v1",
        }
    }

    pub fn secret_key(self) -> &'static str {
        match self {
            Gateway::OpenRouter => keys::OPENROUTER_API_KEY,
            Gateway::VercelAiGateway => keys::VERCEL_AI_GATEWAY_API_KEY,
        }
    }
}

/// Codex through a hosted gateway, with the gateway's own API key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CodexGateway {
    pub gateway: Gateway,
}

impl Provider for CodexGateway {
    fn agent(&self) -> AgentKind {
        AgentKind::Codex
    }
    fn kind(&self) -> &'static str {
        "codex_gateway"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        vec![self.gateway.secret_key()]
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        Ok(())
    }
    fn launch_env(&self, store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        let mut env = LaunchEnv::cleared_for(AgentKind::Codex);
        set_codex_key(&mut env, require_secret(store, self.gateway.secret_key())?);
        env.set(vars::OPENAI_BASE_URL, self.gateway.base_url());
        Ok(env)
    }
}

/// Cursor's agent CLI with a Cursor API key.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CursorApi {}

impl Provider for CursorApi {
    fn agent(&self) -> AgentKind {
        AgentKind::Cursor
    }
    fn kind(&self) -> &'static str {
        "cursor_api"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        vec![keys::CURSOR_API_KEY]
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        Ok(())
    }
    fn launch_env(&self, store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        let mut env = LaunchEnv::cleared_for(AgentKind::Cursor);
        env.set_secret(
            vars::CURSOR_API_KEY,
            require_secret(store, keys::CURSOR_API_KEY)?,
        );
        Ok(env)
    }
}

/// OpenCode with the providers configured in its own auth store.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OpencodeLogin {}

impl Provider for OpencodeLogin {
    fn agent(&self) -> AgentKind {
        AgentKind::Opencode
    }
    fn kind(&self) -> &'static str {
        "opencode_login"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        Vec::new()
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        Ok(())
    }
    fn launch_env(&self, _store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        Ok(LaunchEnv::new())
    }
}

#[cfg(test)]
mod tests {
    use super::super::claude::testutil::{plain, secret};
    use super::super::secret::MemorySecretStore;
    use super::*;

    const KEY: &str = "sk-test-0123456789";

    #[test]
    fn login_clears_api_keys() {
        let env = CodexLogin {}.launch_env(&MemorySecretStore::new()).unwrap();
        assert_eq!(env.set_vars().count(), 0);
        for var in AgentKind::Codex.routing_vars() {
            assert!(env.is_removed(var), "{var}");
        }
    }

    #[test]
    fn openai_api_sets_both_key_vars_and_scopes() {
        let store = MemorySecretStore::with(&[(keys::OPENAI_API_KEY, KEY)]);
        let p = OpenAiApi {
            base_url: Some("https://gw.example/v1".into()),
            organization: Some("org-9".into()),
            project: Some("proj_1".into()),
        };
        let env = p.launch_env(&store).unwrap();
        assert_eq!(secret(&env, vars::OPENAI_API_KEY), Some(KEY));
        assert_eq!(secret(&env, vars::CODEX_API_KEY), Some(KEY));
        assert_eq!(
            plain(&env, vars::OPENAI_BASE_URL),
            Some("https://gw.example/v1")
        );
        assert_eq!(plain(&env, vars::OPENAI_ORGANIZATION), Some("org-9"));
        assert_eq!(plain(&env, vars::OPENAI_PROJECT), Some("proj_1"));

        let bare = OpenAiApi::default().launch_env(&store).unwrap();
        assert!(bare.is_removed(vars::OPENAI_BASE_URL));
        assert!(bare.is_removed(vars::OPENAI_ORGANIZATION));
        assert_eq!(
            OpenAiApi::default().validate(&MemorySecretStore::new()),
            Err(ProviderError::MissingSecret {
                key: keys::OPENAI_API_KEY
            })
        );
        let bad = OpenAiApi {
            project: Some("a b".into()),
            ..Default::default()
        };
        assert!(bad.check_options().is_err());
    }

    #[test]
    fn gateways_use_their_own_key_and_fixed_endpoint() {
        let store = MemorySecretStore::with(&[
            (keys::OPENROUTER_API_KEY, "or-key"),
            (keys::VERCEL_AI_GATEWAY_API_KEY, "vc-key"),
            (keys::OPENAI_API_KEY, "openai-key"),
        ]);
        for (gateway, key, url) in [
            (
                Gateway::OpenRouter,
                "or-key",
                "https://openrouter.ai/api/v1",
            ),
            (
                Gateway::VercelAiGateway,
                "vc-key",
                "https://ai-gateway.vercel.sh/v1",
            ),
        ] {
            let p = CodexGateway { gateway };
            let env = p.launch_env(&store).unwrap();
            assert_eq!(secret(&env, vars::CODEX_API_KEY), Some(key));
            assert_eq!(secret(&env, vars::OPENAI_API_KEY), Some(key));
            assert_eq!(plain(&env, vars::OPENAI_BASE_URL), Some(url));
            assert!(env.is_removed(vars::OPENAI_ORGANIZATION));
            assert_eq!(p.secret_keys(), vec![gateway.secret_key()]);
        }
        let json = serde_json::to_string(&CodexGateway {
            gateway: Gateway::VercelAiGateway,
        })
        .unwrap();
        assert_eq!(json, r#"{"gateway":"vercel_ai_gateway"}"#);
    }

    #[test]
    fn cursor_needs_a_key_and_opencode_touches_nothing() {
        assert_eq!(
            CursorApi {}.validate(&MemorySecretStore::new()),
            Err(ProviderError::MissingSecret {
                key: keys::CURSOR_API_KEY
            })
        );
        let store = MemorySecretStore::with(&[(keys::CURSOR_API_KEY, KEY)]);
        let env = CursorApi {}.launch_env(&store).unwrap();
        assert_eq!(secret(&env, vars::CURSOR_API_KEY), Some(KEY));
        let env = OpencodeLogin {}
            .launch_env(&MemorySecretStore::new())
            .unwrap();
        assert_eq!(env, LaunchEnv::new());
    }
}
