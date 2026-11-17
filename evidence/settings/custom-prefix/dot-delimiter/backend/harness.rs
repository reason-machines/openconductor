#![allow(dead_code)]

#[path = "../../../../../src-tauri/src/agent/env.rs"]
pub mod env;
#[path = "../../../../../src-tauri/src/agent/secret.rs"]
pub mod secret;
#[path = "../../../../../src-tauri/src/agent/provider.rs"]
pub mod provider;
#[path = "../../../../../src-tauri/src/agent/claude.rs"]
pub mod claude;
#[path = "../../../../../src-tauri/src/agent/codex.rs"]
pub mod codex;
#[path = "../../../../../src-tauri/src/agent/reason.rs"]
pub mod reason;
#[path = "../../../../../src-tauri/src/agent/byok.rs"]
pub mod byok;

pub mod agent {
    pub use super::{byok, claude, codex, env, provider, reason, secret};
    pub use byok::ProviderConfig;
    pub use env::{AgentKind, LaunchEnv};
    pub use provider::{Provider, ProviderError};
    pub use secret::{MemorySecretStore, SecretStore, SecretString};
}

#[path = "../../../../../src-tauri/src/settings/model.rs"]
mod model;
pub use model::*;

#[derive(Debug)]
pub enum SettingsError {
    Invalid(String),
}

#[path = "../../../../../src-tauri/src/settings/validate.rs"]
pub mod validation;
#[path = "../../../../../src-tauri/src/workspace/naming.rs"]
pub mod naming;

#[cfg(test)]
mod tests {
    use super::*;

    fn custom(prefix: &str) -> Settings {
        let mut settings = Settings::default();
        settings.git.branch_prefix_type = BranchPrefixType::Custom;
        settings.git.branch_prefix = Some(prefix.into());
        settings
    }

    #[test]
    fn dot_prefix_accepts_delimiter_at_production_settings_boundary() {
        let settings = custom("team.");
        assert!(validation::validate(&settings).is_ok());
        assert_eq!(naming::branch_for(settings.git.branch_prefix.as_deref(), "tokyo"), "team.tokyo");
        assert_eq!(settings.git.branch_prefix.as_deref(), Some("team."));
    }

    #[test]
    fn dot_prefix_preserves_invalid_component_and_ref_guards() {
        for prefix in ["", ".team", "team..", "team space", "team.lock", "team./", "team.//", "team@{branch", "-team", "team//", "/team", "team\\branch"] {
            assert!(validation::validate(&custom(prefix)).is_err(), "{prefix:?} was accepted");
        }
    }

    #[test]
    fn dot_prefix_preserves_other_delimiters_and_modes() {
        for (prefix, branch) in [("myname-", "myname-tokyo"), ("team_", "team_tokyo"), ("feature/", "feature/tokyo"), ("team", "team/tokyo"), ("team/ui-", "team/ui-tokyo")] {
            let settings = custom(prefix);
            assert!(validation::validate(&settings).is_ok(), "{prefix}");
            assert_eq!(naming::branch_for(settings.git.branch_prefix.as_deref(), "tokyo"), branch);
        }
        for mode in [BranchPrefixType::GithubUsername, BranchPrefixType::None] {
            let mut settings = Settings::default();
            settings.git.branch_prefix_type = mode;
            assert!(validation::validate(&settings).is_ok());
        }
    }
}
