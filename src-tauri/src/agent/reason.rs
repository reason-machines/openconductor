//! Reason: the `reason` CLI's ACP agent (`crate::reason_acp`).
//!
//! Reason picks models server-side, so a provider only says how `reason`
//! authenticates (Settings › Agents › Reason, "Authentication"):
//!
//! * [`ReasonLogin`] is the CLI's own login in `~/.reason`. Its `source`
//!   is the card it was made with: "Reason account" (`app`, the default:
//!   the app runs `reason login` and shows its link and code) or "CLI"
//!   (`cli`: `reason login` in a terminal). Both launch the same way.
//! * [`ReasonApi`] is a Reason API key, handed to `reason` as
//!   `REASON_API_KEY` (`reason acp --help`, 0.2.692: "Sign in with `reason
//!   login` ..., or set REASON_API_KEY").
//!
//! Every provider clears `REASON_API_KEY` first, so a key in the user's
//! shell cannot override the card they chose.

use super::env::{vars, AgentKind, LaunchEnv};
use super::provider::{require_secret, Provider, ProviderError};
use super::secret::{keys, SecretStore};
use serde::{Deserialize, Serialize};

/// Which card made a [`ReasonLogin`].
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LoginSource {
    /// "Reason account": signed in from the app.
    #[default]
    App,
    /// "CLI": `reason login` in a terminal.
    Cli,
}

impl LoginSource {
    fn is_default(&self) -> bool {
        *self == LoginSource::App
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReasonLogin {
    #[serde(default, skip_serializing_if = "LoginSource::is_default")]
    pub source: LoginSource,
}

impl Provider for ReasonLogin {
    fn agent(&self) -> AgentKind {
        AgentKind::Reason
    }
    fn kind(&self) -> &'static str {
        "reason_login"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        Vec::new()
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        Ok(())
    }
    fn launch_env(&self, _store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        Ok(LaunchEnv::cleared_for(AgentKind::Reason))
    }
}

/// A Reason API key (`reason_api_key` in the store).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReasonApi {}

impl Provider for ReasonApi {
    fn agent(&self) -> AgentKind {
        AgentKind::Reason
    }
    fn kind(&self) -> &'static str {
        "reason_api"
    }
    fn secret_keys(&self) -> Vec<&'static str> {
        vec![keys::REASON_API_KEY]
    }
    fn check_options(&self) -> Result<(), ProviderError> {
        Ok(())
    }
    fn launch_env(&self, store: &dyn SecretStore) -> Result<LaunchEnv, ProviderError> {
        let secret = require_secret(store, keys::REASON_API_KEY)?;
        let mut env = LaunchEnv::cleared_for(AgentKind::Reason);
        env.set_secret(vars::REASON_API_KEY, secret);
        Ok(env)
    }
}

#[cfg(test)]
mod tests {
    use super::super::claude::testutil::secret;
    use super::super::secret::{MemorySecretStore, SecretString};
    use super::*;

    #[test]
    fn login_clears_a_shell_api_key() {
        let env = ReasonLogin::default()
            .launch_env(&MemorySecretStore::default())
            .unwrap();
        assert!(env.is_removed(vars::REASON_API_KEY));
    }

    #[test]
    fn api_key_reaches_reason_as_a_secret() {
        let store = MemorySecretStore::default();
        assert!(matches!(
            ReasonApi {}.launch_env(&store),
            Err(ProviderError::MissingSecret { .. })
        ));
        store
            .set(keys::REASON_API_KEY, &SecretString::new("rsn_k"))
            .unwrap();
        let env = ReasonApi {}.launch_env(&store).unwrap();
        assert_eq!(secret(&env, vars::REASON_API_KEY), Some("rsn_k"));
        assert!(!format!("{env:?}").contains("rsn_k"));
    }

    #[test]
    fn login_source_defaults_to_the_app_and_round_trips() {
        let app: ReasonLogin = serde_json::from_str("{}").unwrap();
        assert_eq!(app.source, LoginSource::App);
        assert_eq!(serde_json::to_string(&app).unwrap(), "{}");
        let cli = ReasonLogin {
            source: LoginSource::Cli,
        };
        let json = serde_json::to_string(&cli).unwrap();
        assert_eq!(json, r#"{"source":"cli"}"#);
        assert_eq!(serde_json::from_str::<ReasonLogin>(&json).unwrap(), cli);
    }
}
