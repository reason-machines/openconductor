//! Providers for Codex. Provider kinds
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
}
