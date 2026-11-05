//! Reason: the `reason` CLI's ACP agent (`crate::reason_acp`).
//!
//! Reason signs in with its own CLI (`reason login`) and picks models
//! server-side, so its only provider is that login: no keys, no routing
//! variables.

use super::env::{AgentKind, LaunchEnv};
use super::provider::{Provider, ProviderError};
use super::secret::SecretStore;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReasonLogin {}

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
        Ok(LaunchEnv::new())
    }
}
